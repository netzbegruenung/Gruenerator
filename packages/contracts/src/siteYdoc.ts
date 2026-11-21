/**
 * Y keys of a site draft's shared Y.Doc. Keys only, no yjs import, so
 * Hocuspocus and the API can read the seed marker without the codec's
 * dependency tree. The codec lives in `richtext/siteDoc.ts`
 * (`@gruenerator/contracts/site-ydoc`).
 */
import { type SiteDraft } from './schemas/siteDraft.js';
import { type SiteImageFocus } from './schemas/sites.js';

export const SITE_YDOC_KEYS = {
  /** Y.Map: seed guard and schema version. */
  meta: 'siteMeta',
  /** Y.Map of plain page values, last writer wins per key. */
  fields: 'siteFields',
  /**
   * Y.Map<blockId, Y.Map>: one map per block holding `type`, `hidden` and its scalar fields, and
   * for card lists `items` (Y.Map<itemId, Y.Map>) plus `itemOrder` (Y.Array<string>).
   */
  blocks: 'siteBlocks',
  /** Y.Array<string>: block ids in page order. */
  blockOrder: 'siteBlockOrder',
} as const;

/** Keys inside a block's Y.Map that hold its card list. */
export const SITE_BLOCK_ITEM_KEYS = { items: 'items', order: 'itemOrder' } as const;

export const SITE_META_KEYS = {
  schemaVersion: 'schemaVersion',
  /** ISO string, set once the doc has been seeded from the row. */
  seededAt: 'seededAt',
} as const;

/** 2: the page as a block list (21.11.2026). A doc of an older version is not read. */
export const SITE_YDOC_SCHEMA_VERSION = 2;

export const SITE_FIELD_KEYS = [
  'site_title',
  'tagline',
  'profile_image',
  'profileImageFocus',
  'variant',
  'header',
  'contact_email',
  'contact_phone',
  'social_links',
] as const;

export type SiteFieldKey = (typeof SITE_FIELD_KEYS)[number];

export type SiteFieldValues = {
  site_title: SiteDraft['site_title'];
  tagline: SiteDraft['tagline'];
  profile_image: SiteDraft['profile_image'];
  profileImageFocus: SiteImageFocus | null;
  variant: SiteDraft['variant'];
  header: SiteDraft['header'];
  contact_email: SiteDraft['contact_email'];
  contact_phone: SiteDraft['contact_phone'];
  social_links: SiteDraft['social_links'];
};

/** The about text of a block. */
export const siteBlockFragmentKey = (blockId: string): string => `rt:block:${blockId}`;

/** The text of a theme card. */
export const siteItemFragmentKey = (itemId: string): string => `rt:item:${itemId}`;
