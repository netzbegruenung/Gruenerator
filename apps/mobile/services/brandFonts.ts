import { brandFontUrl, type BrandFontFile } from '@gruenerator/contracts';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

/**
 * The brand fonts are not bundled into the app; the API serves them. `useFonts`
 * and Skia's `useTypeface` both accept the URL and download it on first use.
 */
export function brandFontSource(file: BrandFontFile): string {
  return brandFontUrl(API_BASE_URL, file);
}
