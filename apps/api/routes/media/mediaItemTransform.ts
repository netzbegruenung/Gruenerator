import type { SharedMediaRow } from '../../types/media.js';

/**
 * Transform database row to API response format.
 *
 * `thumbnailUrl` is `/preview` *without* a `w` parameter, and that is on
 * purpose: the route reads a missing width as "the original bytes, unresized"
 * (`services/media/thumbnailCache.ts`), which is what the canvas placement path
 * needs — `canvas-editor/utils/mediaPlacement.ts` and `mediaItemToFile.ts` both
 * fall back to this field to get the real upload. Appending a width here would
 * silently turn every placed background into a 400px re-encode.
 *
 * Which means the field is *not* a thumbnail: rendering it in an `<img>` pulls
 * a multi-megabyte upload into a tile. Preview surfaces build their own sized
 * URLs from `shareToken` via `buildSharedMediaSrcSet`
 * (`packages/shared/src/media-library/srcset.ts`).
 */
export function transformMediaItem(item: SharedMediaRow) {
  return {
    id: item.id,
    shareToken: item.share_token,
    mediaType: item.media_type,
    title: item.title,
    thumbnailUrl: item.thumbnail_path ? `/api/share/${item.share_token}/preview` : null,
    fileSize: item.file_size,
    mimeType: item.mime_type,
    // NUMERIC arrives from pg as a string; the shared type promises a number.
    duration: item.duration === null ? null : Number(item.duration),
    imageType: item.image_type,
    imageMetadata: item.image_metadata,
    altText: item.alt_text,
    uploadSource: item.upload_source,
    contentOrigin: item.content_origin,
    originalFilename: item.original_filename,
    status: item.status,
    downloadCount: item.download_count,
    viewCount: item.view_count,
    createdAt: item.created_at,
  };
}
