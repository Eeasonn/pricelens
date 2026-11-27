"""PSI 销量关联（2026-11-27 与 Eason 对齐的四表结构）。

一张匹配表行要取到销量，靠的是「psi_product + category1~3」两段；PSI 一侧必须先把每个
SKU 串拆出 category，才知道哪些 PSI 行属于这个配置。四张表的分工：

  ods_psi       PSI 原始行，原样入库（国家 × Product × Product SKU × 周 × 口径）
  map_psi_sku   PSI 规格对照：一个不同的 (Product, Product SKU) 串一行、不分国家。
                category1~3 的来源优先级 = 人工覆盖 > 源表自带配置列 > 规则从 SKU 串解析；
                每次刷新重新生成；解析不出的行标 unparsed，不分配销量（进待处理）。
  map_product   匹配表（人工权威，只对应 offer）。行上的 psi_product（空 = 按型号名自动对）
                加 category1~3 就是取数键。
  fact_sales    周 × 口径 × 国家 × 型号 × category1~3，QTY 求和。

匹配规则（derive_fact_sales）：
  ① 三段 category 都相等才算同一配置；
  ② 匹配表行某段为空（型号没拆这个维度）→ PSI 行该段任意值都汇入这一行；
  ③ PSI 行某段解析为空（SKU 串没带）→ 沿用匹配表行的值，前提是该型号该段只有一个值，
     有多个就不分配（ambiguous）；
  ④ 对不上就不分配：unmatched_model / unmatched_country / unmatched_config / config_mismatch
     （如 PSI 写柔光版、清洗表是 Normal）/ ambiguous / unparsed —— 落库时 model_id 留空、
     match_status 记原因，供待处理清单取用；派生包只发 matched 的行。

本模块只做纯函数派生；归一函数复用 ingest_pack（storage / screen / case_size），两侧同一套。
"""
import collections
import re
import unicodedata

import ingest_pack as ip

INDUSTRY_CN = {"phone": "手机", "tablet": "平板", "wearable": "穿戴", "audio": "音频", "pc": "PC", "iot": "IoT"}
_INDUSTRY_OF_CN = {v: k for k, v in INDUSTRY_CN.items()}

# 周期：PSI Period ID 的三种写法 —— YYYY0WW（2025008）/ YYYYWW（202508）/ YYYY-Www、YYYYWww
_RE_PERIOD = re.compile(r"(\d{4})\s*[-_ ]?[Ww]?\s*0?(\d{1,2})$")
_RE_STO = re.compile(r"(\d{1,2})\s*(GB|MB)\s*\+\s*(\d{1,4})\s*(GB|TB)", re.I)
_RE_MM = re.compile(r"\b(\d{1,2}(?:\.\d)?)\s*mm\b", re.I)
_RE_IN = re.compile(r"(\d{1,2}(?:\.\d{1,2})?\s*(?:\"|”|″|吋|英寸|\s?-?inch\b))", re.I)
_RE_SIZE_TOKEN = re.compile(r"\d{1,2}(?:\.\d{1,2})?\s*(?:英寸|吋|\"|”|″|\s?-?inch)", re.I)
_RE_MATTE = re.compile(r"柔光|paper\s?matte", re.I)
_BRAND_PREFIXES = ("HUAWEI", "Huawei", "huawei", "华为")


# ---------------------------------------------------------------- 归一

def _s(v):
    return ip.jstr(v).strip()


def normalize_period_id(raw):
    """PSI Period ID → 内部 week_id（YYYYWW）。周号 1–53 之外 / 解不出 = ''。"""
    if raw is None:
        return ""
    if isinstance(raw, float) and raw.is_integer():
        raw = int(raw)
    m = _RE_PERIOD.match(str(raw).strip())
    if not m:
        return ""
    w = int(m.group(2))
    return f"{m.group(1)}{w:02d}" if 1 <= w <= 53 else ""


def strip_brand_text(s):
    t = _s(s)
    for b in _BRAND_PREFIXES:
        if t.startswith(b):
            return t[len(b):].strip()
    return t


def name_key(s, drop_size=False):
    """型号名弱归一键：去品牌前缀、可去尺寸标记（英寸 / 吋 / inch）、NFKC、小写、
    只留字母数字与汉字（保留汉字 = 「手环 11」不会被当成「Band 11」）。"""
    t = strip_brand_text(s)
    if drop_size:
        t = _RE_SIZE_TOKEN.sub(" ", t)
    t = unicodedata.normalize("NFKC", t).lower().replace("英寸", "").replace("吋", "")
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", t)


