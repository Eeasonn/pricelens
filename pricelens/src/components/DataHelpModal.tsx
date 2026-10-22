// ============================================================
// 数据口径说明（第一百三十七轮）：页头右上角问号入口 → 居中弹窗。
// 内容 = 全站对原始采集数据所做的全部处理规则的业务语言说明：
// 取价口径 / 默认店铺 / 平台店铺筛选 / 多平台比价 / 时间粒度 / 销量估算 /
// 汇率 / 数据质量打标 / 权益与大促档期。修改任何取数规则时同步维护本页。
// ============================================================
import { Modal } from 'antd';
import { color, fontSize } from '../theme/tokens';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
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
  return (
    <Modal open={open} onCancel={onClose} footer={null} centered width={760} title="数据口径说明">
      <div style={{ maxHeight: '68vh', overflowY: 'auto', paddingRight: 6 }}>
        <Section title="一、价格取数口径（最低在架价）">
          <Li>每个价格点 = 所选平台 / 店铺范围内，同一颜色各渠道上架中的<b>最低在架价</b>；取证链接与「取价店铺」即该最低价所在页面。</Li>
          <Li><b>组合 / 套装页不参与</b>：套装价与裸机价不可比，同范围内只要存在裸机上架，套装页一律不计；范围内全部为套装时才用套装价兜底并明确标注。</Li>
          <Li><b>多颜色</b>：同一配置选择多个颜色时，取各颜色最低价后的算术平均；系统代表色（默认勾选、量价面板、多平台比价所用）= 最新有价周内最低价的颜色。</Li>
          <Li>RRP（官方建议零售价）为独立参照线，不随渠道 / 颜色 / 筛选变化。</Li>
        </Section>
        <Section title="二、平台 / 店铺筛选与默认口径">
          <Li>筛选可精确到<b>具体店铺</b>（单店口径）；未手动选择时，按「配置页 → 默认平台店铺」为国家设定的默认店铺取价。</Li>
          <Li>默认店铺未手动维护的国家，按维表预填（该国默认电渠下数据最全的主店），配置页可随时修改并立即生效。</Li>
          <Li>切换国家后，若所选店铺在该国不存在，自动回退默认口径。</Li>
        </Section>
        <Section title="三、多平台比价">
          <Li>并列展示该国<b>全部平台</b>的最低在架价，不受左上平台 / 店铺筛选影响——比价的意义就是一次看全。</Li>
          <Li>取该配置的代表色 SKU；时间范围随看板筛选、按周展开；「比当前」= 与当前看板取数点（默认口径）的差价率。</Li>
        </Section>
        <Section title="四、时间与粒度">
          <Li><b>周</b>为价格采集与展示的基本单位；月 / 季为聚合口径，可在「平均值 / 最小值」间切换。</Li>
          <Li>右上时间范围筛选决定可分析的全域；各图下方的时间轴可在该全域内缩放查看范围，两档互不覆盖。</Li>
        </Section>
        <Section title="五、销量口径（量价看板 / 大盘分析）">
          <Li>销量为<b>估算口径</b>：按产业市场基数 × 档位系数 × 生命周期阶段 × 促销深度模型推算，用于结构对比；接入真实销量数据后整体替换。</Li>
          <Li>大盘分析图的占比、品牌构成为同一估算口径的同期汇总。</Li>
        </Section>
        <Section title="六、汇率">
          <Li>USD 价格 = 本币价格 ÷ 该行采集时的实时汇率（逐行折算）；配置页展示本币各月中位汇率供参考。</Li>
        </Section>
        <Section title="七、数据质量（采集异常行处理）">
          <Li>采集行按三类规则试运行<b>打标</b>：水平离群（低于同配置同周中位价 40% 以上）、单周脉冲突变（跌幅 ≥50% 且次周回归）、引用异常（取证链接缺失）。</Li>
          <Li>试运行阶段仅打标出报表（docs/脏数据试运行报表），<b>未从取价中剔除</b>；人工复核后确定剔除开关与阈值。</Li>
          <Li>套装行天然隔离于最低价口径之外，不参与离群判定。</Li>
        </Section>
        <Section title="八、促销权益与大促档期">
          <Li>促销权益 = 从商品页解析出的分期 / 赠品 / 组合销售标注，随点位展示。</Li>
          <Li>大促档期 = 配置的国别促销日历映射的背景档期带，与价格采集相互独立。</Li>
        </Section>
        <div style={{ fontSize: fontSize.caption, color: color.mute, borderTop: `1px solid ${color.hairline}`, paddingTop: 10 }}>
          任何取数规则调整都会同步更新本说明；规则细节以「配置页」与 docs/ 下口径文档为准。
        </div>
      </div>
    </Modal>
  );
}
