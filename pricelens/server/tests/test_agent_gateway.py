"""Agent 模型服务网关端到端测试（python3 -m unittest discover -s server/tests，仓库 pricelens/ 下运行）。

在一个临时「部署目录」里起真实的 PriceLens 服务器，另起一个假的 OpenAI 兼容服务商，
验证 /api/agent/* 的配置存取、拉模型、测试连接、/runs 事件流，以及上游不可用时的回退信封。
不触碰 server/data 下的任何真实数据与密钥。
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PRICLENS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # pricelens/
GOOD_KEY = "good"

BASELINE = {
    "intent": "query", "summary": "本地基线结论", "steps": [], "cards": [], "citations": [],
    "suggestions": ["基线建议"], "contextFingerprint": "fp-1",
}


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FakeUpstream(BaseHTTPRequestHandler):
    """假的 OpenAI 兼容服务商：/v1/models 与 /v1/chat/completions（流式 / 非流式）。"""

    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get("Authorization") != "Bearer " + GOOD_KEY:
            return self._json({"error": {"message": "bad key"}}, 401)
        if self.path == "/v1/models":
            return self._json({"data": [{"id": "m-b"}, {"id": "m-a"}]})
        self._json({"error": {"message": "not found"}}, 404)

    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if self.path != "/v1/chat/completions":
            return self._json({"error": {"message": "not found"}}, 404)
        if self.headers.get("Authorization") != "Bearer " + GOOD_KEY:
            return self._json({"error": {"message": "bad key"}}, 401)
        if req.get("model") == "ghost":
            return self._json({"error": {"message": "model not found"}}, 404)
        if not req.get("stream"):
            return self._json({"choices": [{"message": {"content": "OK"}}]})
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Connection", "close")
        self.end_headers()
        pieces = ['{"summary":"', '模型改写的结论","suggestions":["追问一"],', '"intent":"query"}']
        for piece in pieces:
            chunk = {"choices": [{"delta": {"content": piece, "reasoning_content": "内部推理不得外露"}}]}
            self.wfile.write(("data: " + json.dumps(chunk, ensure_ascii=False) + "\n\n").encode("utf-8"))
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()
        self.close_connection = True


class AgentGatewayTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = ThreadingHTTPServer(("127.0.0.1", 0), FakeUpstream)
        cls.upstream_port = cls.upstream.server_address[1]
        threading.Thread(target=cls.upstream.serve_forever, daemon=True).start()

        cls.deploy = tempfile.mkdtemp(prefix="pricelens-agent-test-")
        for name in ("server.py", "ingest_pack.py", "psi_linkage.py", "xlsx_reader.py", "agent_gateway.py"):
            shutil.copy(os.path.join(PRICLENS, "server", name), cls.deploy)
        shutil.copy(os.path.join(PRICLENS, "src", "data", "dim_region.json"), cls.deploy)
        shutil.copy(os.path.join(PRICLENS, "src", "agentService", "providers.generated.json"),
                    os.path.join(cls.deploy, "agent_providers.json"))
        os.makedirs(os.path.join(cls.deploy, "data"), exist_ok=True)
        cls.port = free_port()
        env = dict(os.environ, PRICLENS_PORT=str(cls.port))
        cls.server = subprocess.Popen([sys.executable, "-X", "utf8", "server.py"], cwd=cls.deploy, env=env,
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                with urllib.request.urlopen("http://127.0.0.1:%d/api/ping" % cls.port, timeout=2) as res:
                    if json.load(res).get("ok"):
                        break
            except Exception:
                time.sleep(0.3)
        else:
            raise RuntimeError("测试用 PriceLens 服务器没有起来")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        try:
            cls.server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            cls.server.kill()
        cls.upstream.shutdown()
        shutil.rmtree(cls.deploy, ignore_errors=True)

    def setUp(self):
        # 用例共用同一个服务器：每个用例从「未配置」开始，互不依赖执行顺序
        path = os.path.join(self.deploy, "data", "agent-providers.json")
        if os.path.exists(path):
            os.remove(path)

    def call(self, method, path, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request("http://127.0.0.1:%d%s" % (self.port, path), data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=40) as res:
                return res.status, res.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8")

    def json_call(self, method, path, body=None):
        status, text = self.call(method, path, body)
        return status, json.loads(text)

    def state_file(self):
        with open(os.path.join(self.deploy, "data", "agent-providers.json"), encoding="utf-8") as f:
            return f.read()

    # ---- 配置存取 ----

    def test_presets_come_from_registry_and_first_batch_is_present(self):
        status, body = self.json_call("GET", "/api/agent/providers")
        self.assertEqual(status, 200)
        ids = [p["id"] for p in body["presets"]]
        for expected in ("zhipu", "moonshot", "deepseek", "bailian", "siliconflow", "openai",
                         "anthropic", "openrouter", "ollama", "lmstudio", "custom"):
            self.assertIn(expected, ids)
        self.assertEqual(ids[-1], "custom")  # 自定义永远是列表最后一项
        zhipu = next(p for p in body["presets"] if p["id"] == "zhipu")
        self.assertTrue(zhipu["requiresKey"])
        self.assertIn("glm-5.3-flash", [m["id"] for m in zhipu["presetModels"]])
        self.assertEqual(body["active"], None)

    def test_save_then_read_never_leaks_key(self):
        status, _ = self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        self.assertEqual(status, 200)
        status, text = self.call("GET", "/api/agent/providers")
        self.assertEqual(status, 200)
        self.assertNotIn(GOOD_KEY, text)
        body = json.loads(text)
        rec = body["providers"]["custom"]
        self.assertTrue(rec["hasKey"])
        self.assertNotIn("apiKey", rec)
        self.assertEqual(body["active"], {"provider": "custom", "model": "m-a"})

    def test_changing_key_or_model_clears_stale_test_status(self):
        self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        _, body = self.json_call("POST", "/api/agent/test", {"provider": "custom", "model": "m-a"})
        self.assertTrue(body["ok"])
        _, body = self.json_call("POST", "/api/agent/providers", self.custom(key="another-key"))
        rec = body["providers"]["custom"]
        self.assertIsNone(rec.get("status"))  # 旧密钥测出的「已连接」不能挂在新密钥上
        self.assertEqual(rec["hasKey"], True)

    def test_remove_provider_deletes_key_and_clears_active(self):
        self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        status, body = self.json_call("POST", "/api/agent/providers", {"provider": "custom", "remove": True})
        self.assertEqual(status, 200)
        self.assertNotIn("custom", body["providers"])
        self.assertIsNone(body["active"])
        self.assertNotIn(GOOD_KEY, self.state_file())

    def test_active_null_returns_to_local_engine(self):
        self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        status, body = self.json_call("POST", "/api/agent/active", None)
        self.assertEqual(status, 200)
        self.assertIsNone(body["active"])
        status, body = self.json_call("POST", "/api/agent/runs", self.run_request())
        self.assertEqual(status, 502)
        self.assertEqual(body["fallback"], BASELINE)

    def test_empty_body_on_other_routes_is_a_client_error_not_a_crash(self):
        status, body = self.json_call("POST", "/api/agent/models", None)
        self.assertEqual(status, 400)
        self.assertIn("error", body)

    def test_provider_requiring_key_is_rejected_without_one(self):
        status, body = self.json_call("POST", "/api/agent/providers", {"provider": "zhipu"})
        self.assertEqual(status, 400)
        self.assertIn("API Key", body["error"])

    def test_empty_key_keeps_saved_key_and_clear_key_removes_it(self):
        self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        self.json_call("POST", "/api/agent/providers", self.custom(key=""))
        self.assertIn(GOOD_KEY, self.state_file())  # 空密钥 = 保留原密钥
        self.json_call("POST", "/api/agent/providers", self.custom(clearKey=True, key=None))
        self.assertNotIn(GOOD_KEY, self.state_file())

    # ---- 拉模型 / 测试连接 ----

    def test_fetch_models_uses_saved_key(self):
        self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        status, body = self.json_call("POST", "/api/agent/models", {"provider": "custom"})
        self.assertEqual((status, body["ok"], body["models"]), (200, True, ["m-a", "m-b"]))

    def test_fetch_models_failure_is_explained(self):
        status, body = self.json_call("POST", "/api/agent/models", self.custom(key="wrong") | {"provider": "custom"})
        self.assertEqual(status, 200)
        self.assertFalse(body["ok"])
        self.assertEqual(body["models"], [])
        self.assertIn("Key 无效", body["message"])

    def test_connection_reports_latency_and_human_readable_errors(self):
        self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        status, body = self.json_call("POST", "/api/agent/test", {"provider": "custom", "model": "m-a"})
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"], body)
        self.assertEqual(body["model"], "m-a")
        self.assertIsInstance(body["latencyMs"], int)
        _, body = self.json_call("POST", "/api/agent/test", {"provider": "custom", "model": "m-a", "apiKey": "wrong"})
        self.assertFalse(body["ok"])
        self.assertIn("Key 无效", body["message"])
        self.assertNotIn("401", body["message"])  # 不弹原始状态码报错
        _, body = self.json_call("POST", "/api/agent/test", {"provider": "custom", "model": "ghost"})
        self.assertFalse(body["ok"])
        self.assertIn("模型不存在", body["message"])
        _, body = self.json_call("POST", "/api/agent/test", {"provider": "custom", "model": "m-a",
                                                            "baseUrl": "http://127.0.0.1:%d" % free_port()})
        self.assertFalse(body["ok"])
        self.assertIn("连不上", body["message"])

    # ---- /runs 事件流 ----

    def run_request(self):
        return {"text": "R国 Pura 现在什么价", "runId": "run-test",
                "context": {"page": "price", "state": {"countryCode": "RU", "mains": []}, "alerts": []},
                "baseline": BASELINE}

    def parse_frames(self, text):
        frames, name = [], None
        for block in text.split("\n\n"):
            for line in block.splitlines():
                if line.startswith("event: "):
                    name = line[7:]
                elif line.startswith("data: "):
                    frames.append((name, json.loads(line[6:])))
        return frames

    def test_runs_streams_narrative_and_keeps_baseline_facts(self):
        status, _ = self.json_call("POST", "/api/agent/providers", self.custom(key=GOOD_KEY))
        self.assertEqual(status, 200)
        status, text = self.call("POST", "/api/agent/runs", self.run_request())
        self.assertEqual(status, 200)
        names = [n for n, _ in self.parse_frames(text)]
        self.assertEqual(names[0], "run.status")
        self.assertEqual(names[-1], "run.completed")
        self.assertIn("step.updated", names)
        response = next(p["response"] for n, p in self.parse_frames(text) if n == "response")
        self.assertEqual(response["summary"], "模型改写的结论")  # 叙述来自模型
        self.assertEqual(response["suggestions"], ["追问一"])  # 建议来自模型（≤3）
        self.assertEqual(response["contextFingerprint"], "fp-1")  # 基线事实原样保留
        self.assertEqual(response["provider"], {"name": "本机模型服务", "model": "m-a"})
        self.assertNotIn("内部推理不得外露", text)  # reasoning_content 不进任何帧
        sequences = [p["event"]["sequence"] for n, p in self.parse_frames(text) if "event" in p]
        self.assertEqual(sequences, sorted(sequences))  # 事件序号递增（前端 isAgentEvent 校验）

    def test_runs_without_config_returns_fallback_envelope(self):
        self.json_call("POST", "/api/agent/active", None)
        status, body = self.json_call("POST", "/api/agent/runs", self.run_request())
        self.assertEqual(status, 502)
        self.assertEqual(body["fallback"], BASELINE)  # 前端据此落本地兜底
        self.assertIn("尚未配置", body["error"])

    def test_runs_with_dead_upstream_returns_fallback_envelope(self):
        self.json_call("POST", "/api/agent/providers", self.custom(
            key=GOOD_KEY, baseUrl="http://127.0.0.1:%d/v1" % free_port()))
        status, body = self.json_call("POST", "/api/agent/runs", self.run_request())
        self.assertEqual(status, 502)
        self.assertEqual(body["fallback"], BASELINE)

    def test_runs_rejects_request_without_usable_baseline(self):
        status, body = self.json_call("POST", "/api/agent/runs", {"text": "你好"})
        self.assertEqual(status, 400)
        self.assertIn("baseline", body["error"])

    # ---- 工具 ----

    def custom(self, key=None, baseUrl=None, clearKey=False):
        body = {"provider": "custom", "enabled": True, "model": "m-a",
                "baseUrl": baseUrl or "http://127.0.0.1:%d/v1" % self.upstream_port}
        if key is not None:
            body["apiKey"] = key
        if clearKey:
            body["clearKey"] = True
        return body


if __name__ == "__main__":
    unittest.main()