def industry_of(category):
    """品类（中文『手机』或内部 phone）→ 内部产业键；认不出 = ''。"""
    c = _s(category)
    if not c:
        return ""
    if c in _INDUSTRY_OF_CN:
        return _INDUSTRY_OF_CN[c]
    return ip.industry_of_cat(c) or ""


def _inch(tok):
    return ip.normalize_screen(str(tok or "").replace("吋", '"').replace("英寸", '"')) or ""


def cat_key(industry, c1, c2, c3=""):
    """category 三段归一键（匹配表行与 PSI 解析值同用这一个函数，保证两侧同口径）：
    手机 / 平板 cat1 = 存储规范形；穿戴 cat1 = 表盘；平板 cat2 = 屏幕尺寸、cat3 = 柔光；
    其余段落为空串。"""
    if industry in ("phone", "tablet"):
        k1 = ip.normalize_storage(c1) or _s(c1)
    elif industry == "wearable":
        k1 = ip.normalize_case_size(c1) or ""
    else:
        k1 = _s(c1)
    k2 = _inch(c2) if industry == "tablet" else ""
    k3 = _s(c3) if industry == "tablet" else ""
    return (k1, k2, k3)


def cat3_of_spec(text):
    """规格原文 / sku_id 里的柔光标记 → PaperMatte / Normal（仅平板有意义）"""
    return "PaperMatte" if _RE_MATTE.search(str(text or "")) else "Normal"


# ---------------------------------------------------------------- PSI 串 → category

def guess_industry(text):
    """型号对不上、无品类可依时的文本启发式（手机为默认）。只影响 map_psi_sku 上的品类标注。"""
    t = str(text or "").upper()
    if re.search(r"\bTAB\b|\bPAD\b|MATEPAD|IPAD", t):
        return "tablet"
    return ip._psi_industry_of(text) or "phone"


def parse_psi_config(industry, product, product_sku, src_cat1="", src_cat2="", src_cat3=""):
    """一个 PSI 串 → category1~4 与 info。
    返回 dict：category1 / category2 / category3 / category4 / info / parse_source。
    parse_source：source = 源表自带配置列（旧形态）；rule = 规则从 SKU 串解析；
    unparsed = 该产业应有存储配置但 SKU 串里找不到（不分配销量）。"""
    out = {"category1": "", "category2": "", "category3": "", "category4": "", "info": "",
           "parse_source": "rule"}
    body = strip_brand_text(product_sku)
    core = strip_brand_text(product)
    if _s(src_cat1) or _s(src_cat2):
        if industry in ("phone", "tablet"):
            out["category1"] = ip.normalize_storage(src_cat1) or ""
        elif industry == "wearable":
            out["category1"] = ip.normalize_case_size(src_cat1) or ""
        elif industry in ("pc", "iot"):
            # PC / IoT 的 category1 就是整条规格原文；源表没给时拿 product_sku（规格串）顶上
            out["category1"] = _s(src_cat1) or body
        else:
            out["category1"] = _s(src_cat1)
        if industry == "tablet":
            out["category2"] = _inch(src_cat2)
            # 源表没给柔光：串里带柔光标记才是 PaperMatte，否则留空 = 该维度未知
            out["category3"] = _s(src_cat3) or ("PaperMatte" if _RE_MATTE.search(body) else "")
        # 旧形态的 product_sku 往往就是配置串本身（无额外信息）
        out["info"] = "" if not body or body == _s(src_cat1) else body
        out["parse_source"] = "source"
        return out
    if industry in ("phone", "tablet"):
        m = _RE_STO.search(body)
        if not m:
            out["parse_source"] = "unparsed"
            out["info"] = body
            return out
        out["category1"] = ip.normalize_storage(m.group(0))
        head, tail = body[:m.start()].strip(), body[m.end():].strip()
        if industry == "tablet":
            # 屏幕尺寸先看 SKU 里型号段那一个（型号之后、配置之前）；没有再看整串与 Product 名
            near = {_inch(x) for x in _RE_IN.findall(head)} - {""}
            if len(near) == 1:
                out["category2"] = next(iter(near))
            else:
                sizes = ({_inch(x) for x in _RE_IN.findall(body)}
                         | {_inch(x) for x in _RE_IN.findall(core)}) - {""}
                if len(sizes) == 1:
                    out["category2"] = next(iter(sizes))
                elif len(sizes) > 1:
                    out["category2"] = "/".join(sorted(sizes))  # 多尺寸：对不上任何一行，进待处理
            out["category3"] = "PaperMatte" if _RE_MATTE.search(body) else "Normal"
            rest = (head + " " + tail).replace(m.group(0), " ")
            out["info"] = re.sub(r"\s+", " ", rest).strip(" ，,；;")
        else:
            out["info"] = tail
        return out
    if industry == "wearable":
        m = _RE_MM.search(body)
        if m:
            out["category1"] = ip.normalize_case_size(m.group(0))
            out["info"] = body[m.end():].strip()
        else:
            out["info"] = body[len(core):].strip() if (core and body.startswith(core)) else body
        return out
    # 音频 / PC / IoT：不拆配置，型号名之外的信息全部进 info
    out["info"] = body[len(core):].strip() if (core and body.startswith(core)) else body
    return out


