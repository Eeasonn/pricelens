// ============================================================
// 量价页「已隐藏」暂存条（2026-11-01 产品显隐交互设计 · 方案 A）：
// 点击面板头药丸 = 该产品面板整体移出网格，被隐藏产品收进本条——单行迷你药丸
// （品牌色点 + 名称 + 配置，虚线 hairlineStrong 描边，与价格页药丸隐藏态同语言），
// 点击恢复到原有位置（拖拽换位序优先、缺省数据序）；「全部恢复」一键找回。
// 无隐藏不渲染；全部隐藏时不渲染（空态的「全部恢复」承担恢复）。
// 键盘：迷你药丸是焦点承接落点（面板卸载后 Tab 流不断，操作可连续撤销）。
// ============================================================
import BrandDot from '../../components/BrandMark';
import { color, fontSize, radius, selectSoft, selectSoftInk } from '../../theme/tokens';

export interface HiddenTrayItem {
  /** 面板 key（PanelSpec.key = modelId__配置去空格） */
  key: string;
  brand: string;
  /** 产品名（去配置后缀） */
  nameText: string;
  /** 配置原文；'' 不出 chip */
  romText: string;
}

export default function HiddenTray(props: {
  items: HiddenTrayItem[];
  onRestore: (key: string) => void;
  onRestoreAll: () => void;
  /** 迷你药丸节点上报（焦点承接：隐藏后焦点移到对应迷你药丸） */
  registerItem?: (key: string, el: HTMLButtonElement | null) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={`已隐藏产品，${props.items.length} 个`}
      className="lpl-fade-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '6px 8px',
        margin: `0 0 4px ${8}px`,
        border: `1px dashed ${color.hairline}`,
        borderRadius: radius.control,
        background: color.canvasSoft,
      }}
    >
      <span style={{ fontSize: fontSize.caption, color: color.mute, flexShrink: 0, whiteSpace: 'nowrap' }}>
        已隐藏（{props.items.length}）：
      </span>
      {props.items.map((item) => (
        <button
          key={item.key}
          type="button"
          ref={(el) => props.registerItem?.(item.key, el)}
          aria-label={`恢复显示 ${item.nameText}${item.romText ? ` ${item.romText}` : ''}`}
          title={`恢复显示 ${item.nameText}${item.romText ? ` ${item.romText}` : ''}`}
          onClick={() => props.onRestore(item.key)}
          className="lpl-hit"
          style={{
            position: 'relative', // .lpl-hit::after 挂在本体上外扩命中区（缺省会把 ::after 放到页级祖先）
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 10px 0 8px',
            maxWidth: 260,
            border: `1px dashed ${color.hairlineStrong}`,
            borderRadius: radius.pill,
            background: color.canvas,
            color: color.body,
            font: 'inherit',
            fontSize: fontSize.caption,
            lineHeight: '16px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <BrandDot brand={item.brand} size={6} />
          <span style={{ fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.nameText}
          </span>
          {item.romText && (
            <span
              className="tnum"
              style={{ flexShrink: 0, fontSize: 10, lineHeight: '14px', fontWeight: 600, padding: '0 6px', borderRadius: radius.pill, color: selectSoftInk, background: selectSoft, fontVariantNumeric: 'tabular-nums' }}
            >
              {item.romText}
            </span>
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={props.onRestoreAll}
        style={{
          height: 26,
          padding: '0 12px',
          border: `1px solid ${color.hairline}`,
          borderRadius: radius.control,
          background: color.canvas,
          color: color.body,
          font: 'inherit',
          fontSize: fontSize.caption,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        全部恢复
      </button>
    </div>
  );
}
