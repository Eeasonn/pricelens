"""Agent 模型服务网关（2026-11-26 内网部署 · Agent 模型服务规范「Provider Registry + 配置 UI」）。

本机 Python 服务器自带的 /api/agent/* 端点——内网够不着线上 Cloudflare 网关，由本机
服务器自己实现同一套 /runs 契约（移植自 gateway/src/handlers.ts + glm.ts + prompt.ts +
merge.ts + validate.ts），把请求转发给用户配置的 OpenAI 兼容服务商：

  GET  /api/agent/providers   预置注册表（models.dev 生成）+ 已保存配置（密钥永不回传，只给 hasKey）
  POST /api/agent/providers   保存某家配置（apiKey 为空 = 保留原密钥；clearKey = 删除）
  POST /api/agent/active      切换当前模型 {provider, model}；null = 取消
  POST /api/agent/models      拉模型列表（服务器代发 GET {baseUrl}/models，免浏览器跨域）
  POST /api/agent/test        测试连接（用选定模型发一次最小真实请求，错误翻译成人话）
  POST /api/agent/runs        Agent 运行：固定提示词 + 流式 chat/completions；模型只改写
                              叙述与建议，数字 / 卡片 / 引用原样保留本地确定性引擎的 baseline

密钥只落 data/agent-providers.json（不进 config.json 与配置导出），任何响应、日志都不出现
明文。服务器只绑 127.0.0.1，每台机器各起各的——「当前模型」是机器级设置。
"""
import json
import os
import re
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
import ipaddress
from urllib.parse import urlparse
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = None  # init() 设定：data/agent-providers.json
PRESETS_PATH = None  # init() 设定：部署包 agent_providers.json / 开发态 src/agentService
LOCK = threading.RLock()

MAX_REQUEST_BYTES = 512_000
MAX_TEXT_LENGTH = 4_000
AGENT_INTENTS = ["filter", "query", "forecast_explain", "alert", "price_advantage", "price_alert", "clarify"]
CARD_KINDS = ["filter", "table", "chart", "alert", "forecast_explanation", "price_advantage", "tool_call"]
NARRATIVE_FRAME_LIMIT = 40
NARRATIVE_PREVIEW_CHARS = 120
TEMPERATURE = 0.2
MAX_TOKENS = 1024
UPSTREAM_TIMEOUT_S = 20  # 单一截止线：打开上游 + 消费流（前端 30s 超时内必须出正文）
PROVIDER_NAME = "本机模型服务"

AGENT_INSTRUCTIONS = (
    '你是 PriceLens 的叙述助手，负责帮助价格分析师理解当前看板。\n'
    '你必须只输出一个 JSON 对象，不要 Markdown，不要代码围栏。字段必须是：\n'
    '{"summary":"中文简洁结论","suggestions":["最多3条后续问题"],"intent":"%s"}\n'
    '本地确定性引擎已经给出 baseline：其中的数字、平台、产品和预警事实已经过数据引擎计算，'
    '不得编造、修改或补算数字。\n'
    '你的任务是结合用户问题和 baseline，改写一段清楚的中文结论，并给出最多三条有用的后续问题。\n'
    '如果用户要求改变筛选，必须保留“先预览、确认后应用”的语义；如果是预警解释，必须区分触发事实'
    '和待核查原因，不把相关性写成确定因果。'
) % "|".join(AGENT_INTENTS)


class ApiError(Exception):
    """配置类错误：message 直接回给用户，status 为 HTTP 状态码。"""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def init(data_dir):
    """server.py 导入后调用：定位状态文件与预置注册表。"""
    global STATE_PATH, PRESETS_PATH
    STATE_PATH = os.path.join(data_dir, "agent-providers.json")
    candidates = [
        os.path.join(HERE, "agent_providers.json"),  # 部署包
        os.path.join(os.path.dirname(HERE), "src", "agentService", "providers.generated.json"),  # 开发态
    ]
    PRESETS_PATH = next((p for p in candidates if os.path.exists(p)), None)


# ---------------------------------------------------------------- 注册表与状态

def _presets():
    if not PRESETS_PATH:
        return []
    try:
        with open(PRESETS_PATH, "r", encoding="utf-8") as f:
            return json.load(f).get("providers") or []
    except (OSError, ValueError):
        traceback.print_exc()
        return []


def _preset(pid):
    return next((p for p in _presets() if p.get("id") == pid), None)


