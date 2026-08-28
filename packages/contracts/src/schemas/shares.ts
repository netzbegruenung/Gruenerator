/**
 * Zod schemas for share endpoints.
 * Mirrors apps/api/routes/share/shareController.ts.
 */
import { z } from 'zod';

/**
 * Which product made an image. Only these two are ever declared by a client —
 * `'upload'` and `'unknown'` are assigned by the server and never accepted from
 * the wire.
 */
export const contentOriginSchema = z.enum(['ki', 'sharepic']);

/**
 * The full stored set, for reading. `'upload'` marks bytes that came through the
 * upload endpoint; `'unknown'` marks rows written before the column existed whose
 * origin could not be recovered, and is deliberately not laundered into a guess.
 */
export const storedContentOriginSchema = z.enum(['ki', 'sharepic', 'upload', 'unknown']);

// ── Request bodies ──────────────────────────────────────────────────────────

export const createImageShareBodySchema = z.object({
  imageData: z.string(),
  title: z.string().optional(),
  /**
   * Display detail: which template/editor a draft reopens into. Free text on
   * purpose — it carries canvas template ids the backend has no list of. It is
   * NOT the gallery's Sharepic/KI discriminator any more; `contentOrigin` is.
   */
  imageType: z.string().optional(),
  /**
   * Optional, not required: mobile ships by OTA, so an installed build cannot
   * start sending this the moment the API deploys. When it is missing the server
   * derives the value from `imageType`/`metadata` exactly as the clients used to.
   */
  contentOrigin: contentOriginSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  originalImage: z.string().optional(),
  status: z.enum(['ready', 'draft']).optional(),
});

export const createVideoShareBodySchema = z.object({
  exportToken: z.string(),
  title: z.string().optional(),
  projectId: z.string().optional(),
});

export const createVideoFromProjectBodySchema = z.object({
  projectId: z.string(),
  title: z.string().optional(),
});

export const updateImageShareBodySchema = z.object({
  imageBase64: z.string(),
  title: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  originalImage: z.string().optional(),
});

// ── Response sub-schemas ────────────────────────────────────────────────────

export const shareResultSchema = z.object({
  shareToken: z.string(),
  shareUrl: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  mediaType: z.enum(['image', 'video']),
  hasOriginalImage: z.boolean().optional(),
  status: z.string().optional(),
});

// ── Response schemas ────────────────────────────────────────────────────────

export const shareErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

export const createShareResponseSchema = z.object({
  success: z.literal(true),
  share: shareResultSchema,
});

export const updateImageShareResponseSchema = z.object({
  success: z.literal(true),
  share: shareResultSchema,
});

// ── Read / management endpoints ─────────────────────────────────────────────

// Query schemas — kept as raw strings; handlers parse exactly like the legacy
// router did (parseInt fallbacks etc.) to preserve behavior.
export const mySharesQuerySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
});

export const recentSharesQuerySchema = z.object({
  limit: z.string().optional(),
});

/**
 * One row of `GET /api/share/recent`, modelled on the SELECT in
 * `SharedMediaService.getUserShares` — the 13 columns it actually returns, run
 * through the router's `toCamelCase`.
 *
 * Deliberately NOT modelled on the `Share` interface in `@gruenerator/shared`:
 * that one promises `thumbnailUrl`, `viewCount`, `fileName` and `mimeType`,
 * none of which this endpoint selects, and types `duration` as a number where
 * `pg` hands back every NUMERIC/BIGINT as a string (no `setTypeParser` anywhere
 * in the API).
 *
 * `createdAt` is the point of the whole schema: it is a TIMESTAMPTZ, i.e. a
 * `Date` before serialisation, and `toCamelCase` used to rebuild every Date as
 * `{}`. Requiring a string here means such a response fails at the client
 * boundary with a named field instead of at `localeCompare` inside the render.
 */
export const shareListItemSchema = z.object({
  id: z.string(),
  shareToken: z.string(),
  mediaType: z.string(),
  title: z.string().nullable(),
  thumbnailPath: z.string().nullable(),
  // BIGINT / NUMERIC arrive as strings from `pg`; older rows may hold numbers.
  fileSize: z.union([z.number(), z.string()]).nullable(),
  duration: z.union([z.number(), z.string()]).nullable(),
  imageType: z.string().nullable(),
  imageMetadata: z.record(z.unknown()),
  status: z.string(),
  downloadCount: z.number(),
  createdAt: z.string(),
  // Effectively one of 'ki' | 'sharepic' | 'upload' | 'unknown', but kept as a
  // string on purpose: the column is added by `syncSchemaColumns`, which never
  // applies CHECK constraints, so the closed set is not guaranteed on every
  // database. Optional because an instance predating the migration has no
  // column at all. `isKiImage` consumes it as `string | null` anyway.
  contentOrigin: z.string().optional(),
});

export type ShareListItem = z.infer<typeof shareListItemSchema>;

/**
 * `GET /api/share/my` and `GET /api/share/recent`.
 *
 * `count` and `limit` describe **this response**, nothing wider: `count` is how
 * many rows `shares` holds, `limit` the ceiling that produced it. Neither is a
 * quota. Since no endpoint in this family takes an offset, `count === limit` is
 * the only signal a caller gets that the list was truncated.
 *
 * The narrowness is the point (#2986). `count` has twice been an account-wide
 * number sitting next to a list filtered by `type`, by `status` and by both
 * provenance columns — first every row in `shared_media` including internal
 * artifacts, then the Mediathek quota. Both over-reported, and the gap grew
 * with the account: canvas documents write one non-library thumbnail row each.
 * Account-wide usage belongs on `GET /api/media`, which carries a `quota` block
 * and is not also a filtered list.
 */
export const shareListResponseSchema = z.object({
  success: z.literal(true),
  shares: z.array(shareListItemSchema),
  /** Rows in `shares`. Equal to `shares.length`, by construction. */
  count: z.number(),
  /** Max rows this response could have carried. */
  limit: z.number(),
});

/**
 * Named for the one route that uses it. `ShareListResponse` is taken by the
 * hand-written interface in `@gruenerator/shared/share`, which still describes
 * the untyped `/share/my` family.
 */
export type RecentSharesResponse = z.infer<typeof shareListResponseSchema>;

export const shareListSimpleResponseSchema = z.object({
  success: z.literal(true),
  shares: z.array(z.unknown()),
});

export const deleteShareResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

/** Body for PATCH /api/share/:shareToken — title-only rename of a share. */
export const renameShareBodySchema = z.object({
  title: z.string().min(1).max(300),
});
