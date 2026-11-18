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
import csv
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
# 数据文件夹（2026-11-18 Eason「后端数据极其简单，统一在一个文件夹承载、可直接
# 编辑、改完前端就变化」）：offers.csv（街价原表行）+ sales.csv（PSI 销量行）
# + config.json（配置，嵌套结构保持 JSON）= 唯一数据源。
# 2026-11-18 晚追加（Eason「json 不方便编辑，改 csv」）：数据文件改 **CSV**——
# Excel/WPS 双击直接编辑；UTF-8 带 BOM（中文 Excel 打开不乱码）；值全文本由引擎
# 归一层原样收（jnum/parseDatetime 既有口径，逐字对齐不变）。csv 优先于同名 json
# （.json 仍兼容读取，拆写恒产 csv 并删旧 json 防双源歧义）。任何 API 请求前检查
# mtime——文件被编辑（Excel 保存即触发）→ 自动重派生 → 前端轮询 ping 自动刷新。
OFFERS_PATH = os.path.join(DATA_DIR, "offers.csv")
SALES_PATH = os.path.join(DATA_DIR, "sales.csv")
OFFERS_JSON = os.path.join(DATA_DIR, "offers.json")  # 旧形态兼容读取
SALES_JSON = os.path.join(DATA_DIR, "sales.json")
BUILD_STAMP = {"mtime": -1.0}  # 进程内上次构建时的源文件最大 mtime


def _offers_path():
    return OFFERS_PATH if os.path.exists(OFFERS_PATH) else (OFFERS_JSON if os.path.exists(OFFERS_JSON) else None)


def _sales_path():
    return SALES_PATH if os.path.exists(SALES_PATH) else (SALES_JSON if os.path.exists(SALES_JSON) else None)


def _read_rows(path):
    """CSV/JSON 统一读为行 dict 数组：CSV 用 utf-8-sig（BOM 自剥）+ DictReader
    （RFC4180 引号内逗号/换行自动处理），值全字符串——引擎归一层原样收。"""
    if path is None:
        return []
    if path.endswith(".csv"):
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            return [dict(r) for r in csv.DictReader(f)]
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _write_rows_csv(path, rows):
    """行数组写 CSV（utf-8-sig BOM：中文 Windows Excel 双击直开不乱码；\r\n 行尾）。
    表头 = 首行键序（保持列序稳定，编辑器里不跳列）；空数组只写空文件占位。"""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        if rows:
            headers = list(rows[0].keys())
            writer.writerow(headers)
            for r in rows:
                writer.writerow(["" if r.get(h) is None else r.get(h) for h in headers])
    os.replace(tmp, path)


def _folder_mtime():
    parts = [CONFIG_PATH, OFFERS_PATH, OFFERS_JSON, SALES_PATH, SALES_JSON]
    mt = [os.path.getmtime(p) for p in parts if os.path.exists(p)]
    return max(mt) if mt else -1.0


def maybe_rebuild():
    """源文件被编辑 → 自动重派生（所有 API 请求前调用；mtime 未变 = 零开销）"""
    mt = _folder_mtime()
    if mt <= BUILD_STAMP["mtime"]:
        return
    with INGEST_LOCK, STATE_LOCK:
        mt = _folder_mtime()  # 双检（锁内再读一次，防并发竞态）
        if mt <= BUILD_STAMP["mtime"]:
            return
        try:
            offers_path = _offers_path()
            if offers_path is None:
                BUILD_STAMP["mtime"] = mt
                return
            offers = _read_rows(offers_path)
            sales = _read_rows(_sales_path())
            pack = {
                "kind": "pricelens-data-pack", "v": 3,
                "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                "offers": offers, "sales": sales, "salesProductAliases": {}, "monthly": [],
            }
            config = _read_json(CONFIG_PATH) or {}
            v2_pack, diag, pack_id = ingest_pack.ingest_v3_pack(pack, config, REGION_BASE, DB_PATH)
            _write_json(LATEST_PACK_PATH, v2_pack)
            BUILD_STAMP["mtime"] = mt
            print(f"[pricelens-server] 数据文件变更已重派生（{diag.get('rowsOut')} 事实行，pack_id={pack_id}）")
        except Exception:  # noqa: BLE001 —— 编辑坏档时保旧包、报完整栈
            BUILD_STAMP["mtime"] = mt  # 坏档不无限重试；修好文件后 mtime 再变即重建
            traceback.print_exc()


