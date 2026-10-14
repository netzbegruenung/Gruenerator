/**
 * Studio assets: user-uploaded Sticker and Hintergründe for the Studio shop.
 * The image is a `shared_media` row; the audience reuses `groupAudienceSchema`.
 */
import { z } from 'zod';

export const studioAssetKindSchema = z.enum(['sticker', 'background']);
export type StudioAssetKind = z.infer<typeof studioAssetKindSchema>;

export const studioAssetSourceSchema = z.enum(['upload', 'cutout', 'badge']);
export type StudioAssetSource = z.infer<typeof studioAssetSourceSchema>;

export const studioAssetVisibilitySchema = z.enum(['private', 'public']);
export type StudioAssetVisibility = z.infer<typeof studioAssetVisibilitySchema>;

export const studioAssetModerationSchema = z.enum(['ok', 'hidden', 'removed']);
export type StudioAssetModeration = z.infer<typeof studioAssetModerationSchema>;
