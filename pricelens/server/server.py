#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PriceLens 本机服务器（2026-11-18 前后端分离，Eason 拍板：Python + SQLite 简单路线）。

为什么：浏览器单文件模式导入 117MB 级数据包必崩（file.text → JSON.parse →
IngestRow+factRows → encode stringify → IndexedDB structured clone 约 5 份全量内存
拷贝）——数据承载上移到本机 Python 进程（64 位堆无压力），前端只收 gzip 编码
v2 包（117MB 原样 JSON ≈ 16-22MB）。

纯标准库（http.server + sqlite3 + json/gzip）——零第三方依赖。部署目录形如：

  PriceLens-Server/
    server.py / ingest_pack.py / dim_region.json
    启动PriceLens.bat / 安装依赖.bat（当前零依赖，留作未来扩展位）
    web/            前端静态文件（dist/index.html + public 资源）
    data/           pricelens.db / config.json / last-import.json / latest-pack.json

API（前端 vite dev proxy 与生产同源相对路径共用）：
  GET  /api/ping            → {ok, hasPack, meta}
  GET  /api/pack            → 最新 v2 编码包 JSON（no-store；无包 404）
  POST /api/datapack        → body = 数据包 JSON（v3 原样 / v2 规范化），同步处理
  POST /api/rederive        → 用上次导入的原包 + 当前 config 重跑派生
  GET  /api/config          → 服务端配置 JSON（前端启动镜像同步用）
  POST /api/config          → body = 配置 JSON（前端导入配置 xlsx 解析后 POST；触发重派生）
  POST /api/datapack/reset  → 清空服务端数据（回到 web 前端内置兜底数据）