# ---------------------------------------------------------------- 匹配表索引

class MatchIndex:
    """匹配表（map_product）的取数索引：型号 → 各国有哪些 category 组合。
    只收在用且已挂接型号（model_id 非空）的行。"""

    def __init__(self, match_rows):
        self.by_model = {}
        self.by_name = collections.defaultdict(set)
        self.by_name_nosize = collections.defaultdict(set)
        self.explicit = collections.defaultdict(set)
        self.name_of = {}
        for r in match_rows or []:
            mid = _s(r.get("model_id"))
            if not mid or ip.jnum(r.get("is_active")) == 0:
                continue
            model = _s(r.get("model"))
            industry = industry_of(r.get("category"))
            rec = self.by_model.setdefault(mid, {
                "industry": industry or "phone", "category": _s(r.get("category")),
                "brand": _s(r.get("brand")), "model": model, "series": _s(r.get("series")),
                "by_cc": collections.defaultdict(set)})
            if industry:
                rec["industry"] = industry
            self.name_of.setdefault(mid, model)
            key = cat_key(rec["industry"], r.get("category1"), r.get("category2"), r.get("category3"))
            cc = _s(r.get("country"))
            if cc:
                rec["by_cc"][cc].add(key)
            k = name_key(model)
            if k:
                self.by_name[k].add(mid)
                self.by_name_nosize[name_key(model, drop_size=True)].add(mid)
            pp = _s(r.get("psi_product"))
            if pp:
                self.explicit[name_key(pp)].add(mid)

    def resolve(self, psi_product):
        """PSI 型号名 → 清洗后 model_id。返回 (model_id or '', 方式)。
        顺序：人工登记的 psi_product → 型号名精确 → 型号名去尺寸标记；
        同名多型号时我司优先（PSI 是我司销量；Band 10 华为与小米同名）。"""
        k = name_key(psi_product)
        if not k:
            return "", "unmatched"
        for how, table, key in (("xlsx", self.explicit, k), ("auto", self.by_name, k),
                                ("auto-nosize", self.by_name_nosize, name_key(psi_product, drop_size=True))):
            mids = table.get(key)
            if not mids:
                continue
            if len(mids) == 1:
                return next(iter(mids)), how
            own = sorted(m for m in mids if m.startswith("own-"))
            if len(own) == 1:
                return own[0], how
            return "", "ambiguous"
        return "", "unmatched"


# ---------------------------------------------------------------- 三张表的派生

def build_map_psi_sku(psi_rows, match_rows, overrides=None):
    """PSI 原始行 → map_psi_sku（一个不同的 Product + Product SKU 串一行）。
    overrides：{(psi_product, product_sku): {category1..4}} 人工覆盖，键完全相等才生效。"""
    idx = MatchIndex(match_rows)
    seen = collections.OrderedDict()
    for s in psi_rows or []:
        k = (_s(s.get("product")), _s(s.get("product_sku")))
        if not k[0] and not k[1]:
            continue
        rec = seen.setdefault(k, {"src1": _s(s.get("category1")), "src2": _s(s.get("category2")),
                                  "src3": _s(s.get("category3")), "ccs": set()})
        rec["ccs"].add(_s(s.get("cc")))
    overrides = overrides or {}
    rows = []
    for (product, product_sku), v in seen.items():
        mid, how = idx.resolve(product)
        industry = idx.by_model[mid]["industry"] if mid else guess_industry(product or product_sku)
        parsed = parse_psi_config(industry, product, product_sku, v["src1"], v["src2"], v["src3"])
        ov = overrides.get((product, product_sku)) or overrides.get((product, "")) or {}
        if any(_s(ov.get(f)) for f in ("category1", "category2", "category3", "category4")):
            for f in ("category1", "category2", "category3", "category4"):
                if _s(ov.get(f)):
                    parsed[f] = _s(ov.get(f))
            parsed["parse_source"] = "override"
        rows.append({
            "psi_product": product, "product_sku": product_sku,
            "category": INDUSTRY_CN.get(industry, industry),
            "category1": parsed["category1"], "category2": parsed["category2"],
            "category3": parsed["category3"], "category4": parsed["category4"], "info": parsed["info"],
            "model_id": mid, "model_source": how, "parse_source": parsed["parse_source"],
            "countries": len(v["ccs"]),
        })
    rows.sort(key=lambda r: (r["category"], r["psi_product"], r["product_sku"]))
    return rows


