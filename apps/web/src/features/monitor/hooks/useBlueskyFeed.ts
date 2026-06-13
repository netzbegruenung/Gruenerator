import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import type { MonitorLocale } from '@gruenerator/contracts';

// Same free AT-Protocol endpoint the backend BlueskyScraper uses — no auth, CORS-open.
const BSKY_FEED_API = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';

export const BLUESKY_ACCOUNTS: Record<MonitorLocale, string> = {
  de: 'gruene-bundestag.de',
  at: 'gruene.at',
};

export interface BlueskyPost {
  uri: string;
  url: string;
  text: string;
  createdAt: string | null;
  authorName: string;
  authorHandle: string;
  avatarUrl: string | null;
  /** Display name of the reposting account when the feed item is a repost. */
  repostedBy: string | null;
}

interface BskyAuthorFeedResponse {
  feed?: {
    post: {
      uri: string;
      author: { handle: string; displayName?: string; avatar?: string };
      record: { text?: string; createdAt?: string };
    };
    reason?: { $type?: string; by?: { handle: string; displayName?: string } };
  }[];
}

function postUrl(uri: string, handle: string): string {
  const rkey = uri.split('/').pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

async function fetchBlueskyPosts(handle: string): Promise<BlueskyPost[]> {
  const response = await axios.get<BskyAuthorFeedResponse>(BSKY_FEED_API, {
    params: { actor: handle, limit: 15, filter: 'posts_no_replies' },
    timeout: 10000,
  });

  return (response.data.feed ?? [])
    .filter((item) => (item.post.record?.text ?? '').length > 0)
    .map((item) => {
      const post = item.post;
      const isRepost = item.reason?.$type === 'app.bsky.feed.defs#reasonRepost';
      return {
        uri: post.uri,
        url: postUrl(post.uri, post.author.handle),
        text: post.record.text ?? '',
        createdAt: post.record.createdAt ?? null,
        authorName: post.author.displayName || post.author.handle,
        authorHandle: post.author.handle,
        avatarUrl: post.author.avatar ?? null,
        repostedBy: isRepost
          ? item.reason?.by?.displayName || item.reason?.by?.handle || handle
          : null,
      };
    });
}

export function useBlueskyFeed(locale: MonitorLocale) {
  return useQuery({
    queryKey: ['monitor', 'bluesky', locale],
    queryFn: () => fetchBlueskyPosts(BLUESKY_ACCOUNTS[locale]),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
