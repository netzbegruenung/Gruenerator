import { ApifyClient } from 'apify-client';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { CollectedItem } from './types.js';

const log = createLogger('ApifyService');

const TWITTER_ACTOR = 'apidojo/twitter-scraper-lite';
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

export async function getRecentTweets(username: string, maxItems = 20): Promise<CollectedItem[]> {
  const apify = getClient();
  if (!apify) return [];

  const handle = username.replace(/^@/, '');

  try {
    log.info(`Fetching tweets for @${handle} (max: ${maxItems})`);

    const run = await apify.actor(TWITTER_ACTOR).call(
      {
        twitterHandles: [handle],
        maxTweets: maxItems,
      },
      { waitSecs: DEFAULT_WAIT_SECS }
    );

    const { items } = await apify.dataset(run.defaultDatasetId).listItems();

    const results: CollectedItem[] = [];
    for (const item of items) {
      const tweet = item as Record<string, any>;
      const text = tweet.full_text || tweet.text || tweet.tweetText || '';
      const tweetUrl =
        tweet.url ||
        tweet.tweetUrl ||
        (tweet.id_str ? `https://x.com/${handle}/status/${tweet.id_str}` : null);

      if (!tweetUrl || !text) continue;

      results.push({
        url: tweetUrl,
        title: text.slice(0, 120) + (text.length > 120 ? '...' : ''),
        excerpt: text,
        source: 'x.com',
        sourceType: 'twitter',
        publishedAt: tweet.created_at || tweet.createdAt || null,
      });
    }

    log.info(`Fetched ${results.length} tweets for @${handle}`);
    return results;
  } catch (error) {
    log.error(`Twitter scrape failed for @${handle}: ${toError(error).message}`);
    return [];
  }
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

      // Skip profile-level results that aren't actual posts
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
