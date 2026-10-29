// ============================================================
// 量价看板 · 面板头（定高 32 = 左侧共享轴列的对齐基准）：
// 左 = 品牌点 + 产品·配置名。第一百八十四轮（Eason）：右上角销量读数删除——
// 销量看图内柱区，面板头只留产品标识。
// 第一百一十四轮（评审）：撤「我司」小标签（铁律：任何地方不标注「我司」——
// 品牌点+品牌名已表达归属）。
// 第一百六十七轮：面板改为跟随顶部筛选器所选产品铺开，本头不再带产品下拉
// （原「产品·配置下拉」退役），纯展示。
// ============================================================
import BrandDot from '../../components/BrandMark';
import { color } from '../../theme/tokens';

export default function PanelHeader(props: { brand: string; name: string }) {
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
    </div>
  );
}
