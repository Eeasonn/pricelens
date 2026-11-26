#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 pricelens.db（服务器 SQLite）全部表导出为 CSV（交接用）。

- 编码 utf-8-sig（中文 Windows Excel 双击直开不乱码）+ CRLF + RFC4180 引号转义
- 全表全量、表头即列名；只读源库，不做任何派生
- 表清单不硬编码：取库里实际存在的表，按 server/ingest_pack.py TABLES 的分层顺序排列
  （2026-11-23 后端 v2 重构后为 24 表；旧库的 v1 表、自定义表排在后面照常导出）
用法：python3 scripts/export_all_tables_csv.py <db路径> <输出目录>
"""
import csv
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "server"))

ROW_CAP = 500_000  # 单表护栏（当前最大 97,299，量级异常时人工复核）


def tables_of(cur):
    import ingest_pack
    have = {r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    ordered = [t for t in ingest_pack.TABLES if t in have]
    return ordered + sorted(have - set(ordered))


def main():
    db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(HERE), "server", "data", "pricelens.db")
    outdir = sys.argv[2] if len(sys.argv) > 2 else "tables-csv"
    os.makedirs(outdir, exist_ok=True)
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        cur = conn.cursor()
        total = 0
        tables = tables_of(cur)
        for t in tables:
            try:
                cur.execute(f"SELECT * FROM {t}")
            except sqlite3.OperationalError as e:
                print(f"skip {t}: {e}")
                continue
            cols = [d[0] for d in cur.description]
            path = os.path.join(outdir, f"{t}.csv")
            n = 0
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f, lineterminator="\r\n")
                w.writerow(cols)
                while True:
                    rows = cur.fetchmany(5000)
                    if not rows:
                        break
                    n += len(rows)
                    if n > ROW_CAP:
                        raise SystemExit(f"abort: {t} exceeds ROW_CAP {ROW_CAP}")
                    for r in rows:
                        w.writerow(["" if v is None else v for v in r])
            total += n
            print(f"{t}: {n} rows -> {os.path.basename(path)}")
        print(f"done. tables exported, total rows = {total}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
