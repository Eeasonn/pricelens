// ============================================================
// §5.2 层 3 配置弹框（反馈第 9 条：替代原 360px 右侧抽屉，抽屉形态已删除）：
// 居中小 Modal（宽 ~380px），标题 = `配置 SKU · <产品名> · <RAM+ROM>`，
// 列出该 RAM+ROM 全部颜色 + 各自最新折后价（当前币种），勾选/取消即时生效，
// 「完成」收尾。主按钮经 FilterBar 嵌套主题回写保持 ink 黑。
// ============================================================
import { Button, Checkbox, Modal } from 'antd';
import type { CurrencyMode } from '../../dataModel/types';
import { color, fontSize, formatPrice, space } from '../../theme/tokens';
import { modelNameOf, type RomramNode } from './tree';

export interface SkuModalProps {
  node: RomramNode | null;
  open: boolean;
  checkedSkuIds: string[];
  currency: CurrencyMode;
  onClose: () => void;
  /** 关闭动画完全结束后回调（调用方此时才清空 node，避免标题闪回） */
  afterClose?: () => void;
  onToggle: (skuId: string, next: boolean) => void;
}

export default function SkuModal({
  node,
  open,
  checkedSkuIds,
  currency,
  onClose,
  afterClose,
  onToggle,
}: SkuModalProps) {
  // '—' 颜色不进颜色级联（§8.1）；若该 ROMRAM 仅有 '—' 颜色则照列，保证可勾
  const colors = node ? (node.selectableColors.length ? node.selectableColors : node.colors) : [];
  return (
    <Modal
      title={node ? `配置 SKU · ${modelNameOf(node.modelId)} · ${node.romram}` : '配置 SKU'}
      width={380}
      centered
      open={open}
      onCancel={onClose}
      afterClose={afterClose}
      footer={
        <Button type="primary" block onClick={onClose}>
          完成
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
        {colors.map((c) => {
          const price = currency === 'usd' ? c.latestUsd : c.latestRub;
          return (
            <label
              key={c.skuId}
              style={{ display: 'flex', alignItems: 'center', gap: space.sm, cursor: 'pointer' }}
            >
              <Checkbox
                checked={checkedSkuIds.includes(c.skuId)}
                onChange={(e) => onToggle(c.skuId, e.target.checked)}
              />
              <span style={{ fontSize: fontSize.bodySm, color: color.ink }}>{c.color}</span>
              <span
                className="tnum"
                style={{ marginLeft: 'auto', fontSize: fontSize.bodySm, color: color.body }}
              >
                {formatPrice(price, currency)}
              </span>
            </label>
          );
        })}
        {!colors.length && (
          <span style={{ fontSize: fontSize.bodySm, color: color.mute }}>暂无 SKU 数据</span>
        )}
      </div>
    </Modal>
  );
}
