#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
脏数据离群检测 —— 试运行打标 + 命中报表（纯只读分析）

背景：全站取数口径 = 渠道白名单内最低在架价（minPriceOfRows，裸机优先），
一条离谱低价行会直接污染线值（实例：iPhone 17 Pro RU W19 M.Video $6.76 把比价图
y 轴拉到 0）。本脚本按「先打标、后定阈值」的对齐方案做试运行：
只读 src/data/ 下事实包与维表，产出终端摘要 + docs/ 试运行报表，
不改任何取价逻辑、不写任何 src/data 文件，可幂等重跑。

三类规则：
  1) level_outlier  水平离群：同 (国家, SKU, 周) 跨渠道组内，价格 <= 组内中位数 × LEVEL_RATIO
                    只标低价侧；高价侧（>= 中位数 / LEVEL_RATIO）只计数不标。
  2) pulse_outlier  脉冲突变：同 (国家, SKU, 渠道) 时间序列，单周环比 |Δ| >= PULSE_DROP
                    且下一周回到原位 ±PULSE_RETURN 内；只标降价脉冲，涨价脉冲只计数。
  3) ref_anomaly    引用异常：url 为空的行计数；bundle=true 行数单列（有兜底规则，不算脏）。
"""
import argparse
import base64
import gzip
import json
import statistics
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

# ============================ 可调阈值（默认值，均可被命令行参数覆盖） ============================
LEVEL_RATIO = 0.6      # 水平离群：价格 <= 组内中位数 × 该比例（0.6 即 -40%）判为低价离群
MIN_GROUP_SIZE = 3     # 水平离群：跨渠道组最少行数（组太小时中位数不稳，不计）
PULSE_DROP = 0.5       # 脉冲突变：单周环比 |Δ| >= 50%
PULSE_RETURN = 0.2     # 脉冲突变：下一周回到脉冲前一周价格 ±20% 内
TOP_N = 10             # 终端摘要每规则样例条数

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / 'src' / 'data'
DOCS_DIR = ROOT / 'docs'
DEFAULT_OUT = DOCS_DIR / f'脏数据试运行报表-{date.today().isoformat()}.md'

# 自证案例：必须出现在报告中的已知脏行
SHOWCASE = {
    'country': 'RU', 'week': '202619',
    'sku_contains': 'cmp-apple-iphone-17-pro__12-', 'channel_prefix': 'RU:m-video:',
}


def load_rows():
    """解码事实包（gzip + base64 列式 JSON，与应用 src/data/index.ts 同一套格式）并装配维表。"""
    b64 = (DATA_DIR / 'fact_pack_gzip.b64.txt').read_text().strip()
    pack = json.loads(gzip.decompress(base64.b64decode(b64)))

    dim_product = {p['sku_id']: p for p in json.loads((DATA_DIR / 'dim_product.json').read_text())}
    dim_channel = {c['channel_id']: c for c in json.loads((DATA_DIR / 'dim_channel.json').read_text())}
    dim_region = {r['country_code']: r for r in json.loads((DATA_DIR / 'dim_region.json').read_text())}
    dim_time = {t['week_id']: t for t in json.loads((DATA_DIR / 'dim_time.json').read_text())}

    weeks, skus, channels, d = pack['weeks'], pack['skus'], pack['channels'], pack['dict']
    c = pack['cols']
    rows = []
    for i in range(len(c['w'])):
        price_local = c['p'][i]
        fx = c['fx'][i] or 1.0
        channel_id = channels[c['h'][i]]
        sku_id = skus[c['s'][i]]
        url = d['url'][c['url'][i]] or ''
        prod = dim_product.get(sku_id, {})
        rows.append({
            'week_id': weeks[c['w'][i]],
            'sku_id': sku_id,
            'country_code': channel_id.split(':')[0],
            'channel_id': channel_id,
            'seller': d['seller'][c['seller'][i]] or '',
            'price_local': price_local,
            'price_usd': None if price_local is None else round(price_local / fx, 2),
            'rrp_usd': None if c['rrp'][i] is None else round(c['rrp'][i] / fx, 2),
            'bundle': c['b'][i] == 1,
            'url': url.strip(),
            'model_name': prod.get('model_name', sku_id),
            'romram': prod.get('romram', ''),
            'color': prod.get('color', ''),
            'channel_name': dim_channel.get(channel_id, {}).get('display_name', channel_id),
            'country_name': dim_region.get(channel_id.split(':')[0], {}).get('country_name', ''),
            'currency': dim_region.get(channel_id.split(':')[0], {}).get('currency', 'USD'),
            'week_date': dim_time.get(weeks[c['w'][i]], {}).get('week_wed_date', ''),
        })
    return rows, len(weeks)


def sku_label(r):
    return f"{r['model_name']} {r['romram']} {r['color']}".strip()


def bare_first(rows):
    """裸机优先（与看板取价 minPriceOfRows 同规则）：有非套装行时剔除套装行，
    套装组合价不参与参照/线值，否则会制造假离群或掩盖真离群。"""
    bare = [r for r in rows if not r['bundle']]
    return bare if bare else list(rows)


def week_ordinals(rows):
    """周序号（按事实表全量周 id 升序）：判定相邻周连续，缺周间隔不算单周环比。"""
    ids = sorted({r['week_id'] for r in rows})
    return {w: i for i, w in enumerate(ids)}


# ---------------------------------------------------------------- 规则 1：水平离群
def rule_level(rows, ratio, min_group):
    """按 (国家, SKU, 周) 跨渠道分组（组内先裸机优先），中位数为参照；
    低价侧打标，高价侧仅计数。"""
    groups = defaultdict(list)
    for r in rows:
        if r['price_usd'] is not None:
            groups[(r['country_code'], r['sku_id'], r['week_id'])].append(r)

    flagged, high_side = [], 0
    for (_cc, _sku, _wk), grp in groups.items():
        grp = bare_first(grp)
        if len(grp) < min_group:
            continue
        median = statistics.median(x['price_usd'] for x in grp)
        if median <= 0:
            continue
        for r in grp:
            dev = r['price_usd'] / median - 1
            if r['price_usd'] <= median * ratio:
                r2 = dict(r, ref=round(median, 2), dev=dev)
                flagged.append(r2)
            elif r['price_usd'] >= median / ratio:   # 高价侧：对称阈值，只计数
                high_side += 1
    flagged.sort(key=lambda x: x['dev'])
    return flagged, high_side, len(groups)


# ---------------------------------------------------------------- 规则 2：脉冲突变
def rule_pulse(rows, drop, ret):
    """按 (国家, SKU, 渠道) 序列（周内先裸机优先再取最低价，贴合 minPriceOfRows
    最低价口径；仅相邻连续周参与，缺周间隔的跨周涨跌不算单周环比）：
    单周 |环比| >= drop 且下一周回到脉冲前 ±ret 内 → 脉冲；降价侧打标，涨价侧仅计数。"""
    by_key_week = defaultdict(lambda: defaultdict(list))
    for r in rows:
        if r['price_usd'] is not None:
            by_key_week[(r['country_code'], r['sku_id'], r['channel_id'])][r['week_id']].append(r)
    series = {
        key: {wk: min(bare_first(rs), key=lambda x: x['price_usd']) for wk, rs in by_week.items()}
        for key, by_week in by_key_week.items()
    }

    ord_of = week_ordinals(rows)
    flagged, up_count = [], 0
    for (_cc, _sku, _ch), by_week in series.items():
        wks = sorted(by_week)
        for a, b, d in zip(wks, wks[1:], wks[2:]):
            if ord_of[b] - ord_of[a] != 1 or ord_of[d] - ord_of[b] != 1:
                continue  # 相邻周不连续（中间缺采）：不是「单周」突变
            prev, cur, nxt = (by_week[x]['price_usd'] for x in (a, b, d))
            if prev <= 0:
                continue
            step = cur / prev - 1
            if abs(step) < drop:
                continue
            if abs(nxt / prev - 1) > ret:   # 未回位 → 趋势而非脉冲
                continue
            info = dict(by_week[b], prev_week=a, prev_price=prev,
                        next_week=d, next_price=nxt, step=step,
                        ret_dev=nxt / prev - 1)
            if step < 0:
                flagged.append(info)
            else:
                up_count += 1
    flagged.sort(key=lambda x: x['step'])
    return flagged, up_count


# ---------------------------------------------------------------- 规则 3：引用异常
def rule_ref(rows):
    empty_url = [r for r in rows if not r['url']]
    bundle_rows = [r for r in rows if r['bundle']]
    return empty_url, bundle_rows


def fmt_dev(x):
    return f"{x * 100:+.1f}%"


def sample_table(items, kind):
    """终端摘要用的一行式样例。"""
    out = []
    for r in items[:TOP_N]:
        if kind == 'level':
            out.append(f"  {r['country_code']} {r['week_id']} {sku_label(r)} @ {r['channel_name']}"
                       f"  ${r['price_usd']} vs 中位 ${r['ref']} ({fmt_dev(r['dev'])})")
        else:
            out.append(f"  {r['country_code']} {r['week_id']} {sku_label(r)} @ {r['channel_name']}"
                       f"  ${r['prev_price']}→${r['price_usd']}→${r['next_price']} ({fmt_dev(r['step'])})")
    return out


def md_row(cells):
    return '| ' + ' | '.join(str(x) for x in cells) + ' |'


def main():
    ap = argparse.ArgumentParser(description='脏数据离群检测试运行（只读分析，出打标报表）')
    ap.add_argument('--level-ratio', type=float, default=LEVEL_RATIO, help='水平离群阈值（价格/中位数 <= 该值判离群），默认 0.6')
    ap.add_argument('--min-group', type=int, default=MIN_GROUP_SIZE, help='水平离群组最小行数，默认 3')
    ap.add_argument('--pulse-drop', type=float, default=PULSE_DROP, help='脉冲突变单周环比阈值，默认 0.5')
    ap.add_argument('--pulse-return', type=float, default=PULSE_RETURN, help='脉冲回位容差，默认 0.2')
    ap.add_argument('--top', type=int, default=TOP_N, help='终端每规则样例条数，默认 10')
    ap.add_argument('--out', type=Path, default=DEFAULT_OUT, help='报表输出路径')
    args = ap.parse_args()

    rows, n_weeks = load_rows()
    valid = [r for r in rows if r['price_usd'] is not None]

    level_hits, high_side, n_groups = rule_level(valid, args.level_ratio, args.min_group)
    pulse_hits, pulse_up = rule_pulse(valid, args.pulse_drop, args.pulse_return)
    empty_url, bundle_rows = rule_ref(rows)

    # ---------------- 自证：iPhone 17 Pro RU 202619 M.Video 必须命中 ----------------
    showcase_rows = [r for r in rows
                     if r['country_code'] == SHOWCASE['country'] and r['week_id'] == SHOWCASE['week']
                     and r['sku_id'].startswith(SHOWCASE['sku_contains'])
                     and r['channel_id'].startswith(SHOWCASE['channel_prefix'])]
    showcase_keys = {(r['country_code'], r['week_id'], r['sku_id'], r['channel_id']) for r in showcase_rows}
    showcase_hit_keys = {(r['country_code'], r['week_id'], r['sku_id'], r['channel_id']) for r in level_hits}
    showcase_ok = showcase_keys and showcase_keys <= showcase_hit_keys

    # ---------------- 终端摘要 ----------------
    print(f"数据：{len(rows)} 行（有效价 {len(valid)}，空价 {len(rows) - len(valid)}），"
          f"{n_weeks} 周，跨渠道组 {n_groups} 个（>= {args.min_group} 行参与判定）")
    print(f"阈值：level_ratio={args.level_ratio}  min_group={args.min_group}  "
          f"pulse_drop={args.pulse_drop}  pulse_return={args.pulse_return}")
    print(f"命中：水平离群(低价) {len(level_hits)} 行｜高价侧仅计数 {high_side} 行"
          f"｜脉冲突变(降价) {len(pulse_hits)} 行｜涨价脉冲仅计数 {pulse_up} 行"
          f"｜url 为空 {len(empty_url)} 行｜bundle 行 {len(bundle_rows)} 行")
    print(f"自证案例 iPhone 17 Pro RU {SHOWCASE['week']} M.Video："
          f"{'全部命中 PASS' if showcase_ok else '未全部命中 FAIL'}（{len(showcase_keys)} 行中 "
          f"{len(showcase_keys & showcase_hit_keys)} 行命中）")
    print(f"\n[水平离群 Top {TOP_N}]（按偏离度降序取最严重前 {TOP_N}）")
    print('\n'.join(sample_table(level_hits[:TOP_N], 'level')))
    print(f"\n[脉冲突变 Top {TOP_N}]（按跌幅取最深前 {TOP_N}）")
    print('\n'.join(sample_table(pulse_hits[:TOP_N], 'pulse')))
    print(f"\n报表：{args.out}")

    # ---------------- 阈值敏感性（水平离群） ----------------
    sens = []
    for ratio in (0.5, 0.55, 0.6, 0.65, 0.7):
        hits, hs, _ = rule_level(valid, ratio, args.min_group)
        sens.append((ratio, len(hits), hs))

    # ---------------- 落盘报表 ----------------
    L = []
    L.append(f"# 脏数据试运行报表（离群打标）— {date.today().isoformat()}")
    L.append('')
    L.append(f"> 生成方式：`python3 scripts/outlier_report.py`（幂等可重跑，纯只读分析，不修改任何 `src/data` 文件与取价逻辑）。")
    L.append('>')
    wk_min, wk_max = min(r['week_id'] for r in rows), max(r['week_id'] for r in rows)
    L.append(f"> 数据源：`src/data/fact_pack_gzip.b64.txt`（{len(rows)} 行，{n_weeks} 周 {wk_min}–{wk_max}）"
             f"+ `dim_product / dim_channel / dim_region / dim_time`。")
    L.append('')
    L.append('## 一、背景与口径')
    L.append('')
    L.append('全站取数口径为**渠道白名单内最低在架价**（`minPriceOfRows`，裸机优先：同池有非套装行则套装行出局），')
    L.append('所有页面共用。因此**一条离谱的低价行会直接污染线值**：比价图 y 轴被拉到 0、'
             '优惠率/市场份额等下游指标全部失真。已对齐方案为先试运行——本报告只打标、出清单，不动取价；阈值看过报表后再定。')
    L.append('')
    L.append('## 二、规则说明（业务语言）')
    L.append('')
    L.append('| 规则 | 判定逻辑 | 只打标 | 只计数 |')
    L.append('| --- | --- | --- | --- |')
    L.append(f"| R1 水平离群 | 同一周、同一 SKU、同一国家的各渠道价格为一组；组内中位价为参照，"
             f"价格 ≤ 参照 × {args.level_ratio}（约 −{round((1 - args.level_ratio) * 100)}%）判为低价离群。"
             f"组内少于 {args.min_group} 行不判（样本太少中位数不稳）。 | ✅ 低价侧 | 高价侧（≥ 参照 ÷ {args.level_ratio}）不危害最低价口径，仅计数 |")
    L.append(f"| R2 脉冲突变 | 同一国家、同一 SKU、同一渠道的价格时间序列上，某周环比 |Δ| ≥ {args.pulse_drop:.0%}，"
             f"且下一周回到脉冲前一周价格 ±{args.pulse_return:.0%} 内（脉冲型，非趋势）。周内多行取最低价（贴合取数口径）。 | ✅ 降价脉冲 | 涨价脉冲不危害最低价口径，仅计数 |")
    L.append('| R3 引用异常 | 抓取行缺 url 无法溯源的行计数；bundle（套餐）行单独列数——已有裸机优先兜底规则，不算脏数据。 | — | ✅ |')
    L.append('')
    L.append('**口径约定**：所有价格已按 `dim_fx` 汇率折算为 USD 参与计算与展示；'
             'R1 组内为同一国家同一周，币种一致，中位数参照在 USD/本币下等价。')
    L.append('')
    L.append('## 三、阈值（当前参数）')
    L.append('')
    L.append('| 参数 | 默认值 | 含义 | 命令行参数 |')
    L.append('| --- | --- | --- | --- |')
    L.append(f"| LEVEL_RATIO | {LEVEL_RATIO} | 水平离群：价格 ≤ 中位数 × 该比例 | `--level-ratio` |")
    L.append(f"| MIN_GROUP_SIZE | {MIN_GROUP_SIZE} | 水平离群最小组行数 | `--min-group` |")
    L.append(f"| PULSE_DROP | {PULSE_DROP} | 脉冲单周环比阈值 | `--pulse-drop` |")
    L.append(f"| PULSE_RETURN | {PULSE_RETURN} | 脉冲回位容差 | `--pulse-return` |")
    L.append('')
    L.append('## 四、命中统计')
    L.append('')
    L.append('| 指标 | 数量 |')
    L.append('| --- | --- |')
    L.append(f"| 事实行总数 | {len(rows):,} |")
    L.append(f"| 有效价行（price 非空） | {len(valid):,} |")
    L.append(f"| 空价行 | {len(rows) - len(valid):,} |")
    L.append(md_row(['R1 水平离群命中（低价侧，打标）', f'{len(level_hits):,}']))
    L.append(md_row([f'R1 高价侧（仅计数，不打标）', f'{high_side:,}']))
    L.append(md_row(['R2 脉冲突变命中（降价侧，打标）', f'{len(pulse_hits):,}']))
    L.append(md_row(['R2 涨价脉冲（仅计数，不打标）', f'{pulse_up:,}']))
    L.append(md_row(['R3 url 为空行', f'{len(empty_url):,}']))
    L.append(md_row(['R3 bundle（套餐）行（有兜底规则，不算脏）', f'{len(bundle_rows):,}']))
    L.append(md_row(['参与 R1 判定的跨渠道组数', f'{n_groups:,}']))
    L.append('')
    L.append('### 阈值敏感性（R1 水平离群，其余参数不变）')
    L.append('')
    L.append('| 阈值 | 命中行数 | 高价侧计数 |')
    L.append('| --- | --- | --- |')
    for ratio, n, hs in sens:
        mark = ' ← 当前' if abs(ratio - args.level_ratio) < 1e-9 else ''
        L.append(md_row([ratio, f'{n:,}{mark}', f'{hs:,}']))
    L.append('')

    # ---------------- R1 完整清单 ----------------
    L.append(f'## 五、R1 水平离群完整命中清单（{len(level_hits)} 行，按偏离度升序 = 最严重在前）')
    L.append('')
    L.append(md_row(['国家', '周', 'SKU', '渠道', '价格(USD)', '组内中位(USD)', '偏离度', '官方参考价(USD)', 'bundle', 'url']))
    L.append(md_row(['---'] * 10))
    for r in level_hits:
        L.append(md_row([r['country_code'], r['week_id'], f"{sku_label(r)}（{r['sku_id']}）", r['channel_name'],
                         r['price_usd'], r['ref'], fmt_dev(r['dev']),
                         r['rrp_usd'] if r['rrp_usd'] is not None else '—',
                         '是' if r['bundle'] else '否', r['url'][:80] or '（空）']))
    L.append('')

    # ---------------- R2 完整清单 ----------------
    L.append(f'## 六、R2 脉冲突变完整命中清单（{len(pulse_hits)} 行，按跌幅降序 = 最深在前）')
    L.append('')
    if pulse_hits:
        L.append(md_row(['国家', '脉冲周', 'SKU', '渠道', '脉冲前价(USD)', '脉冲周价(USD)', '环比', '下一周', '下一周价(USD)', '回位偏差']))
        L.append(md_row(['---'] * 10))
        for r in pulse_hits:
            L.append(md_row([r['country_code'], r['week_id'], f"{sku_label(r)}（{r['sku_id']}）", r['channel_name'],
                             r['prev_price'], r['price_usd'], fmt_dev(r['step']),
                             r['next_week'], r['next_price'], fmt_dev(r['ret_dev'])]))
    else:
        L.append('（当前阈值下无命中）')
    L.append('')

    # ---------------- R3 引用异常 ----------------
    L.append('## 七、R3 引用异常')
    L.append('')
    L.append(f'- **url 为空：{len(empty_url)} 行**' + ('' if not empty_url else
             '，明细如下（国家 / 周 / SKU / 渠道 / 价格 / seller）：'))
    if empty_url:
        L.append('')
        L.append(md_row(['国家', '周', 'SKU', '渠道', '价格(USD)', 'seller']))
        L.append(md_row(['---'] * 6))
        for r in empty_url:
            L.append(md_row([r['country_code'], r['week_id'], f"{sku_label(r)}（{r['sku_id']}）",
                             r['channel_name'], r['price_usd'], r['seller'] or '—']))
    bundle_by_cc = Counter(r['country_code'] for r in bundle_rows)
    L.append(f'- **bundle（套餐）行：{len(bundle_rows):,} 行**（已有裸机优先兜底规则，不算脏）。按国家分布：'
             + '、'.join(f'{cc} {n}' for cc, n in bundle_by_cc.most_common()))
    L.append('')

    # ---------------- 自证案例 ----------------
    L.append('## 八、自证案例：iPhone 17 Pro · RU · 202619 · M.Video')
    L.append('')
    L.append('背景中提到的已知脏行（$6.76 把 RU 比价图 y 轴拉到 0）必须被 R1 命中，作为规则有效性自证：')
    L.append('')
    L.append(md_row(['国家', '周', 'SKU', '渠道', '价格(USD)', '组内中位(USD)', '偏离度', 'R1 命中']))
    L.append(md_row(['---'] * 8))
    for r in sorted(showcase_rows, key=lambda x: x['price_usd']):
        hit = (r['country_code'], r['week_id'], r['sku_id'], r['channel_id']) in showcase_hit_keys
        grp = [x for x in level_hits if (x['country_code'], x['week_id'], x['sku_id'], x['channel_id'])
               == (r['country_code'], r['week_id'], r['sku_id'], r['channel_id'])]
        ref = grp[0]['ref'] if grp else '—'
        dev = fmt_dev(grp[0]['dev']) if grp else '—'
        L.append(md_row([r['country_code'], r['week_id'], f"{sku_label(r)}（{r['sku_id']}）",
                         r['channel_name'], r['price_usd'], ref, dev, '✅' if hit else '❌']))
    L.append('')
    L.append(f'**自证结果：{"PASS —— 案例行全部被 R1 命中，规则有效" if showcase_ok else "FAIL —— 案例行未全部命中，需检查规则或阈值"}**')
    L.append('')
    L.append('## 九、复核结论建议区（人工填写）')
    L.append('')
    L.append('- [ ] R1 阈值是否采纳（当前 ' + str(args.level_ratio) + '，参考第四节敏感性）：')
    L.append('')
    L.append('- [ ] R2 阈值是否采纳（当前 ' + f'{args.pulse_drop:.0%}' + '）：')
    L.append('')
    L.append('- [ ] 打标后处理方式建议（例如：取价时剔除已打标行 / 仅告警不下线）：')
    L.append('')
    L.append('- [ ] 其他发现：')
    L.append('')

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text('\n'.join(L), encoding='utf-8')
    print(f'已生成报表：{args.out}（{len(level_hits) + len(pulse_hits)} 条打标明细）')

    if not showcase_ok:
        print('警告：自证案例未命中，请检查！', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
