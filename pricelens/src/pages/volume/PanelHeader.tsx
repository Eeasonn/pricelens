// ============================================================
// 量价看板 · 面板头：
// 主产品左侧放「店铺同步」按钮，按钮与产品框同高；产品取价店铺在平台行中允许换行。
// 第一百八十四轮（Eason）：右上角销量读数删除——销量看图内柱区，面板头只留产品标识。
// 第一百一十四轮（评审）：撤「我司」小标签（铁律：任何地方不标注「我司」——
// 品牌点+品牌名已表达归属）。
// 第一百六十七轮：面板改为跟随顶部筛选器所选产品铺开，本头不再带产品下拉
// （原「产品·配置下拉」退役），纯展示。
// ============================================================
import type { ReactNode } from 'react';
import { color, radius, selectAccent, selectSoft, selectSoftInk } from '../../theme/tokens';

export default function PanelHeader(props: {
  brand: string;
  name: string;
  children: ReactNode;
  isMain?: boolean;
  syncActive?: boolean;
  onStoreSync?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: '100%', minWidth: 0, padding: '0 4px' }}>
      {props.isMain && props.onStoreSync && (
        <button
          type="button"
          aria-pressed={props.syncActive}
          aria-label={props.syncActive ? `取消 ${props.name} 的店铺同步` : `同步 ${props.name} 的店铺`}
          title={props.syncActive ? '已同步：本主产品卡内的对比产品跟随主产品店铺，点击取消' : '本主产品卡内的对比产品跟随主产品店铺'}
          onClick={props.onStoreSync}
          style={{
            flex: '0 0 36px',
            width: 36,
            height: 36,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            border: `1px solid ${props.syncActive ? selectAccent : color.hairline}`,
            borderRadius: radius.control,
            background: props.syncActive ? selectSoft : color.canvas,
            color: props.syncActive ? selectSoftInk : color.body,
            font: 'inherit',
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '13px',
            cursor: 'pointer',
            whiteSpace: 'normal',
          }}
        >
          <span>店铺<br />同步</span>
        </button>
      )}
      <div title={props.name} style={{ display: 'flex', alignItems: 'flex-end', minWidth: 0, flex: '1 1 auto', height: '100%' }}>
        {props.children}
      </div>
    </div>
  );
}
