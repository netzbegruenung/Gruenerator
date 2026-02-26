/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL: string;
    readonly VITE_API_TARGET: string;
    readonly VITE_HOCUSPOCUS_URL: string;
  }

  interface Window {
    __TAURI__?: Record<string, unknown>;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export {};
