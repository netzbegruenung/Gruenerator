import { ApifyClient } from 'apify-client';

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
const DEFAULT_WAIT_SECS = 120;

let client: ApifyClient | null = null;

function getClient(): ApifyClient | null {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;
  if (!client) {
    client = new ApifyClient({ token });
  }
  return client;
}

export function isConfigured(): boolean {
  return !!process.env.APIFY_TOKEN;
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

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    const results: CollectedItem[] = [];
    for (const item of items) {
      const post = item as Record<string, any>;
      const caption = post.caption || post.text || '';
      const shortCode = post.shortCode || post.code;
      const postUrl = post.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : null);

      if (!postUrl || !shortCode) continue;

      results.push({
        url: postUrl,
        title: caption.slice(0, 120) + (caption.length > 120 ? '...' : ''),
        excerpt: caption,
        source: 'instagram.com',
        sourceType: 'instagram',
        publishedAt: post.timestamp || post.taken_at || post.date || null,
      });
    }

    log.info(`Fetched ${results.length} Instagram posts for @${handle}`);
    return results;
  } catch (error) {
    log.error(`Instagram scrape failed for @${handle}: ${toError(error).message}`);
    return [];
  }
}
