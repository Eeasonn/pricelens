// ============================================================
// 访问角色（2026-11-06 稳定版 GTM/查阅者权限分组）：角色读写 + 能力判定 + 变更广播。
// 设计正典：docs/design/2026-11-06-access-roles.md
// - 角色：gtm（默认——现网人人可配，避免升级后突然锁死）| viewer（查阅者，只读配置）
// - 存储：LPL3.access.role（localStorage）。lplKeys.ts 是冻结登记文件
//   （子 Agent 只许引用），新增键常量登记在此，前缀对齐 §13 的 LPL3.* 约定。
// - 近期无 SSO：正式环境接入 Huawei 账号后，role 由 token claim 覆盖
//   localStorage（扩展点见设计短文），本模块仍是全站唯一判定源。
// 防御纵深：除 UI 门控外，配置写 API（configStore / defaultShopStore /
// anomaly / configImportExport.apply）都校验 canEditConfig()——viewer 下写为 no-op。
// ============================================================
import { useEffect, useState } from 'react';

/** localStorage 键（§13 LPL3.* 前缀；冻结文件 lplKeys.ts 只引用不扩，登记于此） */
export const ACCESS_ROLE_KEY = 'LPL3.access.role';

/** 角色：GTM（可编辑配置 + 导入导出）| 查阅者（配置只读，仍可导出备份） */
export type AccessRole = 'gtm' | 'viewer';

export const ACCESS_ROLES: readonly AccessRole[] = ['gtm', 'viewer'];

export const ROLE_LABELS: Record<AccessRole, string> = {
  gtm: 'GTM',
  viewer: '查阅者',
};

/** 角色变更广播：页头切换后配置页各控件态即时刷新 */
export const ROLE_CHANGED_EVENT = 'lpl3-access-role-changed';

function isRole(v: unknown): v is AccessRole {
  return v === 'gtm' || v === 'viewer';
}

/** 当前角色；未设置/存储不可用/值非法 → 默认 gtm */
export function getRole(): AccessRole {
  try {
    const raw = localStorage.getItem(ACCESS_ROLE_KEY);
    return isRole(raw) ? raw : 'gtm';
  } catch {
    return 'gtm';
  }
}

/** 切换角色（开发/演示用）并广播；存储不可用时仅当次会话内由 useRole 兜底 */
export function setRole(role: AccessRole): void {
  try {
    localStorage.setItem(ACCESS_ROLE_KEY, role);
  } catch {
    /* 隐私模式等写入失败：不阻断切换，UI 态仍随事件更新 */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: role }));
  }
}

/** 配置写权限：仅 GTM。所有配置写路径（UI + store API + 导入）统一走此判定 */
export function canEditConfig(): boolean {
  return getRole() === 'gtm';
}

/** 角色响应式读取：ROLE_CHANGED_EVENT 后重渲染（配置页控件态即时切换） */
export function useRole(): AccessRole {
  const [role, setRoleState] = useState<AccessRole>(getRole);
  useEffect(() => {
    const refresh = (): void => setRoleState(getRole());
    window.addEventListener(ROLE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, refresh);
  }, []);
  return role;
}
