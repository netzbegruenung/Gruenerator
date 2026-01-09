/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_TARGET: string;
  readonly VITE_HOCUSPOCUS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