def _load_state():
    empty = {"version": 1, "active": None, "providers": {}}
    if not STATE_PATH or not os.path.exists(STATE_PATH):
        return empty
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as f:
            st = json.load(f)
    except (OSError, ValueError):
        traceback.print_exc()
        return empty
    if not isinstance(st, dict):
        return empty
    st.setdefault("active", None)
    st.setdefault("providers", {})
    return st


def _save_state(st):
    os.makedirs(os.path.dirname(STATE_PATH) or ".", exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=2)
    os.replace(tmp, STATE_PATH)


def _public(rec):
    """已保存配置的对外形态：只暴露 hasKey，绝不带 apiKey。"""
    out = {k: rec.get(k) for k in ("enabled", "baseUrl", "models", "model", "status", "testedAt", "latencyMs", "lastError")}
    out["hasKey"] = bool(rec.get("apiKey"))
    return out


def public_state():
    with LOCK:
        st = _load_state()
    return {
        "presets": _presets(),
        "active": st.get("active"),
        "providers": {pid: _public(rec) for pid, rec in st["providers"].items()},
        "service": "local",
    }


def save_provider(payload):
    pid = str(payload.get("provider") or "").strip()
    preset = _preset(pid)
    if preset is None:
        raise ApiError("未知服务商", 400)
    if preset.get("comingSoon"):
        raise ApiError("该服务商即将支持，暂不可配置", 400)
    with LOCK:
        st = _load_state()
        # 删除已存配置（连同密钥）；若它正是当前模型，一并取消，回到本地引擎
        if payload.get("remove"):
            st["providers"].pop(pid, None)
            if (st.get("active") or {}).get("provider") == pid:
                st["active"] = None
            _save_state(st)
            return public_state()
        rec = dict(st["providers"].get(pid) or {})
        old_key, old_base, old_model = rec.get("apiKey"), rec.get("baseUrl"), rec.get("model")
        rec["enabled"] = bool(payload.get("enabled", True))
        base = str(payload.get("baseUrl") or "").strip().rstrip("/")
        rec["baseUrl"] = base or str(preset.get("defaultBaseUrl") or "").rstrip("/")
        if not rec["baseUrl"]:
            raise ApiError("服务地址不能为空", 400)
        if preset.get("protocol") == "anthropic":
            raise ApiError("该服务商协议尚未适配（即将支持）", 400)
        if payload.get("clearKey"):
            rec.pop("apiKey", None)
        key = payload.get("apiKey")
        if isinstance(key, str) and key.strip():
            rec["apiKey"] = key.strip()
        if preset.get("requiresKey") and not rec.get("apiKey"):
            raise ApiError("该服务商需要 API Key", 400)
        models = payload.get("models")
        if isinstance(models, list):
            rec["models"] = sorted({str(m).strip() for m in models if str(m).strip()})
        if not rec.get("models"):
            rec["models"] = [m["id"] for m in preset.get("presetModels") or []]
        model = str(payload.get("model") or "").strip() or rec.get("model") or ""
        if model and model not in rec["models"]:
            rec["models"] = sorted(rec["models"] + [model])
        rec["model"] = model or (rec["models"][0] if rec["models"] else "")
        if not rec["model"]:
            raise ApiError("请先选择或填写一个模型", 400)
        if rec["enabled"] and (payload.get("makeActive") or not st.get("active")):
            st["active"] = {"provider": pid, "model": rec["model"]}
        if not rec["enabled"] and (st.get("active") or {}).get("provider") == pid:
            st["active"] = None  # 停用的服务商不能继续当当前模型
        # 密钥 / 地址 / 模型变了 = 之前的测试结果不再对应当前配置：清掉，要求重新测试
        if (rec.get("apiKey"), rec.get("baseUrl"), rec.get("model")) != (old_key, old_base, old_model):
            for k in ("status", "testedAt", "latencyMs", "lastError"):
                rec.pop(k, None)
        st["providers"][pid] = rec
        _save_state(st)
    return public_state()


def set_active(payload):
    with LOCK:
        st = _load_state()
        if not payload or not payload.get("provider"):
            st["active"] = None
        else:
            pid = str(payload.get("provider"))
            model = str(payload.get("model") or "").strip()
            rec = st["providers"].get(pid)
            preset = _preset(pid)
            if not rec or not preset:
                raise ApiError("该服务商尚未保存配置", 400)
            if not rec.get("enabled"):
                raise ApiError("该服务商已停用，请先启用", 400)
            if not model or model not in (rec.get("models") or []):
                raise ApiError("模型不在该服务商的模型列表里", 400)
            st["active"] = {"provider": pid, "model": model}
        _save_state(st)
    return public_state()