def place_psi_row(rec, cc, idx):
    """一个 PSI 串在某国落到匹配表的哪些 category 组合。返回 (状态, model_id, 目标键列表)。
    目标键可能不止一个：PSI 行没带某个维度值，而清洗表在该维度上拆成了多行
    （如旧格式 PSI 不带柔光，平板同存储同尺寸有 Normal 与 PaperMatte 两行）——
    这几行各自取同一个数（销量是「型号 × 已知维度」的合计），不猜怎么分。"""
    if rec is None:
        return "unparsed", "", []
    mid = rec["model_id"]
    if not mid:
        return ("ambiguous" if rec.get("model_source") == "ambiguous" else "unmatched_model"), "", []
    m = idx.by_model.get(mid)
    if m is None:
        return "unmatched_model", "", []
    if rec.get("parse_source") == "unparsed":
        return "unparsed", "", []
    have = m["by_cc"].get(cc)
    if not have:
        return "unmatched_country", "", []
    want = cat_key(m["industry"], rec["category1"], rec["category2"], rec["category3"])
    if want in have:
        return "matched", mid, [want]
    pool = {k for k in have
            if (k[0] == want[0] or k[0] == "" or want[0] == "")
            and (k[1] == want[1] or k[1] == "" or want[1] == "")
            and (k[2] == want[2] or k[2] == "" or want[2] == "")}
    if not pool:
        pool = {k for k in have  # 同存储同尺寸但柔光相反：唯一候选时交给下面判 config_mismatch
                if (k[0] == want[0] or k[0] == "" or want[0] == "")
                and (k[1] == want[1] or k[1] == "" or want[1] == "")}
        if not pool:
            return "unmatched_config", "", []
        if any(want[i] and k[i] and want[i] != k[i] for k in pool for i in range(3)):
            return "config_mismatch", "", []
    concrete = {k for k in pool if any(k)}  # 「未拆配置」的空壳行与具体行并存时丢掉空壳
    if concrete:
        pool = concrete
    for i in (2, 1, 0):  # 用 PSI 带的值继续缩小
        if len(pool) > 1 and want[i]:
            narrower = {k for k in pool if k[i] == want[i]}
            if narrower:
                pool = narrower
    # 缩不下去时：池里每一行都不与 PSI 声明的值矛盾（差异只在 PSI 没带的维度上）→ 各取同一个数；
    # 否则 = 两边都声明了值却分不开 → ambiguous
    if len(pool) > 1 and not all(
            all(k[i] == want[i] or not k[i] for i in range(3)) for k in pool):
        return "ambiguous", "", []
    return "matched", mid, sorted(pool)


