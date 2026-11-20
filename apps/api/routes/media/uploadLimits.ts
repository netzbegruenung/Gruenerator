/**
 * Mediathek upload limits. Mirrors `MAX_IMAGE_SIZE` / `MAX_VIDEO_SIZE` in
 * `@gruenerator/shared/media-library/constants` (the web client's pre-check);
 * `uploadLimits.vitest.ts` keeps the two equal. nginx in front allows 2100M.
 */
export const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
export const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;

export function maxUploadBytesFor(mimeType: string): number {
  return mimeType.startsWith('video/') ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
}

/** "50 MB" / "2 GB" */
export function formatUploadLimit(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}
