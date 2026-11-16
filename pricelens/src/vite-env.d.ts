/// <reference types="vite/client" />

/** SHA256 of actual data inputs, supplied by Vite for builds and tests. */
declare const __PRICE_WEEKLY_DATA_VERSION__: string;
declare const __PRICE_MONTHLY_DATA_VERSION__: string;
/** Build wall-clock time (ISO), supplied by Vite for builds; vitest 经 setup 垫 */
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** 构建期烙定的版本通道（vite.config.ts define）：'iterate' = 在线演进版；'' = 默认（见 appChannel.ts） */
  readonly VITE_APP_CHANNEL?: string;
}
