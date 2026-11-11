# 真实数据接入报告（scripts/ingest_real.py）

生成时间：2026-11-11T23:45:23+08:00

## 一、总体

- matrix-only：2 条替代别名停用置空（Honor X9b Max; Soundcore - AeroFit Pro (Anker)）
- 输入文件 5 个，原始行 98,235
- 事实源仅读取页签「全量数据」；其余页签保留为证据，不进入事实包
- 源文件页签：全量数据表-清洗版.xlsx：全量数据, 未入全量与待复核, 不可采_没货, 复检修复记录, 统计, 其他证据, 源文件索引, 合并冲突
- 源文件页签：BR_20261104.xlsx：全量数据, 未入全量_具体原因, 不可采_没货, 复检修复记录, 统计
- 源文件页签：MX_20261109.xlsx：全量数据, 未入全量_具体原因, 不可采_没货, 库存另存, 复检修复记录, 统计, 汇率与标准
- 源文件页签：PL_W46_20261111.xlsx：全量数据, 未入全量_具体原因, 不可采_没货, 统计, 复检修复记录
- 源文件页签：RU_20261102.xlsx：全量数据, 未入全量_具体原因, 不可采_没货, 统计, 复检修复记录
- 清洗后事实行 96,628
- 时间维 202619(2026-05-06) → 202646(2026-11-11)，共 28 周
- 低侧可疑价（<15% 参考价，仅报告不剔除）104 行
- 分国档位：378 个 国家×型号 采用矩阵声明，其余按该国参考价推算
- 对标上限4：5 组超限截断 9 条，截断后共 887 条（每配置 ≤4 款竞品）
- 事实包 96,628 行；b64 2,776,768 B（gzip 2,082,575 B）
- 修正：MatePad Air 2026 规格 12.2→12（R国 W45 采集笔误归并） 6 行
- 修正：价格单位错位(×100) 68 行
- 修正：价格单位错位(÷100) 31 行
- 修正：品牌→APPLE 2 行
- 修正：品牌→HUAWEI 11 行
- 修正：品牌→LENOVO 4 行
- 修正：品牌→XIAOMI 3 行
- 修正：品类多数票修正 2 行
- 修正：汇率倒挂(取倒数) 213 行
- 修正：缺品类补齐 31 行
- 剔除：USD 价格>20000(不可信) 1 行
- 剔除：无周期 0 行
- 剔除：无型号 309 行
- 剔除：无汇率 0 行
- 剔除：未知国家 0 行
- 剔除：重复行(周×SKU×国×渠道×店铺) 1297 行

## 二、覆盖面（有数国家）

| 国家 | 周数 | SKU | 事实行 | 默认电渠 | 核心电渠 |
|---|---|---|---|---|---|
| 法国(FR) | 14 | 139 | 1,310 | Amazon | Amazon |
| 德国(DE) | 14 | 314 | 3,199 | Amazon | Amazon,MediaMarkt |
| 土耳其(TR) | 17 | 168 | 1,820 | Hepsiburada | Hepsiburada,Amazon |
| 意大利(IT) | 14 | 135 | 1,239 | Amazon | Amazon |
| 英国(GB) | 14 | 127 | 1,049 | Amazon | Amazon |
| 西班牙(ES) | 14 | 130 | 1,325 | Amazon | Amazon |
| 罗马尼亚(RO) | 14 | 81 | 772 | eMAG | eMAG |
| 波兰(PL) | 15 | 200 | 1,945 | MediaExpert | MediaExpert,Euro |
| 哥伦比亚(CO) | 4 | 9 | 25 | Mercado Libre | Mercado Libre |
| 阿根廷(AR) | 3 | 72 | 155 | Mercado Libre | Mercado Libre |
| 智利(CL) | 2 | 35 | 67 | Mercado Libre | Mercado Libre |
| 秘鲁(PE) | 5 | 60 | 236 | Hiraoka | Hiraoka |
| 巴西(BR) | 5 | 97 | 341 | Mercado Libre | Mercado Libre,Shopee,Amazon |
| 墨西哥(MX) | 27 | 437 | 11,665 | Mercado Libre | Mercado Libre,Amazon |
| 南非(ZA) | 6 | 149 | 657 | TAKEALOT | TAKEALOT |
| 沙特(SA) | 22 | 701 | 18,703 | Jarir | Jarir,eXtra,Amazon |
| 阿联酋(AE) | 23 | 369 | 7,202 | SHARAFDG | SHARAFDG,NOON,CARREFOUR |
| 马来西亚(MY) | 26 | 471 | 6,192 | Shopee | Shopee |
| 印尼(ID) | 26 | 258 | 4,031 | Shopee | Shopee |
| 日本(JP) | 9 | 53 | 364 | Amazon | Amazon |
| 新加坡(SG) | 25 | 295 | 4,625 | Shopee | Shopee |
| 泰国(TH) | 26 | 313 | 4,643 | Shopee | Shopee |
| 菲律宾(PH) | 26 | 369 | 5,125 | Shopee | Shopee |
| 越南(VN) | 24 | 173 | 2,561 | Shopee | Shopee |
| R国(RU) | 24 | 610 | 17,377 | DNS | DNS |

