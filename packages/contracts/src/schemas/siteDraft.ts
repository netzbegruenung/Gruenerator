import { emptyRichTextDoc, type RichTextDoc } from './richtext.js';
import {
  buildSiteSnapshot,
  readSiteVariant,
  type PublishedSiteSnapshot,
  type SiteActionTile,
  type SiteImageFocus,
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
  profileImageFocus?: SiteImageFocus | undefined;
  variant: SiteVariant;
  contact_email: string;
  contact_phone: string;
  social_links: Record<string, string>;
  hidden: SiteOptionalSection[];
  about: { title: string; content: RichTextDoc };
  heroImage: {
    imageUrl: string;
    imageFocus?: SiteImageFocus | undefined;
    title: string;
    subtitle: string;
  };
  themes: SiteDraftThemeCard[];
  actions: SiteDraftActionTile[];
  contact: {
    title: string;
    backgroundImageUrl: string;
    backgroundFocus?: SiteImageFocus | undefined;
  };
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
    ...(sections?.profileImageFocus ? { profileImageFocus: sections.profileImageFocus } : {}),
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

type SiteDraftColumn =
  | 'site_title'
  | 'tagline'
  | 'profile_image'
  | 'theme'
  | 'contact_email'
  | 'contact_phone'
  | 'social_links'
  | 'sections';

/** A centred point is the default, so it is left out and an untouched site never reads as changed. */
export function offCentre(focus: SiteImageFocus | undefined): SiteImageFocus | null {
  return focus && !(focus.x === 50 && focus.y === 50) ? focus : null;
}

function withFocus<K extends string>(key: K, focus: SiteImageFocus | undefined) {
  const kept = offCentre(focus);
  return kept ? ({ [key]: kept } as Record<K, SiteImageFocus>) : {};
}

export function siteDraftToRowColumns(draft: SiteDraft): {
  [K in SiteDraftColumn]-?: Exclude<UpdateSiteBody[K], undefined>;
} {
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
      ...withFocus('profileImageFocus', draft.profileImageFocus),
      about: { ...draft.about },
      heroImage: {
        imageUrl: draft.heroImage.imageUrl,
        ...withFocus('imageFocus', draft.heroImage.imageFocus),
        title: draft.heroImage.title,
        subtitle: draft.heroImage.subtitle,
      },
      themes: draft.themes.map(({ id: _id, imageFocus, ...theme }) => ({
        ...theme,
        ...withFocus('imageFocus', imageFocus),
      })),
      actions: draft.actions.map(({ id: _id, imageFocus, ...action }) => ({
        ...action,
        ...withFocus('imageFocus', imageFocus),
      })),
      contact: {
        title: draft.contact.title,
        backgroundImageUrl: draft.contact.backgroundImageUrl,
        ...withFocus('backgroundFocus', draft.contact.backgroundFocus),
      },
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

function isBlankParagraph(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const { type, content } = node as { type?: unknown; content?: unknown };
  return type === 'paragraph' && (!Array.isArray(content) || content.length === 0);
}

/**
 * An empty rich text has several spellings (bare doc, no/empty content, blank paragraphs; the
 * Yjs codec yields one blank paragraph). Fold them into one form; non-empty nodes pass through.
 */
function canonicalEmptyNode(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const node = entry as { type?: unknown; content?: unknown };
  if (node.type === 'doc') {
    const content = node.content;
    if (!Array.isArray(content) || content.every(isBlankParagraph)) {
      return { type: 'doc', content: [{ type: 'paragraph' }] };
    }
  } else if (isBlankParagraph(node) && 'content' in node) {
    const { content: _content, ...rest } = node;
    return rest;
  }
  return entry;
}

/**
 * The editor schema re-adds node defaults a stored row may lack (`start: 1`, `type: null` on an
 * ordered list), so equal documents can differ in form. Compare both sides in one canonical form.
 */
function canonicalSnapshotJson(value: unknown): string {
  return JSON.stringify(value, (key, entry: unknown) => {
    const node = canonicalEmptyNode(entry);
    if (node !== entry) return node;
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
