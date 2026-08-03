/**
 * Zod schemas for GET /api/content — one read contract over everything the user
 * has made, in place of the three projections that drifted apart:
 * `/api/recent-activity`, `/api/share/*` and `/api/media/*`.
 *
 * Three things are different here, and each of them fixed a bug:
 *
 * 1. **A discriminated union instead of a bag of optional fields.**
 *    `recentActivityItemSchema` is one flat object with `thumbnailUrl?`,
 *    `duration?`, `boardType?`, `preview?`, `documentType?` … and nothing in the
 *    type says which field belongs to which `type`. Every consumer has to know
 *    the pairing by convention. Here `kind` is the discriminant, so a `duration`
 *    on a doc is a typecheck error rather than a silently ignored field.
 *
 * 2. **`id` is always the real row id.** `/recent-activity` puts the
 *    `share_token` in `id` for images, which is why an id taken from that feed
 *    404s against `/api/share/:id`. The token gets its own field on the one
 *    variant that has one.
 *
 * 3. **`thumbnailUrl` is built once, on the server.** Three different client
 *    constructions exist today and they disagree about `/thumbnail` vs
 *    `/preview` and about whether there is a fallback at all. On images it is
 *    required, so no client ever builds that URL again.
 */
import { z } from 'zod';

import { boardPreviewSchema } from './boards.js';
import { storedContentOriginSchema } from './shares.js';

export const contentKindSchema = z.enum(['doc', 'board', 'image', 'video', 'canvas']);
export type ContentKind = z.infer<typeof contentKindSchema>;

/** Fields every item carries, whatever it is. */
const contentItemBaseSchema = z.object({
  /** The row id. For images this is NOT the share token — see `shareToken`. */
  id: z.string(),
  title: z.string(),
  /** ISO timestamp the feed is ordered by; which column it comes from is per-kind. */
  date: z.string(),
  href: z.string(),
  deleteEndpoint: z.string(),
  creatorName: z.string().nullable(),
  accessType: z.enum(['owner', 'direct', 'group']).nullable(),
});

export const docContentItemSchema = contentItemBaseSchema.extend({
  kind: z.literal('doc'),
  documentType: z.string(),
  emoji: z.string(),
  /** Prose excerpt for the card preview; absent on the list endpoint by design. */
  content: z.string().nullable(),
});

export const boardContentItemSchema = contentItemBaseSchema.extend({
  kind: z.literal('board'),
  boardType: z.enum(['kanban', 'whiteboard']),
  preview: boardPreviewSchema.nullable(),
});

export const imageContentItemSchema = contentItemBaseSchema.extend({
  kind: z.literal('image'),
  /** What `/share/:token` and the in-app viewer address the image by. */
  shareToken: z.string(),
  /** Always set: the server falls back to the on-demand preview route. */
  thumbnailUrl: z.string(),
  /** Placeholder while the variants pass is still running. */
  blurhash: z.string().nullable(),
  /** Which product made it — the Studio's Sharepic/KI split. */
  contentOrigin: storedContentOriginSchema,
});

export const videoContentItemSchema = contentItemBaseSchema.extend({
  kind: z.literal('video'),
  /** Null until the export has rendered a poster frame. */
  thumbnailUrl: z.string().nullable(),
  /** Seconds, rounded. Null when the metadata never carried one. */
  duration: z.number().nullable(),
});

export const canvasContentItemSchema = contentItemBaseSchema.extend({
  kind: z.literal('canvas'),
  thumbnailUrl: z.string().nullable(),
});

export const contentItemSchema = z.discriminatedUnion('kind', [
  docContentItemSchema,
  boardContentItemSchema,
  imageContentItemSchema,
  videoContentItemSchema,
  canvasContentItemSchema,
]);

export type ContentItem = z.infer<typeof contentItemSchema>;
export type DocContentItem = z.infer<typeof docContentItemSchema>;
export type BoardContentItem = z.infer<typeof boardContentItemSchema>;
export type ImageContentItem = z.infer<typeof imageContentItemSchema>;
export type VideoContentItem = z.infer<typeof videoContentItemSchema>;
export type CanvasContentItem = z.infer<typeof canvasContentItemSchema>;

export const contentQuerySchema = z.object({
  /**
   * Comma-separated kinds, e.g. `?kind=image,video`. Filtering happens in the
   * query, before the limit — which is the whole point. `/recent-activity`
   * fetches `limit` rows per kind, merges them and cuts the merged list to
   * `limit` again, so a busy Office account starves the Studio strips.
   */
  kind: z.string().optional(),
  /** Opaque keyset token from `nextCursor`. Do not construct one by hand. */
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

export const contentResponseSchema = z.object({
  items: z.array(contentItemSchema),
  /** Null when this was the last page. */
  nextCursor: z.string().nullable(),
  /**
   * Kinds whose query failed. `/recent-activity` turns any source error into an
   * empty array, which a surface cannot tell apart from "you have none" — so a
   * broken JOIN looks exactly like an empty account. Listing the failures lets
   * the UI say "konnte nicht geladen werden" instead of showing a lie.
   */
  degraded: z.array(contentKindSchema),
});

export type ContentResponse = z.infer<typeof contentResponseSchema>;

export const contentErrorSchema = z.object({
  error: z.string(),
});
