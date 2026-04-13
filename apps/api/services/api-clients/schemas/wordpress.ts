import { z } from 'zod';

// ── Site info (/wp-json/) ─────────────────────────────────────────────────────

export const wpSiteInfoSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  namespaces: z.array(z.string()),
});

export type WPSiteInfo = z.infer<typeof wpSiteInfoSchema>;

// ── User (/wp/v2/users/me) ────────────────────────────────────────────────────

export const wpUserResponseSchema = z.object({
  username: z.string(),
  name: z.string(),
  capabilities: z.record(z.boolean()),
});

export type WPUserResponse = z.infer<typeof wpUserResponseSchema>;

// ── Post response (create / update) ──────────────────────────────────────────

export const wpPostResponseSchema = z.object({
  id: z.number(),
  link: z.string(),
  status: z.string(),
});

export type WPPostResponse = z.infer<typeof wpPostResponseSchema>;

// ── Full post (list / single) ─────────────────────────────────────────────────

export const wpPostSchema = z.object({
  id: z.number(),
  title: z.object({ rendered: z.string() }),
  content: z.object({ rendered: z.string() }),
  excerpt: z.object({ rendered: z.string() }),
  status: z.string(),
  date: z.string(),
  link: z.string(),
  categories: z.array(z.number()),
  tags: z.array(z.number()),
});

export type WPPost = z.infer<typeof wpPostSchema>;

// ── Category ──────────────────────────────────────────────────────────────────

export const wpCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  count: z.number(),
});

export type WPCategory = z.infer<typeof wpCategorySchema>;
