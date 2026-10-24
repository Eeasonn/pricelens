// ============================================================
// 数据口径说明（第一百三十七轮建 / 第一百三十九轮翻修）：页头右上角问号入口 → 居中弹窗。
// 内容 = 全站对原始采集数据所做的全部处理规则的业务语言说明：
// 取价口径 / 默认店铺 / 平台店铺筛选 / 多平台比价 / 时间粒度 / 销量估算 /
// 汇率 / 数据质量标记 / 权益与大促档期 / 价格预警。修改任何取数规则时同步维护本页。
// 翻修要点：①顶部锚点 chip 导航（点击平滑滚动到对应节）；②口径文案与实现对齐
// （销量估算因子全列、比当前基准随所选店铺/平台、促销日历只读）；③文案去工程词。
// ============================================================
import { useRef } from 'react';
import { Modal } from 'antd';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../theme/tokens';

/** 锚点节（每节一枚 chip）：id 落在节标题上，点击平滑滚动 */
const ANCHORS = [
  { id: 'dhm-price', chip: '取价' },
  { id: 'dhm-shop', chip: '默认店铺' },
  { id: 'dhm-compare', chip: '比价' },
  { id: 'dhm-time', chip: '时间' },
  { id: 'dhm-volume', chip: '销量' },
  { id: 'dhm-fx', chip: '汇率' },
  { id: 'dhm-quality', chip: '质量' },
  { id: 'dhm-promo', chip: '促销' },
  { id: 'dhm-alerts', chip: '预警' },
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 18, scrollMarginTop: 42 }}>
      <h4 style={{ margin: '0 0 6px', fontSize: fontSize.bodySm, fontWeight: 600, color: color.ink }}>{title}</h4>
      <div style={{ fontSize: fontSize.caption, lineHeight: '20px', color: color.body, display: 'grid', gap: 4 }}>
        {children}
      </div>
    </section>
  );
}

const Li = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 6 }}>
    <span aria-hidden style={{ color: color.mute }}>·</span>
    <span>{children}</span>
  </div>
);

