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
  /** Y.Map of plain values, last writer wins per key. */
  fields: 'siteFields',
  /** Y.Map<id, Y.Map>: theme cards (title, imageUrl, imageFocus). */
  themes: 'siteThemes',
  /** Y.Array<string>: theme ids in display order. */
  themeOrder: 'siteThemeOrder',
  /** Y.Map<id, Y.Map>: action tiles (text, link, imageUrl, imageFocus). */
  actions: 'siteActions',
  /** Y.Array<string>: action ids in display order. */
  actionOrder: 'siteActionOrder',
} as const;

export const SITE_META_KEYS = {
  schemaVersion: 'schemaVersion',
  /** ISO string, set once the doc has been seeded from the row. */
  seededAt: 'seededAt',
} as const;

export const SITE_YDOC_SCHEMA_VERSION = 1;

export const SITE_FIELD_KEYS = [
  'site_title',
  'tagline',
  'profile_image',
  'profileImageFocus',
  'variant',
  'header',
  'heroLayout',
  'contact_email',
  'contact_phone',
  'social_links',
  'hidden',
  'about.title',
  'heroImage.imageUrl',
  'heroImage.imageFocus',
  'heroImage.title',
  'heroImage.subtitle',
  'contact.title',
  'contact.backgroundImageUrl',
  'contact.backgroundFocus',
  'socialFeed.title',
  'socialFeed.instagramUsername',
  'socialFeed.showFeed',
] as const;

export type SiteFieldKey = (typeof SITE_FIELD_KEYS)[number];

export type SiteFieldValues = {
  site_title: SiteDraft['site_title'];
  tagline: SiteDraft['tagline'];
  profile_image: SiteDraft['profile_image'];
  profileImageFocus: SiteImageFocus | null;
  variant: SiteDraft['variant'];
  header: SiteDraft['header'];
  heroLayout: SiteDraft['heroLayout'];
  contact_email: SiteDraft['contact_email'];
  contact_phone: SiteDraft['contact_phone'];
  social_links: SiteDraft['social_links'];
  hidden: SiteDraft['hidden'];
  'about.title': SiteDraft['about']['title'];
  'heroImage.imageUrl': SiteDraft['heroImage']['imageUrl'];
  'heroImage.imageFocus': SiteImageFocus | null;
  'heroImage.title': SiteDraft['heroImage']['title'];
  'heroImage.subtitle': SiteDraft['heroImage']['subtitle'];
  'contact.title': SiteDraft['contact']['title'];
  'contact.backgroundImageUrl': SiteDraft['contact']['backgroundImageUrl'];
  'contact.backgroundFocus': SiteImageFocus | null;
  'socialFeed.title': SiteDraft['socialFeed']['title'];
  'socialFeed.instagramUsername': SiteDraft['socialFeed']['instagramUsername'];
  'socialFeed.showFeed': SiteDraft['socialFeed']['showFeed'];
};

export const SITE_ABOUT_FRAGMENT = 'rt:about';

export const siteThemeFragmentKey = (id: string): string => `rt:theme:${id}`;
