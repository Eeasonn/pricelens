/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 构建期烙定的版本通道（vite.config.ts define）：'iterate' = 在线演进版；'' = 默认（见 appChannel.ts） */
  readonly VITE_APP_CHANNEL?: string;
}
