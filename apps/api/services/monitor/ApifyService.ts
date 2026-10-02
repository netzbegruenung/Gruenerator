import { ApifyClient } from 'apify-client';

import { env } from '../../config/env.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

interface CollectedItem {
  url: string;
  title: string;
  excerpt: string;
  source: string;
  sourceType: string;
  publishedAt: string | null;
}

const log = createLogger('ApifyService');

const INSTAGRAM_ACTOR = 'apify/instagram-post-scraper';
const FACEBOOK_ACTOR = 'apify/facebook-posts-scraper';
const DEFAULT_WAIT_SECS = 120;

let client: ApifyClient | null = null;

function getClient(): ApifyClient | null {
  const token = env.APIFY_TOKEN;
  if (!token) return null;
  if (!client) {
    client = new ApifyClient({ token });
  }
  return client;
}

export function isConfigured(): boolean {
  return !!env.APIFY_TOKEN;
}

export async function getRecentInstagramPosts(
  username: string,
  maxItems = 20
): Promise<CollectedItem[]> {
  const apify = getClient();
  if (!apify) return [];

  const handle = username.replace(/^@/, '');

  try {
    log.info(`Fetching Instagram posts for @${handle} (max: ${maxItems})`);

    const run = await apify.actor(INSTAGRAM_ACTOR).call(
      {
        username: [handle],
        resultsLimit: maxItems,
      },
      { waitSecs: DEFAULT_WAIT_SECS }
    );

    // eslint-disable-next-line @typescript-eslint/await-thenable -- apify-client listItems() returns an awaitable PaginatedIterator (official usage)
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    const results: CollectedItem[] = [];
    for (const item of items) {
      const post = item as Record<string, unknown>;
      const caption = (post.caption || post.text || '') as string;
      const shortCode = post.shortCode || post.code;
      const postUrl = (post.url ||
        (shortCode ? `https://www.instagram.com/p/${shortCode}/` : null)) as string | null;

      if (!postUrl || !shortCode) continue;

      results.push({
        url: postUrl,
        title: caption.slice(0, 120) + (caption.length > 120 ? '...' : ''),
        excerpt: caption,
        source: 'instagram.com',
        sourceType: 'instagram',
        publishedAt: (post.timestamp || post.taken_at || post.date || null) as string | null,
      });
    }

    log.info(`Fetched ${results.length} Instagram posts for @${handle}`);
    return results;
  } catch (error) {
    log.error(`Instagram scrape failed for @${handle}: ${toError(error).message}`);
    return [];
  }
}

export async function getRecentFacebookPosts(
  pageHandle: string,
  maxItems = 20
): Promise<CollectedItem[]> {
  const apify = getClient();
  if (!apify) return [];

  const handle = pageHandle.replace(/^@/, '');

  try {
    log.info(`Fetching Facebook posts for ${handle} (max: ${maxItems})`);

    const run = await apify.actor(FACEBOOK_ACTOR).call(
      {
        startUrls: [{ url: `https://www.facebook.com/${handle}` }],
        resultsLimit: maxItems,
      },
      { waitSecs: DEFAULT_WAIT_SECS }
    );

    // eslint-disable-next-line @typescript-eslint/await-thenable -- apify-client listItems() returns an awaitable PaginatedIterator (official usage)
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    const results: CollectedItem[] = [];
    for (const item of items) {
      const post = item as Record<string, unknown>;
      const text = (post.text || post.message || post.postText || '') as string;
      const postUrl = (post.url || post.postUrl || null) as string | null;

      if (!postUrl || !text) continue;

      results.push({
        url: postUrl,
        title: text.slice(0, 120) + (text.length > 120 ? '...' : ''),
        excerpt: text,
        source: 'facebook.com',
        sourceType: 'facebook',
        publishedAt: (post.time || post.timestamp || post.date || null) as string | null,
      });
    }

    log.info(`Fetched ${results.length} Facebook posts for ${handle}`);
    return results;
  } catch (error) {
    log.error(`Facebook scrape failed for ${handle}: ${toError(error).message}`);
    return [];
  }
}