def _split_folder_files(pack):
    """v3 上传包拆写为可编辑数据文件（offers.csv/sales.csv，删旧 json 防双源歧义）
    → 文件夹成唯一源"""
    if pack.get("v") == 3:
        _write_rows_csv(OFFERS_PATH, pack.get("offers") or [])
        _write_rows_csv(SALES_PATH, pack.get("sales") or [])
        for old in (OFFERS_JSON, SALES_JSON):
            if os.path.exists(old):
                os.remove(old)

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
        maybe_rebuild()  # 数据文件被编辑 → 自动重派生（mtime 未变 = 零开销）
        if method == "GET" and path == "/api/ping":
            return self._send_json({"ok": True, "service": "pricelens-server",
                                    "editableFolder": _offers_path() is not None,
                                    "hasPack": os.path.exists(LATEST_PACK_PATH),
                                    "meta": _pack_meta()})
        if method == "GET" and path == "/api/pack":
            pack = _read_json(LATEST_PACK_PATH)
            if pack is None:
                return self._send_json({"error": "尚无数据包（先 POST /api/datapack 或在 data/ 放 offers.csv）"}, 404)
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
                        if pack is None and _offers_path() is None:
                            return self._send_json({"error": "服务端尚无已导入的数据包"}, 400)
                        if _offers_path() is not None:
                            offers = _read_rows(_offers_path())
                            sales = _read_rows(_sales_path())
                            pack = {"kind": "pricelens-data-pack", "v": 3,
                                    "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                                    "offers": offers, "sales": sales,
                                    "salesProductAliases": {}, "monthly": []}
                    else:
                        raw = self._read_body()
                        if not raw:
                            return self._send_json({"error": "请求体为空（需要数据包 JSON）"}, 400)
                        pack = json.loads(raw.decode("utf-8"))
                        if pack.get("v") == 3:
                            # 文件夹为唯一源：v3 上传拆写为 offers.csv/sales.csv，
                            # 走同一条文件夹重派生路径（编辑与上传殊途同归）
                            _split_folder_files(pack)
                            offers = _read_rows(_offers_path())
                            sales = _read_rows(_sales_path())
                            pack = {"kind": "pricelens-data-pack", "v": 3,
                                    "generatedAt": pack.get("generatedAt")
                                    or datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                                    "offers": offers, "sales": sales,
                                    "salesProductAliases": pack.get("salesProductAliases") or {},
                                    "monthly": pack.get("monthly") or []}
                    v2_pack, diag, note = do_ingest(pack)
                    BUILD_STAMP["mtime"] = _folder_mtime()  # 上传路径同步推进 stamp，防 maybe_rebuild 重复跑
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
                # 有数据源时自动重派生（配置是派生输入；文件夹源由 maybe_rebuild
                # 的 mtime 变化在下一次请求触发，此处主动立即跑一次给前端诊断回执）
                rederived = False
                diag = None
                if _offers_path() is not None:
                    with INGEST_LOCK:
                        try:
                            offers = _read_rows(_offers_path())
                            sales = _read_rows(_sales_path())
                            cfg_pack = {"kind": "pricelens-data-pack", "v": 3,
                                        "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                                        "offers": offers, "sales": sales,
                                        "salesProductAliases": {}, "monthly": []}
                            _, diag, _ = do_ingest(cfg_pack)
                            BUILD_STAMP["mtime"] = _folder_mtime()
                            rederived = True
                        except Exception:  # noqa: BLE001 —— 配置坏行时保配置、报派生错误
                            traceback.print_exc()
                elif os.path.exists(LAST_IMPORT_PATH):
                    pack = _read_json(LAST_IMPORT_PATH)
                    if pack and pack.get("v") == 3:
                        with INGEST_LOCK:
                            try:
                                _, diag, _ = do_ingest(pack)
                                rederived = True
                            except Exception:  # noqa: BLE001
                                traceback.print_exc()
                return self._send_json({"ok": True, "rederived": rederived, "diag": diag})
            except ValueError as e:
                return self._send_json({"error": f"配置 JSON 无效：{e}"}, 400)
        if method == "POST" and path == "/api/datapack/reset":
            with INGEST_LOCK, STATE_LOCK:
                for p in (LAST_IMPORT_PATH, LATEST_PACK_PATH, OFFERS_PATH, OFFERS_JSON, SALES_PATH, SALES_JSON):
                    if os.path.exists(p):
                        os.remove(p)
                BUILD_STAMP["mtime"] = _folder_mtime()
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


def _migrate_last_import_to_folder():
    """一次性迁移：旧 last-import.json（v3）拆写为 offers.csv/sales.csv——
    数据文件夹成为唯一源后，历史导入的原包不丢"""
    if _offers_path() is not None or not os.path.exists(LAST_IMPORT_PATH):
        return
    pack = _read_json(LAST_IMPORT_PATH)
    if pack and pack.get("v") == 3:
        _split_folder_files(pack)
        print("[pricelens-server] 已把历史导入包拆写为 data/offers.csv + sales.csv（可编辑源）")


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    _migrate_last_import_to_folder()
    addr = ("127.0.0.1", PORT)
    httpd = ThreadingHTTPServer(addr, Handler)
    url = f"http://localhost:{PORT}"
    print(f"[pricelens-server] {url}  web={WEB_DIR}  data={DATA_DIR}")
    src = "data/ 文件夹（offers.csv + sales.csv + config.json，可直接编辑）" if _offers_path() is not None \
        else "无（前端用内置兜底数据；把 v3 数据包 JSON 的 offers/sales 段放进 data/ 即可）"
    print(f"[pricelens-server] 数据源：{src}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[pricelens-server] 已停止")


if __name__ == "__main__":
    main()