## 三、矩阵解析未命中清单

共 46 条：

- [comp] 沙特 audio「Nothing Ear (a)」：none
- [comp] 沙特 audio「JBL Live Buds 3」：none
- [comp] 沙特 audio「Soundcore Liberty 4 NC」：none
- [comp] 沙特 audio「JBL Wave Buds」：none
- [comp] 沙特 audio「Soundcore P30i」：none
- [comp] 沙特 phone「amsung Galaxy S26+」：none
- [comp] 沙特 phone「HONOR Magic V6」：none
- [comp] 沙特 phone「OPPO Find X9 Pro」：none
- [comp] 沙特 tablet「Lenovo Legion Tab」：none
- [comp] 沙特 tablet「Honor X9b Max」：none
- [own] 阿联酋 wearable「WATCH ultimate」：none
- [comp] 阿联酋 wearable「COROS PACE Pro」：none
- [comp] 阿联酋 wearable「Samsung Galaxy Watch FE」：none
- [comp] 阿联酋 wearable「Samsung Galaxy Watch FE」：none
- [own] 阿联酋 wearable「KIDS 4 Pro」：none
- [comp] 阿联酋 wearable「Amazfit Band 7」：none
- [comp] 阿联酋 wearable「Amazfit Band 7」：none
- [comp] 阿联酋 audio「Nothing Ear (a)」：none
- [comp] 阿联酋 audio「JBL Live Buds 3」：none
- [comp] 阿联酋 audio「Soundcore Liberty 4 NC」：none
- [comp] 阿联酋 audio「JBL Wave Buds」：none
- [comp] 阿联酋 audio「Soundcore P30i」：none
- [comp] 阿联酋 phone「amsung Galaxy S26+」：none
- [comp] 阿联酋 phone「HONOR Magic V6」：none
- [comp] 阿联酋 phone「OPPO Find X9 Pro」：none
- [comp] 阿联酋 tablet「Lenovo Legion Tab」：none
- [comp] 阿联酋 tablet「Honor X9b Max」：none
- [comp] 南非 audio「Soundcore Liberty 4NC」：none
- [comp] 墨西哥 wearable「COROS Pace Pro」：none
- [comp] 墨西哥 tablet「Apple iPad Air 16」：none
- [comp] 巴西 wearable「COROS Pace Pro」：none
- [comp] 巴西 phone「Samsung Galazy S26+」：none
- [comp] 巴西 phone「Honor Magic 18 Pro」：none
- [comp] 巴西 tablet「Apple iPad Air 16」：none
- [own] 默认 wearable「WATCH ultimate」：none
- [comp] 默认 wearable「Garmin Fenix 7 Pro」：none
- [comp] 默认 wearable「COROS Pace Pro」：none
- [comp] 默认 wearable「Amazfit Active」：none
- [comp] 默认 wearable「Aimoto Life Button」：none
- [comp] 默认 wearable「Aimoto Life Button」：none
- [own] 默认 wearable「KIDS 4 Pro」：none
- [comp] 默认 wearable「Aimoto Life Button」：none
- [comp] 默认 wearable「Amazfit Band 7」：none
- [comp] 默认 audio「Galaxy Buds On」：none
- [comp] 默认 audio「Galaxy Buds On」：none
- [comp] 默认 audio「Yandex Drop」：none

## 四、对标样例（每国前 8 条）

