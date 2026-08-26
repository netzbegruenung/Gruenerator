import type { ChatMessageMetadata } from '@gruenerator/chat';

export type SearchImage = NonNullable<ChatMessageMetadata['searchImages']>[number];

/** Tiles shown before the rest goes behind the counter. */
export const VISIBLE_TILES = 3;

/**
 * Origin of the API, without the `/api` suffix some call sites carry. `proxyUrl`
 * arrives as an absolute PATH (`/api/search-image?…`), which is same-origin on
 * web and nothing at all on a phone — it has to be joined to a host here.
 */
export function apiOrigin(base = process.env.EXPO_PUBLIC_API_URL): string {
  return (base || 'https://gruenerator.eu/api').replace(/\/api\/?$/, '');
}

export function proxyImageUri(proxyPath: string, base?: string): string {
  return `${apiOrigin(base)}${proxyPath}`;
}

export interface SearchImageTile {
  /** Stable across renders; the source URL is unique per hit. */
  key: string;
  title: string;
  domain: string;
  /**
   * Where a tap goes. NEVER an `<Image>` source — pointing the phone at this
   * would announce the reader's IP to whichever host a search engine returned,
   * which is the whole reason the proxy exists.
   */
  linkUrl: string;
  /** Same-origin proxy path, or null when the backend signed nothing. */
  thumbnailPath: string | null;
  /** >0 marks the tile that opens the remaining hits instead of one source. */
  moreCount: number;
}

export interface SearchImagesView {
  heading: string;
  /**
   * One decision for the whole block rather than per item — a half-mosaic,
   * half-list section reads as broken rather than as degraded.
   */
  mode: 'tiles' | 'links';
  tiles: SearchImageTile[];
}

function toTile(image: SearchImage, moreCount: number, withThumbnails: boolean): SearchImageTile {
  return {
    key: image.url,
    title: image.title,
    domain: image.domain,
    linkUrl: image.url,
    thumbnailPath: withThumbnails ? (image.proxyUrl ?? null) : null,
    moreCount,
  };
}

/**
 * Which of the two shapes the image hits take, and what goes in them.
 *
 * Thumbnails need BOTH a signed `proxyUrl` from the backend and a bearer token,
 * because `/api/search-image` sits behind `requireAuth` and a bare `<Image>` GET
 * from React Native carries no session. Missing either one is not an error: the
 * block falls back to plain links, which is what keeps the no-third-party-request
 * rule true rather than trading it away for a picture.
 */
export function buildSearchImagesView(
  images: SearchImage[],
  { expanded, authenticated }: { expanded: boolean; authenticated: boolean }
): SearchImagesView {
  const count = images.length;
  const heading = `${count} gefundene ${count === 1 ? 'Bildquelle' : 'Bildquellen'}`;

  const withThumbnails = authenticated && images.some((image) => image.proxyUrl);
  if (!withThumbnails) {
    return {
      heading,
      mode: 'links',
      tiles: images.map((image) => toTile(image, 0, false)),
    };
  }

  const visible = expanded ? images : images.slice(0, VISIBLE_TILES);
  const hidden = count - visible.length;

  return {
    heading,
    mode: 'tiles',
    tiles: visible.map((image, i) =>
      toTile(image, hidden > 0 && i === visible.length - 1 ? hidden : 0, true)
    ),
  };
}
