/**
 * Der Grünerator-Marktplatz: Agents, Rezepte, Vorlagen, Sticker und
 * Hintergründe in einer Liste mit einem Interaktionsmodell (Like, Merken,
 * Melden). Mirrors apps/api/routes/marketplace/marketplaceContractRouter.ts.
 */
import { z } from 'zod';

import { moderatableReportKindSchema } from './contentReport.js';
import { groupAudienceSchema } from './groups.js';
import { studioAssetItemSchema } from './studioAssets.js';

/** F0. `template` matches the `entity_likes`/`entity_favorites` type; URL slugs live in the client registry. */
export const marketplaceKindSchema = z.enum([
  'agent',
  'recipe',
  'template',
  'sticker',
  'background',
  'notebook',
]);
export type MarketplaceKind = z.infer<typeof marketplaceKindSchema>;
export const MARKETPLACE_KINDS = marketplaceKindSchema.options;

/**
 * F0 — what an absent `kinds` means, forever: the kinds the first clients knew.
 * A client that names no kinds must never receive one it cannot render.
 */
export const LEGACY_DEFAULT_KINDS = [
  'agent',
  'recipe',
  'template',
  'sticker',
  'background',
] as const satisfies readonly MarketplaceKind[];

/** F0 — the same values as the Agentura's `?von=`. */
export const marketplaceOriginSchema = z.enum(['offiziell', 'landesverband', 'oeffentlich']);
export type MarketplaceOrigin = z.infer<typeof marketplaceOriginSchema>;

export const marketplaceSortSchema = z.enum(['empfohlen', 'neu', 'beliebt']);
export type MarketplaceSort = z.infer<typeof marketplaceSortSchema>;

export const marketplaceScopeSchema = z.enum(['shop', 'saved']);
export type MarketplaceScope = z.infer<typeof marketplaceScopeSchema>;

export const marketplacePlatformSchema = z.enum(['web', 'mobile']);
export type MarketplacePlatform = z.infer<typeof marketplacePlatformSchema>;

const baseItem = {
  /** `${kind}:${ref}` — unique across sections, for React keys. */
  key: z.string(),
  /** The handle for `/:kind/:ref/like|save`: row uuid for user content, identifier/mention for the official catalogue. */
  ref: z.string(),
  origin: marketplaceOriginSchema,
  title: z.string(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  iconKey: z.string().nullable(),
  authorName: z.string().nullable(),
  audience: groupAudienceSchema,
  likesCount: z.number().int(),
  liked: z.boolean(),
  saved: z.boolean(),
  isOwn: z.boolean(),
  /** What `/api/content-reports` takes as `kind`; `null` for official content, which cannot be reported. */
  reportKind: moderatableReportKindSchema.nullable(),
  createdAt: z.string().nullable(),
};

export const marketplaceAgentItemSchema = z.object({
  ...baseItem,
  kind: z.literal('agent'),
  agent: z.object({
    /** The agent's own identifier (only unique per owner for user agents). */
    identifier: z.string(),
    /**
     * What URLs and chat requests name the agent by: the registry slug for an
     * official agent, `agentRef` for a user agent (row uuid for someone
     * else's, identifier for one's own).
     */
    slug: z.string(),
    isUserAgent: z.boolean(),
  }),
});

export const marketplaceRecipeItemSchema = z.object({
  ...baseItem,
  kind: z.literal('recipe'),
  recipe: z.object({
    mention: z.string(),
    /** `null` for a catalogue recipe — it has no row. */
    rowId: z.string().nullable(),
    skillCategory: z.string().nullable(),
    system: z.boolean(),
  }),
});

export const marketplaceTemplateImageSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
});

export const marketplaceTemplateItemSchema = z.object({
  ...baseItem,
  kind: z.literal('template'),
  template: z.object({
    templateType: z.string().nullable(),
    externalUrl: z.string().nullable(),
    images: z.array(marketplaceTemplateImageSchema),
    categories: z.array(z.string()),
    tags: z.array(z.string()),
    contentData: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
  }),
});

export const marketplaceStickerItemSchema = z.object({
  ...baseItem,
  kind: z.literal('sticker'),
  asset: studioAssetItemSchema,
});

export const marketplaceBackgroundItemSchema = z.object({
  ...baseItem,
  kind: z.literal('background'),
  asset: studioAssetItemSchema,
});

export const marketplaceNotebookItemSchema = z.object({
  ...baseItem,
  kind: z.literal('notebook'),
  notebook: z.object({
    /** `/notebooks/<slug>` — name slug plus suffix, the uuid for pre-backfill rows. */
    slug: z.string(),
  }),
});

export const marketplaceItemSchema = z.discriminatedUnion('kind', [
  marketplaceAgentItemSchema,
  marketplaceRecipeItemSchema,
  marketplaceTemplateItemSchema,
  marketplaceStickerItemSchema,
  marketplaceBackgroundItemSchema,
  marketplaceNotebookItemSchema,
]);
export type MarketplaceItem = z.infer<typeof marketplaceItemSchema>;
export type MarketplaceItemOf<K extends MarketplaceKind> = Extract<MarketplaceItem, { kind: K }>;

