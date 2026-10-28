// ============================================================
// 量价看板 · 面板头（定高 32 = 左侧共享轴列的对齐基准）：
// 左 = 品牌点 + 产品·配置名；右 = 销量读数（悬停时间列优先，无悬停取最新有值期）。
// 第一百一十四轮（评审）：撤「我司」小标签（铁律：任何地方不标注「我司」——
// 品牌点+品牌名已表达归属）。
// 第一百六十七轮：面板改为跟随顶部筛选器所选产品铺开，本头不再带产品下拉
// （原「产品·配置下拉」退役），纯展示。
// ============================================================
import BrandDot from '../../components/BrandMark';
import { color } from '../../theme/tokens';
import { fmtVolume } from './volumeAxis';

export default function PanelHeader(props: { brand: string; name: string; volume: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 4px' }}>
      <BrandDot brand={props.brand} />
      <span
        title={props.name}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: color.ink,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
        }}
      >
        {props.name}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 3,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ fontSize: 11, color: color.mute }}>销量</span>
        <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: color.ink }}>
          {props.volume != null ? fmtVolume(props.volume) : '—'}
        </span>
        <span style={{ fontSize: 11, color: color.mute }}>台</span>
      </span>
    </div>
  );
}
