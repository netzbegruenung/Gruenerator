/**
 * Studio assets: user-uploaded Sticker and Hintergründe for the Studio shop.
 * The image is a `shared_media` row; the audience reuses `groupAudienceSchema`.
 */
import { z } from 'zod';

import { moderationStateSchema } from './contentReport.js';
import { groupAudienceSchema } from './groups.js';

export const studioAssetKindSchema = z.enum(['sticker', 'background']);
export type StudioAssetKind = z.infer<typeof studioAssetKindSchema>;

export const studioAssetSourceSchema = z.enum(['upload', 'cutout', 'badge']);
export type StudioAssetSource = z.infer<typeof studioAssetSourceSchema>;

export const studioAssetVisibilitySchema = z.enum(['private', 'public']);
export type StudioAssetVisibility = z.infer<typeof studioAssetVisibilitySchema>;

export const studioAssetModerationSchema = moderationStateSchema;
export type StudioAssetModeration = z.infer<typeof studioAssetModerationSchema>;

export const studioAssetScopeSchema = z.enum(['shop', 'mine', 'saved']);
export type StudioAssetScope = z.infer<typeof studioAssetScopeSchema>;

export const studioAssetSortSchema = z.enum(['new', 'popular']);
export type StudioAssetSort = z.infer<typeof studioAssetSortSchema>;

const studioAssetTitleSchema = z.string().trim().min(1).max(120);
const studioAssetTagsSchema = z.array(z.string().trim().min(1).max(30)).max(10);

export const studioAssetItemSchema = z.object({
  id: z.string(),
  kind: studioAssetKindSchema,
  title: z.string(),
  tags: z.array(z.string()),
  src: z.string(),
  thumbUrl: z.string().nullable(),
  width: z.number().int(),
  height: z.number().int(),
  source: studioAssetSourceSchema,
  visibility: studioAssetVisibilitySchema,
  audience: groupAudienceSchema,
  moderation: studioAssetModerationSchema,
  /** Marked by an instance admin; the Marktplatz lists it under „Offiziell“. */
  isOfficial: z.boolean(),
  isOwn: z.boolean(),
  authorName: z.string().nullable(),
  likesCount: z.number().int(),
  liked: z.boolean(),
  favorited: z.boolean(),
  createdAt: z.string(),
});
export type StudioAssetItem = z.infer<typeof studioAssetItemSchema>;

export const studioAssetListQuerySchema = z.object({
  kind: studioAssetKindSchema,
  scope: studioAssetScopeSchema,
  q: z.string().trim().max(80).optional(),
  sort: studioAssetSortSchema.default('new'),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(60).default(48),
});
export type StudioAssetListQuery = z.infer<typeof studioAssetListQuerySchema>;

export const studioAssetListResponseSchema = z.object({
  items: z.array(studioAssetItemSchema),
  hasMore: z.boolean(),
});
export type StudioAssetListResponse = z.infer<typeof studioAssetListResponseSchema>;

export const studioAssetCreateBodySchema = z.object({
  shareToken: z.string().min(1).max(64),
  kind: studioAssetKindSchema,
  title: studioAssetTitleSchema,
  tags: studioAssetTagsSchema,
  visibility: studioAssetVisibilitySchema,
  audience: groupAudienceSchema,
  source: studioAssetSourceSchema,
  rightsConfirmed: z.boolean(),
});
export type StudioAssetCreateBody = z.infer<typeof studioAssetCreateBodySchema>;

export const studioAssetOfficialBodySchema = z.object({ official: z.boolean() });
export type StudioAssetOfficialBody = z.infer<typeof studioAssetOfficialBodySchema>;

export const studioAssetUpdateBodySchema = z
  .object({
    title: studioAssetTitleSchema,
    tags: studioAssetTagsSchema,
    visibility: studioAssetVisibilitySchema,
    audience: groupAudienceSchema,
    rightsConfirmed: z.boolean(),
  })
  .partial();
export type StudioAssetUpdateBody = z.infer<typeof studioAssetUpdateBodySchema>;

export const studioAssetRemoveResponseSchema = z.object({ trashed: z.literal(true) });

export const studioAssetLikeResponseSchema = z.object({
  liked: z.boolean(),
  likesCount: z.number().int(),
});
export type StudioAssetLikeResponse = z.infer<typeof studioAssetLikeResponseSchema>;

export const studioAssetFavoriteResponseSchema = z.object({ favorited: z.boolean() });
export type StudioAssetFavoriteResponse = z.infer<typeof studioAssetFavoriteResponseSchema>;

export const studioAssetErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