/**
 * `kinds` is also the client's capability declaration: a client lists the
 * kinds it can render, and the server answers only those. Unknown values are
 * dropped, not rejected — an older server keeps serving a newer client. An
 * absent parameter means `LEGACY_DEFAULT_KINDS`, not every kind, so a kind
 * added later never reaches a client that did not ask for it; a present one
 * that names no known kind means none.
 */
const kindsQuerySchema = z
  .string()
  .max(200)
  .optional()
  .transform((raw): MarketplaceKind[] => {
    if (raw === undefined) return [...LEGACY_DEFAULT_KINDS];
    const wanted = new Set(raw.split(',').map((k) => k.trim()));
    return MARKETPLACE_KINDS.filter((k) => wanted.has(k));
  });

export const marketplaceListQuerySchema = z.object({
  kinds: kindsQuerySchema,
  origin: marketplaceOriginSchema.nullable().default(null),
  /**
   * One Landesverband (its LV id, e.g. `berlin`) — the Marktplatz page of that
   * Landesverband. Its Agents and Rezepte are listed whether or not the viewer
   * holds its role, like `/agents/<slug>`; an id that is unknown, switched off
   * or for the other country lists no Landesverband content at all.
   */
  lv: z.string().trim().min(1).max(64).nullable().default(null),
  q: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((q) => (q ? q : null)),
  sort: marketplaceSortSchema.default('empfohlen'),
  scope: marketplaceScopeSchema.default('shop'),
  platform: marketplacePlatformSchema.default('web'),
  /** Pagination applies only when exactly one kind is asked for. */
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(60).default(24),
  /** Items per section when several kinds are asked for. */
  sectionLimit: z.coerce.number().int().min(1).max(60).default(12),
});
export type MarketplaceListQueryInput = z.input<typeof marketplaceListQuerySchema>;
export type MarketplaceListQuery = z.output<typeof marketplaceListQuerySchema>;

export const marketplaceSectionSchema = z.object({
  kind: marketplaceKindSchema,
  items: z.array(marketplaceItemSchema),
  hasMore: z.boolean(),
});
export type MarketplaceSection = z.infer<typeof marketplaceSectionSchema>;

export const marketplaceListResponseSchema = z.object({
  sections: z.array(marketplaceSectionSchema),
});
export type MarketplaceListResponse = z.infer<typeof marketplaceListResponseSchema>;

export const marketplaceItemParamsSchema = z.object({
  kind: marketplaceKindSchema,
  ref: z.string().min(1).max(200),
});

export const marketplaceItemQuerySchema = z.object({
  platform: marketplacePlatformSchema.default('web'),
});

/** One item, for a shared link (`/marktplatz?item=<kind>:<ref>`). */
export const marketplaceItemResponseSchema = z.object({ item: marketplaceItemSchema });
export type MarketplaceItemResponse = z.infer<typeof marketplaceItemResponseSchema>;

export const marketplaceLikeResponseSchema = z.object({
  liked: z.boolean(),
  likesCount: z.number().int(),
});
export type MarketplaceLikeResponse = z.infer<typeof marketplaceLikeResponseSchema>;

export const marketplaceSaveResponseSchema = z.object({ saved: z.boolean() });
export type MarketplaceSaveResponse = z.infer<typeof marketplaceSaveResponseSchema>;

/** F0 — the shelves of the front page („Start"), in the order the server returns them. */
export const marketplaceFrontpageShelfIdSchema = z.enum([
  'landesverband',
  'neu',
  'beliebt',
  'gestalten',
]);
export type MarketplaceFrontpageShelfId = z.infer<typeof marketplaceFrontpageShelfIdSchema>;

export const marketplaceFrontpageShelfSchema = z.object({
  shelfId: marketplaceFrontpageShelfIdSchema,
  items: z.array(marketplaceItemSchema),
  /** More behind „Alle anzeigen" than the shelf shows. */
  hasMore: z.boolean(),
});
export type MarketplaceFrontpageShelf = z.infer<typeof marketplaceFrontpageShelfSchema>;

/** F0 — the `?kollektion=` value in shared links; title and copy live in the client registry. */
export const marketplaceCollectionIdSchema = z.enum(['starter', 'barrierefreiheit', 'canva']);
export type MarketplaceCollectionId = z.infer<typeof marketplaceCollectionIdSchema>;

export const marketplaceFrontpageCollectionSchema = z.object({
  collectionId: marketplaceCollectionIdSchema,
  items: z.array(marketplaceItemSchema),
});
export type MarketplaceFrontpageCollection = z.infer<typeof marketplaceFrontpageCollectionSchema>;

export const marketplaceFrontpageQuerySchema = z.object({
  platform: marketplacePlatformSchema.default('web'),
});

/**
 * The whole front page in one answer. A shelf below its minimum is left out,
 * not sent empty. `featureId` names the curated „Im Fokus" slot the item came
 * from; `null` = the fallback (newest official item), which has no pitch.
 */
export const marketplaceFrontpageResponseSchema = z.object({
  featured: marketplaceItemSchema.nullable(),
  featureId: z.string().nullable(),
  shelves: z.array(marketplaceFrontpageShelfSchema),
  /** Curated collections with the items this viewer may see; one below its minimum is left out. */
  collections: z.array(marketplaceFrontpageCollectionSchema),
});
export type MarketplaceFrontpageResponse = z.infer<typeof marketplaceFrontpageResponseSchema>;

export const marketplaceErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
