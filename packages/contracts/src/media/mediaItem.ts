/**
 * The media-library item as the API sends it (`GET /api/media`). Moved here from
 * @gruenerator/shared so the canvas editor can type it without that package;
 * shared keeps exporting the same names.
 */

/**
 * Canonical provenance values accepted by the media upload endpoint. Single
 * source of truth: the `UploadSource` type derives from this, and the backend's
 * `mediaUploadSchema` Zod enum imports it. Every caller's `uploadSource` string
 * must appear here or the upload 400s (which silently drops e.g. a minted
 * canvas's chosen background image).
 */
export const UPLOAD_SOURCES = [
  'upload',
  'ai_generated',
  'stock',
  'camera',
  'canvas-mint',
  'canvas-editor',
  'canvas-element',
  'canvas-mint-thumbnail',
  'canvas-thumbnail',
  'chat-sharepic-thumbnail',
  'gruenerator-vorlage',
  'template-upload',
  // Generated speech from Grünerator Voice — a creation, never quota-gated.
  'voice',
  // A photo attached in the free-text sharepic creator — kept in the Mediathek.
  'sharepic-creator',
  // A Profilbild's own background photo, kept so the saved Profilbild reopens as it was.
  'profilbild-background',
  // A user-uploaded Sticker/Hintergrund of the Studio shop; the studio_assets row owns it.
  'studio-asset',
  // An infographic's FLUX spot illustration — one per point, so never a library item.
  'sharepic-illustration',
] as const;

// Moved from shared/media-library/contentOrigin.ts; the fallback classification stays there.
export type ContentOrigin = 'ki' | 'sharepic' | 'upload' | 'unknown';

export type MediaType = 'image' | 'video' | 'audio';

export type UploadSource = (typeof UPLOAD_SOURCES)[number];

/**
 * Media item from the library
 */
export interface MediaItem {
  id: string;
  shareToken: string;
  mediaType: MediaType;
  title: string | null;
  /**
   * Full-resolution source URL, despite the name: `/api/share/<token>/preview`
   * with no `w`, which the API answers with the original bytes. Use it where
   * the real upload is wanted (placing an image on a canvas); for anything
   * rendered in an `<img>`, build a sized URL from {@link shareToken} with
   * `buildSharedMediaSrcSet` instead.
   */
  thumbnailUrl: string | null;
  mediaUrl?: string;
  fileSize: number;
  mimeType: string;
  duration?: number;
  imageType?: string;
  imageMetadata?: MediaImageMetadata;
  altText: string | null;
  uploadSource: UploadSource;
  /** Which product made it; absent against a backend older than the column. */
  contentOrigin?: ContentOrigin | null;
  originalFilename: string | null;
  downloadCount: number;
  viewCount: number;
  createdAt: string;
}

export interface MediaImageMetadata {
  width?: number;
  height?: number;
  hasOriginalImage?: boolean;
  originalImageFilename?: string;
  generatedAt?: string;
  /** Compact BlurHash for an instant placeholder; set once variants are generated. */
  blurhash?: string;
  /** Widths (px) of the pre-generated responsive WebP/AVIF variants. */
  variants?: number[];
}
