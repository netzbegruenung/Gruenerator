/**
 * Bluesky feed for the Monitor UI. The browser cannot call the AT Protocol
 * AppView directly: its CDN answers blocked requests with a 403 that carries no
 * CORS headers, which the browser reports as a CORS failure. So the API fetches
 * the feed and caches it.
 */

import axios from 'axios';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';

import type { BlueskyPost, MonitorLocale } from '@gruenerator/contracts';

const log = createLogger('BlueskyFeedService');

const BSKY_HOSTS = ['https://public.api.bsky.app', 'https://api.bsky.app'];
const FEED_PATH = '/xrpc/app.bsky.feed.getAuthorFeed';
const CACHE_TTL_MS = 5 * 60 * 1000;

const ACCOUNTS: Record<MonitorLocale, string> = {
  de: 'gruene-bundestag.de',
  at: 'gruene.at',
};

const authorFeedSchema = z.object({
  feed: z
    .array(
      z.object({
        post: z.object({
          uri: z.string(),
          author: z.object({
            handle: z.string(),
            displayName: z.string().optional(),
            avatar: z.string().optional(),
          }),
          record: z.object({ text: z.string().optional(), createdAt: z.string().optional() }),
        }),
        reason: z
          .object({
            $type: z.string().optional(),
            by: z.object({ handle: z.string(), displayName: z.string().optional() }).optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

const cache = new Map<MonitorLocale, { at: number; posts: BlueskyPost[] }>();

async function fetchFeed(handle: string): Promise<z.infer<typeof authorFeedSchema>> {
  let lastError: unknown;
  for (const host of BSKY_HOSTS) {
    try {
      const response = await axios.get(host + FEED_PATH, {
        params: { actor: handle, limit: 15, filter: 'posts_no_replies' },
        timeout: 10000,
      });
      return authorFeedSchema.parse(response.data);
    } catch (error) {
      lastError = error;
      log.warn(`Bluesky fetch via ${host} failed for @${handle}: ${error}`);
    }
  }
  throw lastError;
}

export async function getBlueskyFeed(locale: MonitorLocale): Promise<BlueskyPost[]> {
  const hit = cache.get(locale);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.posts;

  const handle = ACCOUNTS[locale];
  const { feed = [] } = await fetchFeed(handle);

  const posts = feed
    .filter((item) => (item.post.record.text ?? '').length > 0)
    .map(({ post, reason }): BlueskyPost => {
      const isRepost = reason?.$type === 'app.bsky.feed.defs#reasonRepost';
      return {
        uri: post.uri,
        url: `https://bsky.app/profile/${post.author.handle}/post/${post.uri.split('/').pop()}`,
        text: post.record.text ?? '',
        createdAt: post.record.createdAt ?? null,
        authorName: post.author.displayName || post.author.handle,
        authorHandle: post.author.handle,
        avatarUrl: post.author.avatar ?? null,
        repostedBy: isRepost ? reason?.by?.displayName || reason?.by?.handle || handle : null,
      };
    });

  cache.set(locale, { at: Date.now(), posts });
  return posts;
}
