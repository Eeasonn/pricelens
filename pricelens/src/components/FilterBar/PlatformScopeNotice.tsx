// ============================================================
// t428u R7-M1 · 稳定版平台口径归一的页内透明说明（provenance 条幅）。
// 第七轮评审 Major：Provider 在 load/actions.set 即完成「国家合法 + 店铺级
// 透明展开平台级」归一后，原始店铺输入已从 state.platform 移除——「为什么
// 变成这个口径」的说明（FiltersState.platformScopeNotice，含 v12 旧持久化
// 迁移）必须在页面上立即可见，而不是等 Agent 打开才出现在结果卡里。
// 形态：筛选卡内、字段行下的一条常驻说明（非 toast——不会在读到之前消失），
// warning 语义（用户输入被调整，需要关注；文字本身承载全部事实，颜色只作
// 提示）；口径再变化（deliberate 换平台/换国/重置）后 notice 失效即整条
// 消失，不残留陈旧说明。挂载点：共享 FilterBar（价格走势/量价）与总览页
// 筛选卡两处（有平台筛选入口的页面）；迭代版恒不渲染（无此归一）。
// ============================================================
import { useFilters } from '../../state/FiltersContext';
import { platformQueryEquals } from '../../dataModel/platformScope';
import { STABLE } from '../../appChannel';
import { color, fontSize, radius, space } from '../../theme/tokens';

export default function PlatformScopeNotice() {
  const { state } = useFilters();
  const notice = state.platformScopeNotice ?? null;
  if (!STABLE || !notice) return null;
  // 适用条件与 state 同步校验：换国/口径再变化后说明不再描述当前选择
  if (notice.countryCode !== state.countryCode) return null;
  if (!platformQueryEquals(notice.platform, state.platform)) return null;
  return (
    <div
      data-platform-scope-note
      role="status"
      aria-label="平台口径归一说明"
      style={{
        marginTop: space.sm,
        padding: `${space.xs}px ${space.sm}px`,
        borderRadius: radius.control,
        background: color.warningSoft,
        color: color.warningInk,
        fontSize: fontSize.caption,
        lineHeight: '18px',
      }}
    >
      {notice.note}
    </div>
  );
}
