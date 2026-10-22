/**
 * Metro turns an imported image into a module id (a number) that `expo-image`
 * and RN's `Image` accept as a `source`. Expo's own types cover the formats it
 * ships templates for; webp is not among them, and the notebook covers in
 * `@gruenerator/shared/assets` are webp. png is declared here too, for the
 * Profilbild assets — nothing else in this tsconfig types it.
 */
declare module '*.webp' {
  const asset: number;
  export default asset;
}

declare module '*.png' {
  const asset: number;
  export default asset;
}

/** The bundled fonts, loaded by Skia for the sticker creator's badge text. */
declare module '*.ttf' {
  const asset: number;
  export default asset;
}

/** The voice call's ready tone, played by `expo-audio`. */
declare module '*.wav' {
  const asset: number;
  export default asset;
}
