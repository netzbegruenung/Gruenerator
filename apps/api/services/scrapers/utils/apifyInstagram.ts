import { type ApifyClient } from 'apify-client';

const INSTAGRAM_ACTOR = 'apify/instagram-post-scraper';
const WAIT_SECS = 180;
const MIN_CAPTION_LENGTH = 20;

export interface InstagramPost {
  url: string;
  shortCode: string;
  caption: string;
  publishedAt: string | null;
  /** Instagram CDN URL — signed and short-lived, download it right away. */
  imageUrl: string | null;
  sourceAccount: string;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** One Apify dataset row → post, or null for rows without link or usable caption. */
export function toInstagramPost(
  item: Record<string, unknown>,
  handle: string
): InstagramPost | null {
  const caption = str(item.caption) ?? str(item.text) ?? '';
  const shortCode = str(item.shortCode) ?? str(item.code);
  if (!shortCode || caption.length < MIN_CAPTION_LENGTH) return null;
  const images = Array.isArray(item.images) ? item.images : [];
  return {
    url: str(item.url) ?? `https://www.instagram.com/p/${shortCode}/`,
    shortCode,
    caption,
    publishedAt: str(item.timestamp) ?? str(item.taken_at) ?? str(item.date),
    imageUrl: str(item.displayUrl) ?? str(images[0]),
    sourceAccount: handle,
  };
}

export async function fetchInstagramPosts(
  client: ApifyClient,
  handle: string,
  options: { resultsLimit: number; onlyPostsNewerThan?: string }
): Promise<InstagramPost[]> {
  const run = await client.actor(INSTAGRAM_ACTOR).call(
    {
      username: [handle],
      resultsLimit: options.resultsLimit,
      ...(options.onlyPostsNewerThan && { onlyPostsNewerThan: options.onlyPostsNewerThan }),
    },
    { waitSecs: WAIT_SECS }
  );

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items.flatMap((item) => {
    const post = toInstagramPost(item as Record<string, unknown>, handle);
    return post ? [post] : [];
  });
}