def _effective(payload):
    """测试连接 / 拉模型时的生效配置：已保存配置 + 本次表单临时值（未保存也能测）。"""
    pid = str(payload.get("provider") or "").strip()
    preset = _preset(pid)
    if preset is None:
        raise ApiError("未知服务商", 400)
    with LOCK:
        rec = dict(_load_state()["providers"].get(pid) or {})
    base = (str(payload.get("baseUrl") or "").strip() or rec.get("baseUrl") or preset.get("defaultBaseUrl") or "").rstrip("/")
    if not base:
        raise ApiError("服务地址不能为空", 400)
    key = payload.get("apiKey") if isinstance(payload.get("apiKey"), str) and payload.get("apiKey") else rec.get("apiKey") or ""
    if preset.get("requiresKey") and not key:
        raise ApiError("请先填写 API Key", 400)
    return preset, base, key


# ---------------------------------------------------------------- 上游请求

class UpstreamError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


def describe_error(exc):
    """把上游异常翻译成用户能看懂的原因（规范第 3 节：禁止只弹原始报错）。"""
    if isinstance(exc, urllib.error.HTTPError):
        code = exc.code
        detail = ""
        try:
            body = exc.read(2000).decode("utf-8", "replace")
            err = (json.loads(body) or {}).get("error") or {}
            if isinstance(err, dict):
                detail = str(err.get("message") or err.get("code") or "")[:160]
            elif isinstance(err, str):
                detail = err[:160]
        except Exception:  # noqa: BLE001 —— 上游错误体不是 JSON 时忽略
            detail = ""
        reason = {
            401: "API Key 无效或已失效",
            403: "API Key 无权限访问该模型",
            404: "服务地址或模型不存在（检查高级设置里的地址与模型 ID）",
            429: "请求过于频繁或额度不足",
        }.get(code, "服务商暂时不可用（HTTP %d）" % code)
        return reason + (f"：{detail}" if detail else "")
    if isinstance(exc, urllib.error.URLError):
        reason = getattr(exc, "reason", None)
        if isinstance(reason, (TimeoutError,)) or "timed out" in str(reason).lower():
            return "连接超时：服务地址不通或响应过慢"
        if isinstance(reason, ConnectionRefusedError) or "refused" in str(reason).lower():
            return "连不上服务：请确认服务已启动，地址与端口正确"
        if "name or service" in str(reason).lower() or "getaddrinfo" in str(reason).lower():
            return "域名解析失败：检查服务地址，或内网是否需要代理"
        return "网络错误：连不上服务地址（%s）" % str(reason)[:80]
    if isinstance(exc, TimeoutError):
        return "连接超时：服务地址不通或响应过慢"
    if isinstance(exc, UpstreamError):
        return exc.message
    return "请求失败：%s" % (exc.__class__.__name__)


def _is_local_host(host):
    """回环 / 私有地址 = 本机或内网服务，一律不走代理（urllib 默认会读系统代理，
    连 127.0.0.1 也被送进代理，本地模型服务直接不可达）；公网服务商照常走系统代理。"""
    host = (host or "").lower().strip("[]")
    if host in ("localhost", "::1"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_loopback or ip.is_private or ip.is_link_local


def _open(req, timeout):
    if _is_local_host(urlparse(req.full_url).hostname):
        return urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=timeout)
    return urllib.request.urlopen(req, timeout=timeout)


def _request(base, path, key, body=None, timeout=15.0):
    """OpenAI 兼容请求；返回已打开的响应（流式由调用方逐行读）。"""
    url = base.rstrip("/") + path
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data is not None else "GET")
    req.add_header("Accept", "text/event-stream" if body is not None and body.get("stream") else "application/json")
    req.add_header("Content-Type", "application/json")
    if key:
        req.add_header("Authorization", "Bearer " + key)
    return _open(req, timeout)


def _chat_body(model, messages, stream, preset, max_tokens=MAX_TOKENS, compat=False):
    body = {"model": model, "stream": stream, "messages": messages}
    if preset.get("extraBody"):
        body.update(preset["extraBody"])
    if compat:
        # 部分新模型拒收 max_tokens / temperature（如 OpenAI 推理系列）：400 提到 max_tokens 时改参重试
        body["max_completion_tokens"] = max_tokens
    else:
        body["temperature"] = TEMPERATURE
        body["max_tokens"] = max_tokens
    return body


