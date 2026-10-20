// ============================================================
// 当前分析口径（国家）注册：数据层默认参数的来源。
// FiltersProvider 在国家变更时写入；aggregate / tree / urlSync 等无 state 访问的纯函数
// 以此为缺省国家（显式传参优先）。与 state/fx.ts 的本币注册同步更新。
// ============================================================
let currentCountry = 'RU';

export function getCurrentCountry(): string {
  return currentCountry;
}

export function setCurrentCountry(countryCode: string): void {
  currentCountry = countryCode;
}