def derive_fact_sales(psi_rows, psi_sku_rows, match_rows):
    """PSI 原始行 × map_psi_sku × 匹配表 → fact_sales。
    matched 行按（周 × 口径 × 国家 × 型号 × category1~3）求和，配置值取匹配表目标行的值；
    未分配行按（周 × 口径 × 国家 × PSI 串 × 原因）留痕，model_id 为空。"""
    idx = MatchIndex(match_rows)
    sku_idx = {(r["psi_product"], r["product_sku"]): r for r in psi_sku_rows or []}
    acc = collections.OrderedDict()
    diag = collections.Counter(  # 计数键全部预置为 0：前端 / 导出不需判键是否存在
        psiIn=0, psiMatched=0, psiUnmatchedModel=0, psiUnmatchedCountry=0, psiUnmatchedConfig=0,
        psiConfigMismatch=0, psiAmbiguous=0, psiUnparsed=0, psiNoPeriod=0, psiNonPositiveQty=0)
    for s in psi_rows or []:
        if s.get("qty") is None:
            continue
        if s["qty"] <= 0:
            diag["psiNonPositiveQty"] += 1
            continue
        period = normalize_period_id(s.get("period_id"))
        if not period:
            diag["psiNoPeriod"] += 1
            continue
        psi_type = _s(s.get("psi_type"))
        cc = _s(s.get("cc"))
        status, mid, targets = place_psi_row(
            sku_idx.get((_s(s.get("product")), _s(s.get("product_sku")))), cc, idx)
        diag["psiIn"] += 1
        if status == "matched":
            diag["psiMatched"] += 1
            m = idx.by_model[mid]
            for target in targets:
                key = (period, psi_type, cc, mid, target[0], target[1], target[2])
                slot = acc.get(key)
                if slot is None:
                    slot = acc[key] = {
                        "period_id": period, "psi_type": psi_type, "country_code": cc,
                        "category": m["category"], "brand": m["brand"], "model_id": mid,
                        "series": m["series"], "category1": target[0], "category2": target[1],
                        "category3": target[2], "category4": "", "product_sku": "",
                        "match_status": "matched", "qty": 0.0}
                slot["qty"] += s["qty"]
            continue
        diag["psi" + "".join(w.capitalize() for w in status.split("_"))] += 1  # psiUnmatchedConfig …
        sku = _s(s.get("product_sku")) or _s(s.get("product"))
        key = (period, psi_type, cc, "", sku, status)
        slot = acc.get(key)
        if slot is None:
            slot = acc[key] = {
                "period_id": period, "psi_type": psi_type, "country_code": cc,
                "category": "", "brand": "", "model_id": "", "series": "",
                "category1": "", "category2": "", "category3": "", "category4": "",
                "product_sku": sku, "match_status": status, "qty": 0.0}
        slot["qty"] += s["qty"]
    rows = sorted(acc.values(), key=lambda r: (r["period_id"], r["country_code"], r["model_id"],
                                               r["category1"], r["category2"], r["category3"],
                                               r["product_sku"]))
    sku_rows = psi_sku_rows or []
    diag["psiSkuRows"] = len(sku_rows)
    diag["psiSkuUnparsed"] = sum(1 for r in sku_rows if r["parse_source"] == "unparsed")
    diag["psiSkuNoModel"] = sum(1 for r in sku_rows if not r["model_id"])
    diag["factSalesRows"] = sum(1 for r in rows if r["match_status"] == "matched")
    return rows, dict(diag)


def is_simulated_type(psi_type):
    """与前端 isSimulatedPsiType 同口径：sim / mock / 模拟"""
    t = _s(psi_type).lower()
    return "sim" in t or "mock" in t or "模拟" in t


def pick_sales_types(fact_rows):
    """派生包发哪些口径：真实 PSI 同时带多个口径（如 Sell In + Sell Out）时只发 Sell Out，
    避免 page 侧把两个口径相加；模拟口径（simulated / 模拟）始终一起发。
    返回 (保留的行, 被排除的口径列表)。"""
    matched = [r for r in fact_rows or [] if r["match_status"] == "matched"]
    real = {_s(r["psi_type"]) for r in matched if r["psi_type"] and not is_simulated_type(r["psi_type"])}
    if len(real) <= 1:
        return fact_rows or [], []
    sell_out = sorted(t for t in real
                      if re.sub(r"[\s_-]+", "", t.lower()) in ("sellout", "sellthru", "sellthrough"))
    if not sell_out:
        return fact_rows or [], []
    keep_type = sell_out[0]
    return ([r for r in fact_rows or []
             if r["match_status"] != "matched" or r["psi_type"] == keep_type
             or is_simulated_type(r["psi_type"])], sorted(real - {keep_type}))


def sales_pack_rows(fact_rows, match_rows):
    """已解析的 fact_sales（matched）→ 派生包 sales 段（SalesSourceRow 形态 + modelId）。
    前端见 modelId 即直接采用，不再按型号名重新解析。"""
    name_of = {}
    for r in match_rows or []:
        if _s(r.get("model_id")) and _s(r.get("model")):
            name_of.setdefault(r["model_id"], r["model"])
    out = []
    for f in fact_rows or []:
        if f["match_status"] != "matched":
            continue
        qty = f["qty"]
        if isinstance(qty, float) and qty.is_integer():
            qty = int(qty)
        row = {"country": f["country_code"], "product": name_of.get(f["model_id"], ""),
               "modelId": f["model_id"], "category1": f["category1"] or None,
               "category2": f["category2"] or None, "periodId": f["period_id"], "qty": qty,
               "psiType": f["psi_type"]}
        if f["category3"]:
            row["category3"] = f["category3"]
        out.append(row)
    return out
