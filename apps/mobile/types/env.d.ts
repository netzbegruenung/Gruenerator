// Ambient typing for Expo's EXPO_PUBLIC_* env vars, which Metro inlines at
// build time. Without this, `process.env.EXPO_PUBLIC_*` resolves to `any` and
// trips @typescript-eslint/no-unsafe-assignment at every read site.
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly EXPO_PUBLIC_API_URL?: string;
      readonly EXPO_PUBLIC_DOCS_API_URL?: string;
      readonly EXPO_PUBLIC_HOCUSPOCUS_URL?: string;
    }
  }
}

export {};