export default function DataHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 只滚动弹窗内容区（不动弹窗外的页面），顶部留出锚点导航条的高度 */
  const jumpTo = (id: string): void => {
    const box = scrollRef.current;
    const el = document.getElementById(id);
    if (!box || !el) return;
    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTo({ top: box.scrollTop + delta - 42, behavior: 'smooth' });
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} centered width={760} title="数据口径说明">
      <div ref={scrollRef} style={{ maxHeight: '68vh', overflowY: 'auto', paddingRight: 6 }}>
        {/* 锚点导航：吸顶药丸，点击平滑滚动到对应节 */}
        <nav
          aria-label="口径说明章节"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            background: color.canvas,
            padding: '2px 0 8px',
            marginBottom: 10,
            borderBottom: `1px solid ${color.hairline}`,
          }}
        >
          {ANCHORS.map((a) => (
            <button key={a.id} type="button" className="dhm-chip" onClick={() => jumpTo(a.id)}>
              {a.chip}
            </button>
          ))}
        </nav>
        <Section id="dhm-price" title="一、价格取数口径（最低在架价）">
          <Li>每个价格点 = 所选平台 / 店铺范围内，同一颜色各渠道上架中的<b>最低在架价</b>。</Li>
          <Li>取证链接与「取价店铺」即该最低价所在的商品页面。</Li>
          <Li><b>组合 / 套装页不参与</b>：套装价与裸机价不可比，同范围内只要有裸机上架，套装页一律不计。</Li>
          <Li>范围内全部为套装时，才用套装价兜底并明确标注。</Li>
          <Li><b>多颜色</b>：同一配置选择多个颜色时，取各颜色最低价后的算术平均。</Li>
          <Li>系统代表色（默认勾选、量价面板、多平台比价所用）= 最新有价周内最低价的颜色。</Li>
          <Li>RRP（官方建议零售价）为独立参照线，不随渠道 / 颜色 / 筛选变化；该渠道缺官网价时取该平台的划线价兜底，此时随渠道变化。</Li>
        </Section>
        <Section id="dhm-shop" title="二、平台 / 店铺筛选与默认口径">
          <Li>筛选可精确到<b>具体店铺</b>（单店口径）；平台店铺（如 OZON 3P）内含多个卖家时，默认取该渠道全部卖家的最低在架价，也可在筛选第三列指定其中一家。</Li>
          <Li>未手动选择时，按「配置页 → 默认平台店铺」为国家设定的默认店铺取价。</Li>
          <Li>默认店铺未手动维护的国家，由系统自动预填（该国默认平台下数据最全的主店），配置页可随时修改并立即生效。</Li>
          <Li>切换国家后，若所选店铺在该国不存在，自动回退默认口径。</Li>
        </Section>
        <Section id="dhm-compare" title="三、多平台比价">
          <Li>并列展示该国<b>全部平台</b>的最低在架价，不受左上平台 / 店铺筛选影响——比价的意义就是一次看全。</Li>
          <Li>取该配置的代表色；时间范围随看板筛选、按周展开。</Li>
          <Li>「比当前」= 与看板当前取数点（所选店铺 / 平台，未选时为默认店铺）的差价率。</Li>
        </Section>
        <Section id="dhm-time" title="四、时间与粒度">
          <Li><b>周</b>为价格采集与展示的基本单位；月 / 季为聚合口径，可在「平均值 / 最小值」间切换。</Li>
          <Li>右上时间范围筛选决定可分析的全域；各图下方的时间轴可在该全域内缩放查看范围，两档互不覆盖。</Li>
        </Section>
        <Section id="dhm-volume" title="五、销量口径（量价看板 / 大盘分析）">
          <Li>销量为<b>估算口径</b>：按产业市场基数，结合品牌与国家市场结构、档位系数、配置份额、生命周期阶段、折扣与促销档期推算。</Li>
          <Li>估算结果用于结构对比；接入真实销量数据后整体替换。</Li>
          <Li>销量估算不随平台 / 店铺筛选与币种切换变化，与价格口径不同。</Li>
          <Li>大盘分析图的占比、品牌构成为同一估算口径的同期汇总。</Li>
        </Section>
        <Section id="dhm-fx" title="六、汇率">
          <Li>美元价格 = 本币价格 ÷ 每条价格记录采集当时的实时汇率（逐条折算）。</Li>
          <Li>配置页展示本币各月中位汇率，供参考。</Li>
        </Section>
        <Section id="dhm-quality" title="七、数据质量（异常价格标记）">
          <Li>试运行阶段对可疑价格只<b>标记</b>、不剔除，规则如下。</Li>
          <Li>价格明显偏低：低于同配置同周中位价 40% 以上。</Li>
          <Li>单周异常跳变后回位：跌幅 ≥50% 且次周回到原水平。</Li>
          <Li>缺少商品页链接：价格记录没有取证链接。</Li>
          <Li>人工复核后，再确定是否剔除及相应阈值。</Li>
          <Li>明显失真的超低价（低于该产品参照价 5%，如漏抓数位的标价）不参与取价与最低价计算，避免拉穿价格曲线。</Li>
          <Li>套装价天然不参与最低价口径，也不参与上述判定。</Li>
        </Section>
        <Section id="dhm-promo" title="八、促销权益与大促档期">
          <Li>促销权益 = 从商品页解析出的分期 / 赠品 / 组合销售标注，随点位展示。</Li>
          <Li>大促档期 = 内置的国别促销日历（只读维表）映射的背景档期带，与价格采集相互独立。</Li>
          <Li>平台限定档期只在选中平台显示；未选平台 / 店铺时，按默认店铺 / 默认平台显示。</Li>
        </Section>
        <Section id="dhm-alerts" title="九、价格预警">
          <Li>调价 / 折扣预警取价与看板同口径：代表色现价，随所选店铺（未选时为默认店铺）。</Li>
          <Li>平台价差按该国全部平台计算，不受默认店铺与平台筛选影响。</Li>
          <Li>在看板产品旁的铃铛或预警中心均可添加 / 取消监控；四类预警的开关、阈值在预警中心调整，并可按产品单独设置。</Li>
        </Section>
        <div style={{ fontSize: fontSize.caption, color: color.mute, borderTop: `1px solid ${color.hairline}`, paddingTop: 10 }}>
          任何取数规则调整都会同步更新本说明；规则细节以配置页说明为准。
        </div>
      </div>
      {/* 锚点 chip 悬停/聚焦态（内联样式无 :hover，工具类集中在此；浅蓝悬停与筛选 chip 同语言） */}
      <style>{`
        .dhm-chip {
          display: inline-flex;
          align-items: center;
          padding: 1px 9px;
          font-size: 11px;
          line-height: 17px;
          font-weight: 600;
          color: ${color.body};
          background: ${color.canvas};
          border: 1px solid ${color.hairline};
          border-radius: ${radius.pill};
          cursor: pointer;
          white-space: nowrap;
          transition: color 160ms, background 160ms, border-color 160ms;
        }
        .dhm-chip:hover {
          color: ${selectSoftInk};
          background: ${selectSoft};
          border-color: rgba(0, 112, 243, 0.40);
        }
        .dhm-chip:focus-visible { outline: 2px solid #0070f3; outline-offset: 1px; }
      `}</style>
    </Modal>
  );
}
