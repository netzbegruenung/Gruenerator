import {
  buildSiteSnapshot,
  DEFAULT_SITE_HEADER_STYLE,
  defaultSiteBlocks,
  readSiteVariant,
  type PublishedSiteSnapshot,
  type SiteBlock,
  type SiteHeaderStyle,
  type SiteImageFocus,
  type SiteLegalDraft,
  type SiteSnapshotSource,
  type SiteVariant,
  type UpdateSiteBody,
} from './sites.js';

/**
 * The editable state of a site: page fields plus the ordered blocks. Block and item ids are
 * stored with the row, so a copy, a concurrent move and a publish issue all keep pointing at the
 * same block.
 */
export interface SiteDraft {
  site_title: string;
  tagline: string;
  profile_image: string;
  profileImageFocus?: SiteImageFocus | undefined;
  variant: SiteVariant;
  header: SiteHeaderStyle;
  contact_email: string;
  contact_phone: string;
  social_links: Record<string, string>;
  blocks: SiteBlock[];
}

export function siteDraftFromSite(
  site: SiteSnapshotSource,
  newId: () => string = () => crypto.randomUUID()
): SiteDraft {
  const sections = site.sections;
  const blocks = sections?.blocks ?? [];
  return {
    site_title: site.site_title,
    tagline: site.tagline ?? '',
    profile_image: site.profile_image ?? '',
    ...(sections?.profileImageFocus ? { profileImageFocus: sections.profileImageFocus } : {}),
    variant: readSiteVariant(site.theme),
    header: sections?.header ?? DEFAULT_SITE_HEADER_STYLE,
    contact_email: site.contact_email ?? '',
    contact_phone: site.contact_phone ?? '',
    social_links: { ...site.social_links },
    // A new or reset row has no blocks yet; it starts with the standard page.
    blocks: blocks.length > 0 ? structuredClone(blocks) : defaultSiteBlocks(newId),
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

const FOCUS_KEYS = new Set(['imageFocus', 'backgroundFocus']);

/** One level of a block or item without its defaults: unset, not hidden, a centred focus. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, entry]) =>
        entry !== undefined &&
        !(key === 'hidden' && entry === false) &&
        !(FOCUS_KEYS.has(key) && offCentre(entry as SiteImageFocus) === null)
    )
  ) as T;
}

/** Defaults are left out, so an untouched site never reads as changed. */
function blockToRow(block: SiteBlock): SiteBlock {
  const out = compact(block);
  return 'items' in out ? ({ ...out, items: out.items.map(compact) } as SiteBlock) : out;
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
      ...(draft.header === DEFAULT_SITE_HEADER_STYLE ? {} : { header: draft.header }),
      ...withFocus('profileImageFocus', draft.profileImageFocus),
      blocks: draft.blocks.map(blockToRow),
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

/** Postgres `jsonb` reorders object keys on storage, so key order must not matter. Arrays keep theirs. */
function sortKeys(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * The editor schema re-adds node defaults a stored row may lack (`start: 1`, `type: null` on an
 * ordered list), so equal documents can differ in form. Compare both sides in one canonical form.
 */
function canonicalSnapshotJson(value: unknown): string {
  return JSON.stringify(value, (key, entry: unknown) => {
    const node = canonicalEmptyNode(entry);
    if (node !== entry) return sortKeys(node);
    if (key !== 'attrs' || !entry || typeof entry !== 'object') return sortKeys(entry);
    const attrs = Object.fromEntries(
      Object.entries(entry).filter(
        ([name, attr]) => !(name === 'start' && attr === 1) && !(name === 'type' && attr === null)
      )
    );
    return Object.keys(attrs).length > 0 ? sortKeys(attrs) : undefined;
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
