import { emptyRichTextDoc, type RichTextDoc } from './richtext.js';
import {
  buildSiteSnapshot,
  readSiteVariant,
  type PublishedSiteSnapshot,
  type SiteActionTile,
  type SiteLegalDraft,
  type SiteOptionalSection,
  type SiteSnapshotSource,
  type SiteThemeCard,
  type SiteVariant,
  type UpdateSiteBody,
} from './sites.js';

export interface SiteDraftThemeCard extends SiteThemeCard {
  id: string;
}

export interface SiteDraftActionTile extends SiteActionTile {
  id: string;
}

export interface SiteDraft {
  site_title: string;
  tagline: string;
  profile_image: string;
  variant: SiteVariant;
  contact_email: string;
  contact_phone: string;
  social_links: Record<string, string>;
  hidden: SiteOptionalSection[];
  about: { title: string; content: RichTextDoc };
  heroImage: { imageUrl: string; title: string; subtitle: string };
  themes: SiteDraftThemeCard[];
  actions: SiteDraftActionTile[];
  contact: { title: string; backgroundImageUrl: string };
  socialFeed: { title: string; instagramUsername: string; showFeed: boolean };
}

export function siteDraftFromSite(
  site: SiteSnapshotSource,
  newId: () => string = () => crypto.randomUUID()
): SiteDraft {
  const sections = site.sections;
  return {
    site_title: site.site_title,
    tagline: site.tagline ?? '',
    profile_image: site.profile_image ?? '',
    variant: readSiteVariant(site.theme),
    contact_email: site.contact_email ?? '',
    contact_phone: site.contact_phone ?? '',
    social_links: { ...site.social_links },
    hidden: [...(sections?.hidden ?? [])],
    about: sections?.about
      ? { title: sections.about.title, content: sections.about.content }
      : { title: 'Wer ich bin', content: emptyRichTextDoc() },
    heroImage: sections?.heroImage
      ? { ...sections.heroImage }
      : { imageUrl: '', title: 'Gemeinsam für eine nachhaltige Zukunft!', subtitle: '' },
    themes: (sections?.themes ?? []).map((theme) => ({ ...theme, id: newId() })),
    actions: (sections?.actions ?? []).map((action) => ({ ...action, id: newId() })),
    contact: sections?.contact
      ? { ...sections.contact }
      : { title: 'Kontakt', backgroundImageUrl: '' },
    socialFeed: {
      title: sections?.socialFeed?.title ?? 'Instagram',
      instagramUsername: sections?.socialFeed?.instagramUsername ?? '',
      showFeed: sections?.socialFeed?.showFeed ?? false,
    },
  };
}

export function siteDraftToRowColumns(
  draft: SiteDraft
): Required<
  Pick<
    UpdateSiteBody,
    | 'site_title'
    | 'tagline'
    | 'profile_image'
    | 'theme'
    | 'contact_email'
    | 'contact_phone'
    | 'social_links'
    | 'sections'
  >
> {
  return {
    site_title: draft.site_title,
    tagline: draft.tagline,
    profile_image: draft.profile_image,
    theme: draft.variant,
    contact_email: draft.contact_email,
    contact_phone: draft.contact_phone,
    social_links: { ...draft.social_links },
    sections: {
      hidden: [...draft.hidden],
      about: { ...draft.about },
      heroImage: { ...draft.heroImage },
      themes: draft.themes.map(({ id: _id, ...theme }) => theme),
      actions: draft.actions.map(({ id: _id, ...action }) => action),
      contact: { ...draft.contact },
      socialFeed: { ...draft.socialFeed },
    },
  };
}

export function siteDraftToSnapshotSource(
  draft: SiteDraft,
  legal: SiteLegalDraft | null
): SiteSnapshotSource {
  const columns = siteDraftToRowColumns(draft);
  return { ...columns, legal };
}

/**
 * The editor schema re-adds node defaults a stored row may lack (`start: 1`, `type: null` on an
 * ordered list), so equal documents can differ in form. Compare both sides in one canonical form.
 */
function canonicalSnapshotJson(value: unknown): string {
  return JSON.stringify(value, (key, entry: unknown) => {
    if (key !== 'attrs' || !entry || typeof entry !== 'object') return entry;
    const attrs = Object.fromEntries(
      Object.entries(entry).filter(
        ([name, attr]) => !(name === 'start' && attr === 1) && !(name === 'type' && attr === null)
      )
    );
    return Object.keys(attrs).length > 0 ? attrs : undefined;
  });
}

export function snapshotDiffers(
  source: SiteSnapshotSource,
  published: PublishedSiteSnapshot
): boolean {
  const rebuilt = buildSiteSnapshot(source, published.locale);
  if (!rebuilt.ok) return true;
  return canonicalSnapshotJson(rebuilt.snapshot) !== canonicalSnapshotJson(published);
}