- SA｜own-huawei-freebuds-pro-5 — ← APPLE AirPods Pro 3 —（sort 1）
- SA｜own-huawei-freebuds-pro-5 — ← SAMSUNG Galaxy Buds3 Pro —（sort 2）
- SA｜own-huawei-freebuds-7i — ← APPLE AirPods 5 —（sort 1）
- SA｜own-huawei-freebuds-7i — ← SAMSUNG Galaxy Buds FE —（sort 2）
- SA｜own-huawei-freebuds-neo — ← XIAOMI Redmi Buds 6 Pro —（sort 1）
- SA｜own-huawei-freebuds-se-4-anc — ← XIAOMI Redmi Buds 6 Lite —（sort 1）
- SA｜own-huawei-pura-90s-pro-max 12+256 GB ← SAMSUNG S26 Ultra 12+256 GB（sort 1）
- SA｜own-huawei-pura-90s-pro-max 12+256 GB ← APPLE iPhone 18 Pro Max 12+256 GB（sort 2）
- AE｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 3 —（sort 1）
- AE｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- AE｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 11 —（sort 1）
- AE｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- AE｜own-huawei-watch-gt-7 — ← APPLE Watch SERIES 11 —（sort 1）
- AE｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 Classic —（sort 2）
- AE｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- AE｜own-huawei-watch-fit-5 — ← XIAOMI Watch S4 —（sort 1）
- ZA｜own-huawei-nova-15-max 8+256 GB ← SAMSUNG A37 8+256 GB（sort 1）
- ZA｜own-huawei-freeclip-2 — ← APPLE AirPods 4 —（sort 1）
- ZA｜own-huawei-freebuds-pro-5 — ← APPLE AirPods Pro 3 —（sort 1）
- ZA｜own-huawei-freebuds-7i — ← APPLE AirPods 4 ANC —（sort 1）
- MX｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- MX｜own-huawei-watch-ultimate-2 — ← GARMIN Fenix 9 —（sort 2）
- MX｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- MX｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- MX｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- MX｜own-huawei-watch-gt-7 — ← APPLE Watch SERIES 12 —（sort 2）
- MX｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- MX｜own-huawei-watch-fit-5-pro — ← APPLE Watch SERIES 12 —（sort 1）
- BR｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- BR｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- BR｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- BR｜own-huawei-watch-gt-7 — ← APPLE Watch SERIES 12 —（sort 2）
- BR｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- BR｜own-huawei-watch-fit-5-pro — ← APPLE Watch SERIES 12 —（sort 1）
- BR｜own-huawei-watch-fit-5-pro — ← XIAOMI Watch S5 —（sort 2）
- BR｜own-huawei-watch-fit-5 — ← APPLE Watch SE 3 —（sort 1）
- DE｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- DE｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- ES｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- ES｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- FR｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- FR｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- GB｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- GB｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- IT｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- IT｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- MY｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- MY｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- PH｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- PL｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- PL｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- RU｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- RU｜own-huawei-watch-ultimate-2 — ← GARMIN Fenix 8 Pro —（sort 2）
- RU｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 3）
- SG｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- TH｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- TH｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- TR｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- ZA｜own-huawei-watch-ultimate-2 — ← APPLE Watch Ultra 4 —（sort 1）
- ZA｜own-huawei-watch-ultimate-2 — ← SAMSUNG Galaxy Watch Ultra（2025） —（sort 2）
- AR｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- CL｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- DE｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- DE｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- ES｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- ES｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- FR｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- FR｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- GB｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- GB｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- ID｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- IT｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- IT｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- JP｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- JP｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- MY｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- MY｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- PH｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- PH｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- PL｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- PL｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- RO｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- RO｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- RU｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- RU｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- SG｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- SG｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- TH｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- TH｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- TR｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- TR｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- VN｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- ZA｜own-huawei-watch-gt-7-pro — ← APPLE Watch SERIES 12 —（sort 1）
- ZA｜own-huawei-watch-gt-7-pro — ← SAMSUNG Galaxy Watch 9 —（sort 2）
- AR｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- AR｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- AR｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- CL｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- CL｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- CL｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- DE｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- DE｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- DE｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- ES｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- ES｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- ES｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- FR｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- FR｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- FR｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- GB｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- GB｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- GB｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- ID｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- ID｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- ID｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- IT｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- IT｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- JP｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- JP｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 2）
- MY｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- MY｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- MY｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- PE｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 1）
- PH｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- PH｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- PH｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- PL｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- PL｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- PL｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- RO｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- RU｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- RU｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- RU｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- SG｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- SG｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- SG｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- TH｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- TH｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- TH｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- TR｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- TR｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- TR｜own-huawei-watch-gt-7 — ← XIAOMI Watch S5 —（sort 3）
- VN｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 9 —（sort 1）
- VN｜own-huawei-watch-gt-7 — ← SAMSUNG Galaxy Watch 8 —（sort 2）
- DE｜own-huawei-watch-gt-runner-2 — ← GARMIN Forerunner 570 —（sort 1）
- ES｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- FR｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- GB｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- ID｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- ID｜own-huawei-watch-fit-5-pro — ← XIAOMI Watch S5 —（sort 2）
- IT｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- JP｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- JP｜own-huawei-watch-fit-5-pro — ← XIAOMI Watch S5 —（sort 2）
- MY｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- PH｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- PH｜own-huawei-watch-fit-5-pro — ← XIAOMI Watch S5 —（sort 2）
- PL｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- SG｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- SG｜own-huawei-watch-fit-5-pro — ← XIAOMI Watch S5 —（sort 2）
- TH｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- TR｜own-huawei-watch-fit-5-pro — ← XIAOMI Watch S5 —（sort 1）
- VN｜own-huawei-watch-fit-5-pro — ← APPLE Watch SE 3 —（sort 1）
- ID｜own-huawei-watch-fit-5 — ← XIAOMI Watch S5 —（sort 1）
- ID｜own-huawei-watch-fit-5 — ← XIAOMI Band 10 Pro —（sort 2）
- IT｜own-huawei-watch-fit-5 — ← XIAOMI Band 10 Pro —（sort 1）
- JP｜own-huawei-watch-fit-5 — ← XIAOMI Watch S5 —（sort 1）
- JP｜own-huawei-watch-fit-5 — ← XIAOMI Band 10 Pro —（sort 2）
- RO｜own-huawei-watch-fit-5 — ← XIAOMI Redmi Watch 6 —（sort 1）
- TR｜own-huawei-watch-fit-5 — ← XIAOMI Watch S5 —（sort 1）
- VN｜own-huawei-watch-fit-5 — ← XIAOMI Band 10 Pro —（sort 1）
- VN｜own-huawei-watch-fit-5 — ← XIAOMI Redmi Watch 6 —（sort 2）
- PE｜own-huawei-band-11-pro — ← XIAOMI Redmi Watch 5 Lite —（sort 1）
- VN｜own-huawei-band-11-pro — ← XIAOMI Band 10 —（sort 1）
- VN｜own-huawei-band-11-pro — ← XIAOMI Band 10 Pro —（sort 2）
- AR｜own-huawei-band-11 — ← XIAOMI Band 10 —（sort 1）
- AR｜own-huawei-band-11 — ← XIAOMI Redmi Watch 5 Lite —（sort 2）
- PE｜own-huawei-band-11 — ← XIAOMI Redmi Watch 5 Lite —（sort 1）
- PE｜own-huawei-matepad-pro-2025 13.2" 12+512 GB PaperMatte ← SAMSUNG Galaxy Tab S11 11" 12+128 GB（sort 1）
- PE｜own-huawei-matepad-11-5-2025 11.5" 8+128 GB ← XIAOMI Redmi Pad 2 Pro 12.1" 6+128 GB（sort 1）
- PE｜own-huawei-matepad-11-5-2025 11.5" 8+256 GB PaperMatte ← XIAOMI Redmi Pad 2 Pro 12.1" 6+128 GB（sort 1）
- PE｜own-huawei-matepad-se 11" 6+128 GB ← HONOR Pad X8B 11" 4+128 GB（sort 1）
- PE｜own-huawei-matepad-se 11" 6+128 GB ← SAMSUNG Galaxy Tab A11+ 8.7" 4+64 GB（sort 2）

