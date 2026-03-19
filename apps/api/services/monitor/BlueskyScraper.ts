/**
 * Bluesky Scraper for Monitor
 * Fetches recent posts from political party accounts via the free AT Protocol API.
 * No authentication or API key needed.
 */

import axios from 'axios';

import { createLogger } from '../../utils/logger.js';

import type { CollectedMonitorItem } from './MonitorCollectorService.js';

const log = createLogger('BlueskyScraper');

const BSKY_API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const MAX_POSTS_PER_ACCOUNT = 10;

const BLUESKY_ACCOUNTS = [{ handle: 'gruene-bundestag.de', label: 'Grüne Fraktion' }];

interface BskyPost {
  uri: string;
  author: { handle: string; displayName: string };
  record: { text: string; createdAt: string };
  likeCount?: number;
  repostCount?: number;
}

function postToUrl(uri: string, handle: string): string {
  const rkey = uri.split('/').pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

async function fetchAccountPosts(handle: string, limit: number): Promise<BskyPost[]> {
  try {
    const response = await axios.get(BSKY_API, {
      params: { actor: handle, limit },
      timeout: 10000,
    });
    return (response.data?.feed || []).map((item: any) => item.post);
  } catch (error) {
    log.warn(`Bluesky fetch failed for @${handle}: ${error}`);
    return [];
  }
}

export async function scrapeBlueskyAccounts(): Promise<CollectedMonitorItem[]> {
  log.info(`Scraping Bluesky: ${BLUESKY_ACCOUNTS.length} accounts...`);

  const allItems: CollectedMonitorItem[] = [];

  // Fetch all accounts in parallel (API is fast and free)
  const results = await Promise.allSettled(
    BLUESKY_ACCOUNTS.map(async (account) => {
      const posts = await fetchAccountPosts(account.handle, MAX_POSTS_PER_ACCOUNT);
      return { account, posts };
    })
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { account, posts } = result.value;

    for (const post of posts) {
      const text = post.record?.text || '';
      if (!text || text.length < 10) continue;

      allItems.push({
        url: postToUrl(post.uri, account.handle),
        title: `[${account.label}] ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`,
        excerpt: text,
        source: `Bluesky @${account.handle}`,
        publishedAt: post.record?.createdAt || null,
        locale: 'de',
      });
    }

    log.info(`Bluesky @${account.handle}: ${posts.length} posts`);
  }

  log.info(`Bluesky total: ${allItems.length} posts from ${BLUESKY_ACCOUNTS.length} accounts`);
  return allItems;
}