静态：GET / 与 /assets… → web/ 下文件。
"""
import json
import os
import re
import sqlite3
import sys
import threading
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import ingest_pack  # noqa: E402

PORT = int(os.environ.get("PRICLENS_PORT", "8321"))
# 开发态（仓库内 pricelens/server/）：web 用 pricelens/dist、数据放 server/data；
# 部署态（独立目录）：web/ 与 data/ 与 server.py 同级，region 基座随部署物携带。
_DEV = os.path.basename(os.path.dirname(HERE)) == "pricelens"
if _DEV:
    WEB_DIR = os.path.join(os.path.dirname(HERE), "dist")
    DATA_DIR = os.path.join(HERE, "data")
    REGION_BASE = os.path.join(os.path.dirname(HERE), "src", "data", "dim_region.json")
else:
    WEB_DIR = os.path.join(HERE, "web")
    DATA_DIR = os.path.join(HERE, "data")
    REGION_BASE = os.path.join(HERE, "dim_region.json")
DB_PATH = os.path.join(DATA_DIR, "pricelens.db")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
LAST_IMPORT_PATH = os.path.join(DATA_DIR, "last-import.json")
LATEST_PACK_PATH = os.path.join(DATA_DIR, "latest-pack.json")

INGEST_LOCK = threading.Lock()  # 同一时刻只跑一次 ingest（大包同步处理，串行化）
STATE_LOCK = threading.Lock()

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
    ".vtt": "text/vtt; charset=utf-8", ".xlsx": "application/octet-stream",
    ".woff": "font/woff", ".woff2": "font/woff2",
}


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def _pack_meta():
    pack = _read_json(LATEST_PACK_PATH)
    if not pack:
        return None
    dims = pack.get("dims") or {}
    return {
        "generatedAt": pack.get("generatedAt") or "",
        "weeks": len(dims.get("time") or []),
        "skus": len(dims.get("product") or []),
        "sales": len(pack.get("sales") or []),
    }


def do_ingest(pack):
    """v3 → 派生 + SQLite + latest-pack；v2 → 直接作为 latest-pack（不落库）。"""
    kind = pack.get("kind")
    v = pack.get("v")
    if kind != "pricelens-data-pack" or v not in (1, 2, 3):
        raise ValueError("数据包类型或版本不匹配（需要 pricelens-data-pack v1/v2/v3）")
    diag = None
    if v == 3:
        config = _read_json(CONFIG_PATH) or {}
        v2_pack, diag, pack_id = ingest_pack.ingest_v3_pack(pack, config, REGION_BASE, DB_PATH)
        note = f"pack_id={pack_id}"
    else:
        # v1/v2 已是编码态：透传存档 + SQLite 落库（解码列式展开事实与维表——
        # 「把所有数据都更新上去」的全量承载；ODS offer 原样层仅 v3 主链有）
        rows = ingest_pack.load_v2_pack_to_sqlite(DB_PATH, pack, datetime.now().strftime("%Y%m%d-%H%M%S"))
        v2_pack = pack
        diag = {"rowsOut": rows, "rowsIn": rows}
        note = f"v1v2 落库 {rows} 行"
    _write_json(LAST_IMPORT_PATH, pack)
    _write_json(LATEST_PACK_PATH, v2_pack)
    return v2_pack, diag, note


class Handler(BaseHTTPRequestHandler):
    server_version = "PriceLensServer/1.0"
    protocol_version = "HTTP/1.1"

    # ---------- 基础 ----------
    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    def _send_json(self, obj, status=200, no_store=True):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if no_store:
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return None
        return self.rfile.read(length)

    # ---------- API ----------
    def _api(self, method):
        path = urlparse(self.path).path
        if method == "GET" and path == "/api/ping":
            return self._send_json({"ok": True, "service": "pricelens-server",
                                    "hasPack": os.path.exists(LATEST_PACK_PATH),
                                    "meta": _pack_meta()})
        if method == "GET" and path == "/api/pack":
            pack = _read_json(LATEST_PACK_PATH)
            if pack is None:
                return self._send_json({"error": "尚无数据包（先 POST /api/datapack）"}, 404)
            body = json.dumps(pack, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if method == "GET" and path == "/api/config":
            return self._send_json(_read_json(CONFIG_PATH) or {})
        if method == "POST" and path in ("/api/datapack", "/api/rederive"):
            with INGEST_LOCK, STATE_LOCK:
                try:
                    if path == "/api/rederive":
                        pack = _read_json(LAST_IMPORT_PATH)
                        if pack is None:
                            return self._send_json({"error": "服务端尚无已导入的数据包"}, 400)
                    else:
                        raw = self._read_body()
                        if not raw:
                            return self._send_json({"error": "请求体为空（需要数据包 JSON）"}, 400)
                        pack = json.loads(raw.decode("utf-8"))
                    v2_pack, diag, note = do_ingest(pack)
                    return self._send_json({
                        "ok": True, "note": note, "diag": diag,
                        "meta": _pack_meta(),
                    })
                except ValueError as e:
                    return self._send_json({"error": str(e)}, 400)
                except Exception as e:  # noqa: BLE001 —— 服务端兜底：完整栈进日志
                    traceback.print_exc()
                    return self._send_json({"error": f"处理失败：{e}"}, 500)
        if method == "POST" and path == "/api/config":
            try:
                raw = self._read_body()
                config = json.loads(raw.decode("utf-8")) if raw else {}
                if not isinstance(config, dict):
                    return self._send_json({"error": "配置必须是 JSON 对象"}, 400)
                _write_json(CONFIG_PATH, config)
                # 有已导入原包时自动重派生（配置是派生输入）
                rederived = False
                diag = None
                if os.path.exists(LAST_IMPORT_PATH):
                    pack = _read_json(LAST_IMPORT_PATH)
                    if pack and pack.get("v") == 3:
                        with INGEST_LOCK:
                            try:
                                _, diag, _ = do_ingest(pack)
                                rederived = True
                            except Exception:  # noqa: BLE001 —— 配置坏行时保配置、报派生错误
                                traceback.print_exc()
                return self._send_json({"ok": True, "rederived": rederived, "diag": diag})
            except ValueError as e:
                return self._send_json({"error": f"配置 JSON 无效：{e}"}, 400)
        if method == "POST" and path == "/api/datapack/reset":
            with INGEST_LOCK, STATE_LOCK:
                for p in (LAST_IMPORT_PATH, LATEST_PACK_PATH):
                    if os.path.exists(p):
                        os.remove(p)
                if os.path.exists(DB_PATH):
                    conn = sqlite3.connect(DB_PATH)
                    try:
                        for table in ("ods_offer_raw", "ods_psi_sales", "map_model", "map_sku",
                                      "map_spec_split", "map_tier", "map_alias", "dim_channel",
                                      "dim_time", "dim_fx", "dim_region", "dim_promo",
                                      "dim_benchmark", "dim_tier", "fact_price_weekly"):
                            conn.execute(f"DELETE FROM {table}")
                        conn.commit()
                    finally:
                        conn.close()
                return self._send_json({"ok": True})
        return self._send_json({"error": f"未知 API：{method} {path}"}, 404)

    # ---------- 静态 ----------
    def _static(self):
        path = urlparse(self.path).path
        if path == "/":
            path = "/index.html"
        rel = unquote(path).lstrip("/")
        rel = re.sub(r"[^A-Za-z0-9_\-./\u4e00-\u9fff]", "_", rel)
        target = os.path.normpath(os.path.join(WEB_DIR, rel))
        if not target.startswith(os.path.abspath(WEB_DIR)):
            return self._send_json({"error": "forbidden"}, 403)
        if not os.path.isfile(target):
            # SPA fallback：非 API 路径回 index.html
            target = os.path.join(WEB_DIR, "index.html")
            if not os.path.isfile(target):
                return self._send_json({"error": "web/ 缺少 index.html（先构建前端并组装部署目录）"}, 500)
        ext = os.path.splitext(target)[1].lower()
        with open(target, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        if ext in (".html", ".json"):
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._api("GET")
        return self._static()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._api("POST")
        return self._send_json({"error": "POST 只接受 /api/*"}, 404)


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    addr = ("127.0.0.1", PORT)
    httpd = ThreadingHTTPServer(addr, Handler)
    url = f"http://localhost:{PORT}"
    print(f"[pricelens-server] {url}  web={WEB_DIR}  data={DATA_DIR}")
    print(f"[pricelens-server] 已导入数据包：{'有' if os.path.exists(LATEST_PACK_PATH) else '无（前端用内置兜底数据）'}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[pricelens-server] 已停止")


if __name__ == "__main__":
    main()
