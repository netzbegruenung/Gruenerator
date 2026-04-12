import { z } from 'zod';

// ── AT Protocol: app.bsky.feed.getAuthorFeed ──────────────────────────────────
// https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed

export const bskyAuthorSchema = z.object({
  handle: z.string(),
  displayName: z.string().optional(),
});

export type BskyAuthor = z.infer<typeof bskyAuthorSchema>;

export const bskyRecordSchema = z.object({
  text: z.string(),
  createdAt: z.string(),
});

export type BskyRecord = z.infer<typeof bskyRecordSchema>;

export const bskyPostSchema = z.object({
  uri: z.string(),
  author: bskyAuthorSchema,
  record: bskyRecordSchema,
  likeCount: z.number().optional(),
  repostCount: z.number().optional(),
});

export type BskyPost = z.infer<typeof bskyPostSchema>;

export const bskyFeedItemSchema = z.object({
  post: bskyPostSchema,
});

export type BskyFeedItem = z.infer<typeof bskyFeedItemSchema>;

export const bskyAuthorFeedResponseSchema = z.object({
  feed: z.array(bskyFeedItemSchema).optional(),
});

export type BskyAuthorFeedResponse = z.infer<typeof bskyAuthorFeedResponseSchema>;