## 五、大促日历解析

- 德国｜免税日｜2026-02-11→2026-02-20 深
- 德国｜亚马逊春促｜2026-03-01→2026-03-31 深
- 德国｜复活节｜2026-05-01→2026-05-31 深
- 德国｜亚马逊prime day｜2026-06-21→2026-07-10 深
- 德国｜返校季｜2026-07-01→2026-08-31 中
- 德国｜亚马逊prime day 2｜2026-09-21→2026-10-10 深
- 德国｜黑五｜2026-11-01→2026-11-30 深
- 德国｜圣诞｜2026-12-01→2026-12-31 深
- R国｜情人节-小促｜2026-02-01→2026-02-28 浅
- R国｜情人节-中促｜2026-03-01→2026-03-31 中
- R国｜BTS返校季-预热｜2026-07-01→2026-07-31 中
- R国｜BTS返校季｜2026-08-01→2026-09-30 深
- R国｜新年季｜2026-12-01→2027-01-31 深
- 沙特｜斋月大促 Ramadan｜2026-02-01→2026-03-31 中
- 沙特｜开斋节  Eid Al-Fitr｜2026-03-01→2026-04-30 深
- 沙特｜宰牲节  Eid Al-Adha｜2026-06-01→2026-07-31 深
- 沙特｜返校季  Back to School｜2026-08-01→2026-09-30 深
- 沙特｜沙特国庆日  Saudi National Day｜2026-09-01→2026-09-30 中
- 沙特｜白色周五  White Friday / Noon 黄五 Yellow Friday｜2026-11-01→2026-11-30 深
- 沙特｜12.12  年终促｜2026-12-01→2026-12-31 中
- 沙特｜节礼日  + 年终清仓｜2026-12-21→2026-12-31 中
- 南非｜开斋节  Eid Al-Fitr｜2026-03-01→2026-04-30 深
- 南非｜宰牲节  Eid Al-Adha｜2026-06-01→2026-07-31 深
- 南非｜返校季  Back to School｜2026-08-01→2026-09-30 深
- 南非｜白色周五  White Friday / Noon 黄五 Yellow Friday｜2026-11-01→2026-11-30 深
- 南非｜Fire Sale｜2026-02-21→2026-02-28 中
- 南非｜Birthday｜2026-05-21→2026-05-31 中
- 南非｜Takealotmore Days｜2026-07-21→2026-07-31 中
- 马来西亚｜元旦 1.1 Sale｜2026-01-01→2026-01-20 浅
- 马来西亚｜农历新年 Chinese New Year (2.17-18)｜2026-02-11→2026-02-28 中
- 马来西亚｜斋月&开斋节购物季 Ramadan-Raya (Aidilfitri 3.21-22)｜2026-02-11→2026-03-20 深
- 马来西亚｜5.5 Mega Sale｜2026-05-01→2026-05-10 中
- 马来西亚｜6.6 Super Sale｜2026-06-01→2026-06-10 中
- 马来西亚｜7.7 Mid-Year Sale｜2026-07-01→2026-07-10 中
- 马来西亚｜8.8 Mega Sale + 国庆 Merdeka (8.31)｜2026-08-01→2026-08-10 中
- 马来西亚｜9.9 Super Shopping Day｜2026-09-01→2026-09-20 深
- 马来西亚｜10.10 Brands Festival｜2026-10-01→2026-10-20 中
- 马来西亚｜屠妖节 Deepavali (11.8)｜2026-11-01→2026-11-10 中
- 马来西亚｜11.11 Big Sale｜2026-11-01→2026-11-30 深
- 马来西亚｜黑五/网一 BFCM (11.27-30)｜2026-11-21→2026-11-30 中
- 马来西亚｜12.12 Birthday Sale｜2026-12-01→2026-12-31 深
- 马来西亚｜圣诞节｜2026-12-01→2026-12-31 中
- 泰国｜元旦 1.1｜2026-01-01→2026-01-20 浅
- 泰国｜农历新年 Chinese New Year｜2026-02-11→2026-02-28 中
- 泰国｜宋干节 Songkran (4.13-15) 商场促销｜2026-04-11→2026-04-30 中
- 泰国｜开学季（5.16开学）｜2026-04-21→2026-05-31 中
- 泰国｜6.6 Mid-Year Sale｜2026-06-01→2026-06-10 中
- 泰国｜Amazing Thailand Grand Sale 政府购物节｜2026-06-21→2026-08-10 中
- 泰国｜8.8 + 母亲节 (8.12)｜2026-08-11→2026-08-31 中
- 泰国｜9.9 Super Shopping Day｜2026-09-01→2026-09-20 深
- 泰国｜水灯节 Loy Krathong (约11.23满月)｜2026-11-01→2026-11-30 浅
- 泰国｜11.11（预售一般11.1起）｜2026-11-01→2026-11-30 深
- 泰国｜12.12 + 父亲节(12.5)/圣诞新年｜2026-12-01→2026-12-31 深
- 菲律宾｜元旦 1.1｜2026-01-01→2026-01-20 浅
- 菲律宾｜2.2 情人节 + 农历新年(2.17)｜2026-02-11→2026-02-28 中
- 菲律宾｜3.3 + Lazada 生日大促(3.27-31)｜2026-03-01→2026-03-20 中
- 菲律宾｜圣周 Holy Week (4.2-4.4)｜2026-04-01→2026-04-30 浅
- 菲律宾｜5.5 Brand Festival｜2026-05-01→2026-05-20 中
- 菲律宾｜返校季 + 6.6 Mid-Year Sale｜2026-04-21→2026-05-31 中
- 菲律宾｜8.8 Mega Sale｜2026-08-11→2026-08-31 浅
- 菲律宾｜9.9 Super Sale｜2026-09-01→2026-09-20 深
- 菲律宾｜10.10 Brands Festival｜2026-10-01→2026-10-20 中
- 菲律宾｜11.11 Mega Pamasko｜2026-11-01→2026-11-30 深
- 菲律宾｜黑五 BFCM (11.27-30)｜2026-11-21→2026-11-30 中
- 菲律宾｜12.12 Year-End Sale｜2026-12-11→2026-12-31 深
- 菲律宾｜圣诞 Simbang Gabi/Noche Buena｜2026-12-11→2026-12-31 中