def list_models(payload):
    preset, base, key = _effective(payload)
    try:
        with _request(base, "/models", key, timeout=15.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "models": [], "message": describe_error(e)}
    items = data.get("data") if isinstance(data, dict) else None
    ids = sorted({str(m.get("id")) for m in (items or []) if isinstance(m, dict) and m.get("id")})
    if not ids:
        return {"ok": False, "models": [], "message": "服务没有返回模型列表"}
    return {"ok": True, "models": ids, "message": ""}


def _chat_once(base, key, model, messages, preset, timeout):
    """非流式最小请求；400 且上游提到 max_tokens 时按新参数名重试一次。"""
    try:
        with _request(base, "/chat/completions", key, _chat_body(model, messages, False, preset), timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 400:
            body = ""
            try:
                body = e.read(4000).decode("utf-8", "replace")
            except Exception:  # noqa: BLE001
                body = ""
            if "max_tokens" in body or "temperature" in body:
                with _request(base, "/chat/completions", key, _chat_body(model, messages, False, preset, compat=True), timeout) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            raise
        raise


def test_provider(payload):
    preset, base, key = _effective(payload)
    model = str(payload.get("model") or "").strip()
    if not model:
        raise ApiError("请先选择一个模型", 400)
    started = time.time()
    try:
        _chat_once(base, key, model, [{"role": "user", "content": "只回复两个字母：OK"}], preset, 30.0)
    except Exception as e:  # noqa: BLE001
        message = describe_error(e)
        _record_test(payload, "failed", None, message)
        return {"ok": False, "latencyMs": None, "model": model, "message": message}
    latency = int((time.time() - started) * 1000)
    _record_test(payload, "connected", latency, "")
    return {"ok": True, "latencyMs": latency, "model": model, "message": "连接成功"}


def _record_test(payload, status, latency, message):
    """测的是已保存的那份配置（没带临时地址 / 密钥）时，把结果记进状态。"""
    if payload.get("baseUrl") or payload.get("apiKey"):
        return
    pid = str(payload.get("provider") or "")
    with LOCK:
        st = _load_state()
        if pid not in st["providers"]:
            return
        rec = st["providers"][pid]
        rec["status"] = status
        rec["testedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        rec["latencyMs"] = latency
        rec["lastError"] = message
        _save_state(st)


# ---------------------------------------------------------------- /runs（移植 gateway/src）

def _is_response_shape(value):
    if not isinstance(value, dict):
        return False
    if str(value.get("intent")) not in AGENT_INTENTS:
        return False
    if not isinstance(value.get("summary"), str) or not isinstance(value.get("contextFingerprint"), str):
        return False
    if not all(isinstance(value.get(k), list) for k in ("steps", "cards", "citations", "suggestions")):
        return False
    provider = value.get("provider")
    if provider is not None and (not isinstance(provider, dict) or not isinstance(provider.get("name"), str)
                                 or not isinstance(provider.get("model"), str)):
        return False
    for entry in value["suggestions"]:
        if isinstance(entry, str):
            continue
        if not (isinstance(entry, dict) and isinstance(entry.get("label"), str) and isinstance(entry.get("prompt"), str)):
            return False
    return all(isinstance(card, dict) and str(card.get("kind")) in CARD_KINDS for card in value["cards"])


def parse_run_request(raw):
    if len(raw) > MAX_REQUEST_BYTES:
        return {"ok": False, "status": 413, "error": "请求体过大"}
    try:
        body = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {"ok": False, "status": 400, "error": "请求体必须是合法 JSON"}
    record = body if isinstance(body, dict) else {}
    text = record.get("text")
    if not isinstance(text, str) or not text.strip():
        return {"ok": False, "status": 400, "error": "缺少用户问题"}
    if len(text) > MAX_TEXT_LENGTH:
        return {"ok": False, "status": 413, "error": "用户问题不能超过 %d 个字符" % MAX_TEXT_LENGTH}
    context = record.get("context")
    if context is not None and not isinstance(context, dict):
        return {"ok": False, "status": 400, "error": "context 必须是对象"}
    if not _is_response_shape(record.get("baseline")):
        return {"ok": False, "status": 400, "error": "缺少可用的 baseline（本地确定性引擎结果）；网关拒绝无基线请求"}
    return {"ok": True, "request": {
        "text": text, "baseline": record["baseline"], "context": context,
        "runId": str(record.get("runId") or record.get("clientRequestId") or "run-%d" % int(time.time() * 1000)),
    }}


def build_messages(request):
    state = (request.get("context") or {}).get("state") or {}
    alerts = (request.get("context") or {}).get("alerts")
    compact = {
        "userText": request["text"][:MAX_TEXT_LENGTH],
        "page": (request.get("context") or {}).get("page"),
        "state": {
            "countryCode": state.get("countryCode"), "industry": state.get("industry"),
            "rangeStart": state.get("rangeStart"), "rangeEnd": state.get("rangeEnd"),
            "currency": state.get("currency"), "granularity": state.get("granularity"),
            "agg": state.get("agg"), "priceTypes": state.get("priceTypes"),
            "mains": state.get("mains")[:50] if isinstance(state.get("mains"), list) else [],
        },
        "alerts": alerts[:20] if isinstance(alerts, list) else [],
        "baseline": request["baseline"],
    }
    return [
        {"role": "system", "content": AGENT_INSTRUCTIONS},
        {"role": "user", "content": json.dumps(compact, ensure_ascii=False)},
    ]


def parse_model_json(text):
    """从模型自由文本里抠 JSON：容忍 Markdown 围栏与前后杂讯。"""
    if not text:
        return None
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    src = fenced.group(1) if fenced else text
    first, last = src.find("{"), src.rfind("}")
    if first < 0 or last <= first:
        return None
    try:
        value = json.loads(src[first:last + 1])
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def merge_model_narrative(baseline, narrative, model):
    raw_intent = (narrative or {}).get("intent")
    intent = raw_intent if isinstance(raw_intent, str) and raw_intent in AGENT_INTENTS else baseline["intent"]
    summary = (narrative or {}).get("summary")
    raw_sug = (narrative or {}).get("suggestions")
    picks = [s.strip() for s in (raw_sug if isinstance(raw_sug, list) else []) if isinstance(s, str) and s.strip()]
    return dict(baseline, **{
        "intent": intent,
        "summary": summary.strip() if isinstance(summary, str) and summary.strip() else baseline["summary"],
        "suggestions": (picks or list(baseline["suggestions"]))[:3],
        "provider": {"name": PROVIDER_NAME, "model": model},
        "provenance": dict(baseline.get("provenance") or {}, source="local-gateway", provider=PROVIDER_NAME,
                           model=model, generatedAt=_now_iso()),
    })


def fallback_response(baseline, model):
    return dict(baseline, **{
        "provider": {"name": PROVIDER_NAME + " 回退基线", "model": model},
        "provenance": dict(baseline.get("provenance") or {}, source="local-gateway-fallback", provider=PROVIDER_NAME,
                           model=model, generatedAt=_now_iso()),
    })


def _now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _extract_delta(payload):
    try:
        delta = (payload.get("choices") or [{}])[0].get("delta") or {}
    except AttributeError:
        return ""
    content = delta.get("content")
    return content if isinstance(content, str) else ""


def consume_stream(resp, on_delta):
    """逐行消费上游 SSE：只取 data: 行的 choices[0].delta.content；reasoning_content 不进叙述。"""
    full = ""
    for raw_line in resp:
        line = raw_line.decode("utf-8", "replace").rstrip("\r\n")
        if not line.startswith("data:"):
            continue
        data = line[5:].lstrip()
        if not data or data == "[DONE]":
            continue
        try:
            payload = json.loads(data)
        except ValueError:
            continue
        delta = _extract_delta(payload)
        if delta:
            full += delta
            on_delta(full)
    return full


def handle_runs(handler, raw):
    parsed = parse_run_request(raw)
    if not parsed["ok"]:
        return handler._send_json({"error": parsed["error"]}, parsed["status"])
    request = parsed["request"]
    baseline = request["baseline"]
    run_id = request["runId"]
    with LOCK:
        state = _load_state()
    active = state.get("active") or {}
    preset = _preset(str(active.get("provider") or ""))
    record = state["providers"].get(str(active.get("provider") or ""))
    model = str(active.get("model") or "")
    if not preset or not record or not record.get("enabled") or not model:
        return handler._send_json({"error": "尚未配置模型服务（配置页 → Agent 模型服务）", "fallback": baseline}, 502)
    key = record.get("apiKey") or ""
    if preset.get("requiresKey") and not key:
        return handler._send_json({"error": "该服务商缺少 API Key（配置页 → Agent 模型服务）", "fallback": baseline}, 502)
    base = record.get("baseUrl") or preset.get("defaultBaseUrl") or ""
    # 先打开上游流再下发 200：上游拒绝 / 超时仍能回非 2xx + fallback 信封，前端自然落本地兜底
    try:
        upstream = _request(base, "/chat/completions", key, _chat_body(model, build_messages(request), True, preset), UPSTREAM_TIMEOUT_S)
    except Exception as e:  # noqa: BLE001 —— 不把上游响应体或授权信息写进响应
        print("[pricelens-server] 模型服务请求失败：%s" % describe_error(e))
        return handler._send_json({"error": "模型服务暂时不可用", "fallback": baseline}, 502)

    provenance = {"source": "local-gateway", "provider": PROVIDER_NAME, "model": model}
    seq = [0]

    def push(name, payload):
        frame = "event: %s\ndata: %s\n\n" % (name, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        handler.wfile.write(frame.encode("utf-8"))
        handler.wfile.flush()

    def event(etype, message, status=None):
        seq[0] += 1
        body = {"id": "%s-%s-%d" % (run_id, etype, seq[0]), "runId": run_id, "sequence": seq[0], "type": etype}
        if status:
            body["status"] = status
        body.update({"timestamp": _now_iso(), "message": message, "provenance": provenance})
        return body

    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Connection", "close")
    handler.end_headers()
    handler.close_connection = True
    frames = [0]
    deadline = time.time() + UPSTREAM_TIMEOUT_S

    def on_delta(accumulated):
        if time.time() > deadline:
            raise UpstreamError("模型响应超时（%ds）" % UPSTREAM_TIMEOUT_S)
        if frames[0] >= NARRATIVE_FRAME_LIMIT:
            return
        frames[0] += 1
        preview = re.sub(r"\s+", " ", accumulated).strip()[:NARRATIVE_PREVIEW_CHARS]
        push("step.updated", {"event": event("step.updated", "叙述生成中：%s" % preview, "running")})

    try:
        push("run.status", {"event": event("run.started", "模型服务已接收请求", "running")})
        full = consume_stream(upstream, on_delta)
        response = merge_model_narrative(baseline, parse_model_json(full), model)
        push("response", {"type": "response", "response": response})
        push("run.completed", {"event": event("run.completed", "模型服务已完成运行", "completed")})
    except (BrokenPipeError, ConnectionResetError):
        handler.close_connection = True  # 浏览器中途断开：静默收尾
    except Exception as e:  # noqa: BLE001 —— 头已发出，只能以 run.failed + 基线 response 帧收尾
        print("[pricelens-server] 模型服务流中断：%s" % describe_error(e))
        try:
            push("run.failed", {"event": event("run.failed", "模型叙述中断，已回退本地基线结果", "failed")})
            push("response", {"type": "response", "response": fallback_response(baseline, model)})
        except (BrokenPipeError, ConnectionResetError, OSError):
            handler.close_connection = True
    finally:
        try:
            upstream.close()
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------- 入口

def handle(handler, method, path):
    """server.py 在 /api/agent/ 前缀时调用；返回 True = 已处理，None = 该路径不存在（交回 404）。"""
    routes = {
        ("GET", "/api/agent/providers"): lambda: handler._send_json(public_state()),
        ("POST", "/api/agent/providers"): lambda: handler._send_json(save_provider(_body(handler) or {})),
        ("POST", "/api/agent/active"): lambda: handler._send_json(set_active(_body(handler))),  # 允许字面量 null = 取消
        ("POST", "/api/agent/models"): lambda: handler._send_json(list_models(_body(handler) or {})),
        ("POST", "/api/agent/test"): lambda: handler._send_json(test_provider(_body(handler) or {})),
    }
    action = routes.get((method, path))
    if action is not None:
        try:
            return action() or True
        except ApiError as e:
            return handler._send_json({"error": str(e)}, getattr(e, "status", 400))
        except Exception:  # noqa: BLE001 —— 异常细节可能带上游信息，只回通用提示、栈打到服务器窗口
            traceback.print_exc()
            return handler._send_json({"error": "模型服务内部错误，详见服务器窗口日志"}, 500)
    if method == "POST" and path == "/api/agent/runs":
        return handle_runs(handler, handler._read_body() or b"") or True
    return None


def _body(handler):
    raw = handler._read_body()
    if not raw:
        return {}
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise ApiError("请求体必须是合法 JSON", 400)
    if payload is None:
        return None  # 字面量 null：取消当前模型等「清空」语义
    if not isinstance(payload, dict):
        raise ApiError("请求体必须是 JSON 对象", 400)
    return payload
