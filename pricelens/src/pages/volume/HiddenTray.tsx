// ============================================================
// 量价页「已隐藏」暂存条（2026-11-01 产品显隐交互设计 · 方案 A）：
// 点击面板头药丸 = 该产品面板整体移出网格，被隐藏产品收进本条——单行迷你药丸
// （品牌色点 + 名称 + 配置，虚线 hairlineStrong 描边，与价格页药丸隐藏态同语言），
// 点击恢复到原有位置（拖拽换位序优先、缺省数据序）；「全部恢复」一键找回。
// 无隐藏不渲染；全部隐藏时不渲染（空态的「全部恢复」承担恢复）。
// 键盘：迷你药丸是焦点承接落点（面板卸载后 Tab 流不断，操作可连续撤销）。
// ------------------------------------------------------------
// 2026-11-05（Eason 看图反馈三针 · 整改1）：主品视图隐藏收纳区改位——
// HiddenVault 专用收纳区挂在工具行「销毛成本」按钮右侧（不再走面板区下方
// 暂存条：主品视图不再渲染 HiddenTray，托盘行随在随缺席造成的胶囊带对位漂移
// 随之消除；组内对比视图仍走 HiddenTray，行为不变）。隐藏产品以迷你芯片形态
// 直显（拥挤 >3 个时收缩为前 2 枚 + 「+N」展开芯片），点击芯片即恢复面板显示
// （恢复后胶囊回面板网格原列位）；「全部恢复」轻量钮并入原托盘语义。
// ============================================================
import { useEffect, useState } from 'react';
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

/** 收纳区芯片与暂存条迷你药丸同一份清单形状（key/brand/nameText/romText） */
export type HiddenVaultItem = HiddenTrayItem;

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

// ------------------------------------------------------------
// HiddenVault · 主品视图隐藏收纳区（2026-11-05 整改1②）：挂在工具行「销毛成本」
// 右侧。直显上限 VAULT_CHIP_LIMIT（3 枚）；超出收缩为前 2 枚 + 「+N」芯片
// （N = 收起的数量，点击展开全部、再点收起）；芯片 = 暂存条迷你药丸同语言
// （品牌点 + 名称 + 配置 chip，虚线描边），点击 = 恢复面板显示；行尾「全部恢复」。
// ------------------------------------------------------------

/** 芯片直显上限：≤3 枚全直显；>3 枚收缩为前 2 枚 + 「+N」展开芯片 */
export const VAULT_CHIP_LIMIT = 3;

export function HiddenVault(props: {
  items: HiddenVaultItem[];
  onRestore: (key: string) => void;
  onRestoreAll: () => void;
  /** 芯片节点上报（焦点承接：隐藏后焦点移到对应芯片，恢复后回面板胶囊） */
  registerItem?: (key: string, el: HTMLButtonElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overLimit = props.items.length > VAULT_CHIP_LIMIT;
  // 清单变短（恢复/切换视图）后不再超限即收回收缩态，避免残留展开状态
  useEffect(() => {
    if (!overLimit) setExpanded(false);
  }, [overLimit]);
  if (props.items.length === 0) return null;
  const shown = overLimit && !expanded ? props.items.slice(0, VAULT_CHIP_LIMIT - 1) : props.items;
  const folded = props.items.length - shown.length;
  return (
    <div
      role="group"
      aria-label={`已隐藏产品收纳区，${props.items.length} 个，点击芯片恢复面板显示`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'nowrap', overflow: 'hidden' }}
    >
      {shown.map((item) => (
        <button
          key={item.key}
          type="button"
          ref={(el) => props.registerItem?.(item.key, el)}
          aria-label={`恢复显示 ${item.nameText}${item.romText ? ` ${item.romText}` : ''}`}
          title={`恢复显示 ${item.nameText}${item.romText ? ` ${item.romText}` : ''}`}
          onClick={() => props.onRestore(item.key)}
          className="lpl-hit"
          style={{
            position: 'relative', // .lpl-hit::after 挂在本体上（命中区外扩不落页级祖先）
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 24,
            padding: '0 8px 0 7px',
            maxWidth: 190,
            border: `1px dashed ${color.hairlineStrong}`,
            borderRadius: radius.pill,
            background: color.canvas,
            color: color.body,
            font: 'inherit',
            fontSize: fontSize.caption,
            lineHeight: '16px',
            cursor: 'pointer',
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          <BrandDot brand={item.brand} size={6} />
          <span style={{ fontWeight: 600, color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {item.nameText}
          </span>
          {item.romText && (
            <span
              className="tnum"
              style={{ flexShrink: 0, fontSize: 10, lineHeight: '14px', fontWeight: 600, padding: '0 5px', borderRadius: radius.pill, color: selectSoftInk, background: selectSoft, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
            >
              {item.romText}
            </span>
          )}
        </button>
      ))}
      {(() => {
        // 收缩态 = 「+N」展开芯片；展开态 = 固定「收起」芯片（点击收回直显上限内）
        if (!expanded && folded > 0) {
          return (
            <button
              type="button"
              aria-expanded={false}
              aria-label={`展开其余 ${folded} 个已隐藏产品`}
              title={`还有 ${folded} 个已隐藏产品，点击展开`}
              onClick={() => setExpanded(true)}
              className="tnum"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                height: 24, padding: '0 8px',
                border: `1px dashed ${color.hairlineStrong}`,
                borderRadius: radius.pill,
                background: color.canvas,
                color: color.body,
                font: 'inherit',
                fontSize: fontSize.caption,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              +{folded}
            </button>
          );
        }
        if (expanded) {
          return (
            <button
              type="button"
              aria-expanded
              aria-label={`收起其余已隐藏产品（共 ${props.items.length} 个）`}
              title="收起已隐藏产品清单"
              onClick={() => setExpanded(false)}
              className="tnum"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                height: 24, padding: '0 8px',
                border: `1px dashed ${color.hairlineStrong}`,
                borderRadius: radius.pill,
                background: color.canvas,
                color: color.body,
                font: 'inherit',
                fontSize: fontSize.caption,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              收起
            </button>
          );
        }
        return null;
      })()}
      <button
        type="button"
        aria-label="恢复全部已隐藏产品"
        title="恢复全部已隐藏产品"
        onClick={props.onRestoreAll}
        style={{
          height: 24,
          padding: '0 10px',
          border: 'none',
          background: 'transparent',
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