## 六、大促渠道未识别（仍按全渠道落库，待补 PROMO_PLATFORMS 映射）

共 0 条：


## 七、低侧可疑价（不剔除，待人工复核）

共 104 行：单位错位修正后仍 < 15% × dim_product 参考价（ref_price_usd），仅列示：

- PH｜202619｜APPLE Watch SERIES 11 —｜$34.40 vs 参考 $543.73
- PH｜202619｜APPLE Watch SERIES 11 —｜$39.53 vs 参考 $543.73
- PH｜202619｜APPLE Watch SERIES 11 —｜$39.53 vs 参考 $543.73
- PH｜202619｜APPLE Watch SERIES 11 —｜$19.98 vs 参考 $543.73
- PH｜202619｜GARMIN Instinct 3 —｜$57.44 vs 参考 $596.09
- PH｜202619｜GARMIN Venu X1 —｜$115.19 vs 参考 $858.59
- RU｜202619｜BOSE Ultra Open —｜$29.90 vs 参考 $335.78
- RU｜202619｜APPLE iPhone 16 Pro Max 12+256 GB｜$6.76 vs 参考 $1,786.40
- RU｜202619｜APPLE iPhone 17 8+512 GB｜$6.76 vs 参考 $1,156.98
- RU｜202619｜APPLE iPhone 17 Pro 12+256 GB｜$6.76 vs 参考 $1,628.51
- RU｜202619｜APPLE iPhone 17 Pro 12+256 GB｜$6.76 vs 参考 $1,628.51
- RU｜202619｜APPLE iPhone 17 Pro 12+512 GB｜$6.76 vs 参考 $1,628.51
- RU｜202619｜APPLE iPhone 17 Pro Max 12+256 GB｜$6.76 vs 参考 $1,786.40
- RU｜202619｜APPLE iPhone 17 Pro Max 12+256 GB｜$6.76 vs 参考 $1,786.40
- RU｜202619｜APPLE iPhone Air 512 GB｜$6.76 vs 参考 $1,466.88
- RU｜202619｜XIAOMI 17 Ultra 16+512 GB｜$6.76 vs 参考 $1,599.73
- RU｜202619｜HUAWEI nova Y73 8+128 GB｜$6.77 vs 参考 $178.05
- RU｜202619｜APPLE iPhone 16 Pro 512 GB｜$6.94 vs 参考 $1,653.07
- RU｜202619｜APPLE iPhone 16 Pro Max 12+512 GB｜$6.94 vs 参考 $1,786.40
- RU｜202619｜APPLE iPhone 17 Pro 12+512 GB｜$6.94 vs 参考 $1,628.51
- RU｜202619｜APPLE iPhone 17 Pro Max 12+512 GB｜$6.94 vs 参考 $1,786.40
- RU｜202619｜APPLE iPhone 17 Pro Max 12+512 GB｜$6.94 vs 参考 $1,786.40
- RU｜202619｜APPLE iPhone Air 1 TB｜$6.94 vs 参考 $1,466.88
- RU｜202619｜XIAOMI 17 Ultra 16+512 GB｜$6.94 vs 参考 $1,599.73
- RU｜202619｜HUAWEI nova Y63 6+128 GB｜$6.94 vs 参考 $143.39
- RU｜202619｜XIAOMI Redmi Pad 2 11" 4+128 GB｜$7.25 vs 参考 $237.56
- RU｜202619｜HONOR Pad X8B 11" 4+128 GB｜$7.37 vs 参考 $216.76
- RU｜202619｜XIAOMI 17 Ultra 16+1 TB｜$7.40 vs 参考 $1,599.73
- RU｜202619｜XIAOMI 17 Ultra 16+1 TB｜$7.40 vs 参考 $1,599.73
- RU｜202619｜HONOR Pad X9A 11.5" 6+128 GB｜$8.07 vs 参考 $313.13
- RU｜202619｜HONOR Pad X9A 11.5" 6+128 GB｜$8.07 vs 参考 $313.13
- RU｜202619｜HONOR Pad X9A 11.5" 8+256 GB｜$8.07 vs 参考 $313.13
- RU｜202619｜HUAWEI nova 14i 8+128 GB｜$9.21 vs 参考 $221.85
- RU｜202619｜HUAWEI nova 14i 8+256 GB｜$9.21 vs 参考 $221.85
- RU｜202619｜VIVO V60 Lite 12+256 GB｜$9.28 vs 参考 $323.34
- RU｜202619｜HUAWEI nova Y73 8+256 GB｜$10.34 vs 参考 $178.05
- RU｜202619｜SAMSUNG Galaxy Tab S10 Lite 10.9" 6+128 GB｜$12.98 vs 参考 $408.17
- RU｜202619｜APPLE iPhone 16E 128 GB｜$15.85 vs 参考 $746.40
- RU｜202619｜SAMSUNG Galaxy Tab S11 11" 12+256 GB｜$20.32 vs 参考 $993.36
- RU｜202619｜XIAOMI Redmi Pad SE 11" 8+256 GB｜$20.62 vs 参考 $190.42
- RU｜202619｜SAMSUNG Galaxy Tab A9+ 11" 8+128 GB｜$22.44 vs 参考 $225.86
- RU｜202619｜SAMSUNG Galaxy Tab S10 FE+ 10.9" 12+256 GB｜$27.44 vs 参考 $718.71
- RU｜202619｜SAMSUNG Galaxy Tab S10 FE+ 10.9" 8+128 GB｜$27.44 vs 参考 $718.71
- RU｜202619｜SAMSUNG Galaxy Tab S10 FE+ 13.1" 8+128 GB｜$27.44 vs 参考 $718.71
- RU｜202619｜SAMSUNG Galaxy Tab S9 FE+ 12.4" 12+256 GB｜$29.97 vs 参考 $910.51
- RU｜202619｜BOSE Ultra Open —｜$31.40 vs 参考 $335.78
- RU｜202619｜HONOR Pad 10 12.1" 8+256 GB｜$43.73 vs 参考 $426.40
- MY｜202620｜SAMSUNG Galaxy Tab S10+ 12.4" 12+256 GB｜$134.64 vs 参考 $1,266.40
- RU｜202622｜BOSE Ultra Open —｜$25.38 vs 参考 $335.78
- RU｜202623｜BOSE Ultra Open —｜$26.43 vs 参考 $335.78
- ID｜202624｜HUAWEI Watch GT 6 Pro —｜$24.95 vs 参考 $363.38
- RU｜202624｜BOSE Ultra Open —｜$18.75 vs 参考 $335.78
- SA｜202627｜XIAOMI Watch 5 —｜$45.07 vs 参考 $319.94
- RU｜202627｜BOSE Ultra Open —｜$22.71 vs 参考 $335.78
- PH｜202628｜HUAWEI Watch Ultimate 2 —｜$47.79 vs 参考 $893.64
- PH｜202628｜HUAWEI Watch Ultimate 2 —｜$47.79 vs 参考 $893.64
- TH｜202628｜HUAWEI Watch Ultimate 2 —｜$41.97 vs 参考 $893.64
- RU｜202630｜BOSE Ultra Open —｜$45.66 vs 参考 $335.78
- RU｜202631｜BOSE Ultra Open —｜$36.52 vs 参考 $335.78
- IT｜202632｜SAMSUNG Galaxy Z Fold8 Ultra 16+1 TB｜$333.33 vs 参考 $2,495.28
- RU｜202632｜BOSE Ultra Open —｜$35.07 vs 参考 $335.78
- RU｜202633｜BOSE Ultra Open —｜$30.58 vs 参考 $335.78
- IT｜202633｜SAMSUNG Galaxy Z Fold8 Ultra 16+1 TB｜$333.33 vs 参考 $2,495.28
- IT｜202634｜SAMSUNG Galaxy Z Fold8 Ultra 16+1 TB｜$337.21 vs 参考 $2,495.28
- IT｜202635｜SAMSUNG Galaxy Z Fold8 Ultra 16+1 TB｜$337.21 vs 参考 $2,495.28
- IT｜202636｜SAMSUNG Galaxy Z Fold8 Ultra 16+1 TB｜$318.60 vs 参考 $2,495.28
- SA｜202637｜HONOR Pad X9 11.5" 4+128 GB｜$26.40 vs 参考 $246.30
- IT｜202637｜SAMSUNG Galaxy Z Fold8 Ultra 16+1 TB｜$318.60 vs 参考 $2,495.28
- AE｜202638｜APPLE iPhone Air 512 GB｜$206.67 vs 参考 $1,466.88
- SA｜202639｜HONOR Pad X9 11.5" 4+128 GB｜$26.40 vs 参考 $246.30
- DE｜202639｜APPLE iPhone Duo 12+1TB｜$350.57 vs 参考 $3,572.69
- DE｜202639｜APPLE iPhone Duo 12+2TB｜$436.78 vs 参考 $3,572.69
- SA｜202640｜HONOR Pad X9 11.5" 4+128 GB｜$26.40 vs 参考 $246.30
- SA｜202641｜HONOR Pad X9 11.5" 4+128 GB｜$26.40 vs 参考 $246.30
- RO｜202641｜APPLE iPhone 17 Pro Max 12+1 TB｜$199.16 vs 参考 $1,786.40
- BR｜202641｜APPLE Watch Ultra 3 —｜$141.43 vs 参考 $1,011.41
- SA｜202642｜HONOR Pad X9 11.5" 4+128 GB｜$26.40 vs 参考 $246.30
- DE｜202642｜APPLE iPhone Duo 12+1TB｜$342.70 vs 参考 $3,572.69
- DE｜202642｜APPLE iPhone Duo 12+2TB｜$426.97 vs 参考 $3,572.69
- SA｜202644｜HONOR Pad X9 11.5" 4+128 GB｜$26.40 vs 参考 $246.30
- MY｜202644｜OPPO Watch X3 —｜$328.33 vs 参考 $2,456.77
- MY｜202644｜OPPO Watch X3 —｜$353.20 vs 参考 $2,456.77
- MY｜202644｜OPPO Find X10 12+256 GB｜$1132.76 vs 参考 $24,509.56
- PH｜202644｜OPPO Find X10 12+512 GB｜$2350.71 vs 参考 $24,509.56
- PH｜202644｜OPPO Find X10 12+512 GB｜$2350.71 vs 参考 $24,509.56
- MY｜202644｜OPPO Find X10 12+512 GB｜$1231.28 vs 参考 $24,509.56
- MY｜202644｜OPPO Find X10 12+512 GB｜$1231.28 vs 参考 $24,509.56
- DE｜202644｜APPLE iPhone 18 Pro Max 12+2TB｜$333.33 vs 参考 $2,260.82
- DE｜202644｜APPLE iPhone Duo 12+1TB｜$338.89 vs 参考 $3,572.69
- DE｜202644｜APPLE iPhone Duo 12+2TB｜$422.22 vs 参考 $3,572.69
- CL｜202644｜GARMIN Fenix 9 —｜$152.46 vs 参考 $1,200.55
- CL｜202644｜GARMIN Fenix 9 —｜$166.91 vs 参考 $1,200.55
- MY｜202645｜OPPO Find X10 12+256 GB｜$1274.26 vs 参考 $24,509.56
- MY｜202645｜OPPO Find X10 12+256 GB｜$1274.26 vs 参考 $24,509.56
- MY｜202645｜OPPO Find X10 12+512 GB｜$1396.81 vs 参考 $24,509.56
- MY｜202645｜OPPO Find X10 12+512 GB｜$1396.81 vs 参考 $24,509.56
- PH｜202645｜OPPO Find X10 12+512 GB｜$2361.45 vs 参考 $24,509.56
- SA｜202645｜APPLE iPhone 17 Pro 12+512 GB｜$159.73 vs 参考 $1,628.51
- SA｜202645｜HONOR Pad X9 11.5" 4+128 GB｜$26.40 vs 参考 $246.30
- DE｜202645｜APPLE iPhone Duo 12+1TB｜$342.70 vs 参考 $3,572.69
- CL｜202645｜GARMIN Fenix 9 —｜$153.36 vs 参考 $1,200.55
- CL｜202645｜GARMIN Fenix 9 —｜$167.90 vs 参考 $1,200.55
- AE｜202645｜OPPO Find X10 12+512 GB｜$2722.67 vs 参考 $24,509.56
- AE｜202645｜OPPO Find X10 12+512 GB｜$2722.67 vs 参考 $24,509.56