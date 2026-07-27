// Subpath, not the barrel: `media-library/index.ts` re-exports React hooks and a
// zustand store, which the API must not pull in — same reason
// `sharedMediaService` imports `media-library/constants` directly.
import {
  classifyLegacyImageType,
  type ContentOrigin,
} from '@gruenerator/shared/media-library/contentOrigin';

/**
 * Derive an image's provenance when the client did not declare one.
 *
 * `POST /api/share/image` is the single write path behind both the KI editor and
 * the Sharepic templates, so the endpoint cannot know on its own which product
 * called it — callers declare `contentOrigin`. This fallback covers the clients
 * that predate that field (mobile updates by OTA and can lag a backend deploy);
 * it reproduces exactly the classification the galleries used to do on the read
 * side, so those requests are no worse off than before, just decided once and
 * stored instead of re-guessed on every render.
 *
 * The metadata checks come first because they are conclusive: only the KI flows
 * write `kiConfig` (set when a type uses the Flux API) or `source: 'bild-editor'`.
 */
export function deriveContentOrigin(
  imageType: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined
): ContentOrigin {
  if (metadata) {
    if (metadata.kiConfig != null) return 'ki';
    if (metadata.source === 'bild-editor') return 'ki';
  }
  return classifyLegacyImageType(imageType);
}
