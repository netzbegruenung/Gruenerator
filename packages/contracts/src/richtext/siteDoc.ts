/**
 * Y.Doc codec for site drafts: seed from a `SiteDraft`, decode back, and the
 * field-level mutators the editor uses.
 *
 * Subpath export ONLY (`@gruenerator/contracts/site-ydoc`). Never re-export
 * from `src/index.ts`: apps/mobile consumes the main export and Metro would
 * pull yjs, y-prosemirror and tiptap into the mobile bundle.
 */
import { getSchema } from '@tiptap/core';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';
import * as Y from 'yjs';

import { emptyRichTextDoc, type RichTextDoc } from '../schemas/richtext.js';
import {
  siteDraftFromSite,
  type SiteDraft,
  type SiteDraftActionTile,
  type SiteDraftThemeCard,
} from '../schemas/siteDraft.js';
import {
  readSiteVariant,
  siteHeaderStyleSchema,
  siteHeroLayoutSchema,
  siteImageFocusSchema,
  SITE_ACTIONS_MAX,
  SITE_THEMES_MAX,
  type SiteActionTile,
  type SiteImageFocus,
  type SiteOptionalSection,
  type SiteThemeCard,
} from '../schemas/sites.js';
import {
  SITE_ABOUT_FRAGMENT,
  SITE_FIELD_KEYS,
  SITE_META_KEYS,
  SITE_YDOC_KEYS,
  SITE_YDOC_SCHEMA_VERSION,
  siteThemeFragmentKey,
  type SiteFieldKey,
  type SiteFieldValues,
} from '../siteYdoc.js';

import { siteRichTextExtensions } from './index.js';

export type { SiteFieldKey, SiteFieldValues } from '../siteYdoc.js';

export const SITE_LOCAL_ORIGIN = 'site-local';
export const SITE_SEED_ORIGIN = 'site-seed';

const siteSchema = getSchema(siteRichTextExtensions);

const defaults = siteDraftFromSite({
  site_title: '',
  tagline: null,
  profile_image: null,
  theme: null,
  contact_email: null,
  contact_phone: null,
  social_links: {},
  sections: null,
  legal: null,
});

const defaultFieldValues: SiteFieldValues = {
  site_title: defaults.site_title,
  tagline: defaults.tagline,
  profile_image: defaults.profile_image,
  profileImageFocus: null,
  variant: defaults.variant,
  header: defaults.header,
  heroLayout: defaults.heroLayout,
  contact_email: defaults.contact_email,
  contact_phone: defaults.contact_phone,
  social_links: defaults.social_links,
  hidden: defaults.hidden,
  'about.title': defaults.about.title,
  'heroImage.imageUrl': defaults.heroImage.imageUrl,
  'heroImage.imageFocus': null,
  'heroImage.title': defaults.heroImage.title,
  'heroImage.subtitle': defaults.heroImage.subtitle,
  'contact.title': defaults.contact.title,
  'contact.backgroundImageUrl': defaults.contact.backgroundImageUrl,
  'contact.backgroundFocus': null,
  'socialFeed.title': defaults.socialFeed.title,
  'socialFeed.instagramUsername': defaults.socialFeed.instagramUsername,
  'socialFeed.showFeed': defaults.socialFeed.showFeed,
};

const OPTIONAL_SECTIONS: readonly SiteOptionalSection[] = [
  'about',
  'themes',
  'actions',
  'contact',
  'socialFeed',
];

const newId = (): string => crypto.randomUUID();

const fieldsMap = (ydoc: Y.Doc) => ydoc.getMap<unknown>(SITE_YDOC_KEYS.fields);
const metaMap = (ydoc: Y.Doc) => ydoc.getMap<unknown>(SITE_YDOC_KEYS.meta);
const themesMap = (ydoc: Y.Doc) => ydoc.getMap<Y.Map<unknown>>(SITE_YDOC_KEYS.themes);
const themeOrder = (ydoc: Y.Doc) => ydoc.getArray<string>(SITE_YDOC_KEYS.themeOrder);
const actionsMap = (ydoc: Y.Doc) => ydoc.getMap<Y.Map<unknown>>(SITE_YDOC_KEYS.actions);
const actionOrder = (ydoc: Y.Doc) => ydoc.getArray<string>(SITE_YDOC_KEYS.actionOrder);

export function getAboutFragment(ydoc: Y.Doc): Y.XmlFragment {
  return ydoc.getXmlFragment(SITE_ABOUT_FRAGMENT);
}

export function getThemeFragment(ydoc: Y.Doc, id: string): Y.XmlFragment {
  return ydoc.getXmlFragment(siteThemeFragmentKey(id));
}

type PmNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: PmNode[];
};

/** y-prosemirror emits `attrs: {}` on nodes that have none; the stored model omits it. */
function stripEmptyAttrs(node: PmNode): PmNode {
  const { attrs, content, marks, ...rest } = node;
  const out: PmNode = { ...rest };
  if (attrs && Object.keys(attrs).length > 0) out.attrs = attrs;
  if (content) out.content = content.map(stripEmptyAttrs);
  if (marks) out.marks = marks.map(stripEmptyAttrs);
  return out;
}

function fragmentToRichText(fragment: Y.XmlFragment): RichTextDoc {
  if (fragment.length === 0) return emptyRichTextDoc();
  const json = yXmlFragmentToProsemirrorJSON(fragment) as PmNode;
  // Boundary cast: y-prosemirror returns untyped JSON, shaped by siteSchema.
  const doc = stripEmptyAttrs(json);
  return doc as unknown as RichTextDoc;
}

function seedFragment(fragment: Y.XmlFragment, content: RichTextDoc): void {
  if (fragment.length) fragment.delete(0, fragment.length);
  prosemirrorJSONToYXmlFragment(siteSchema, content, fragment);
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readFocus(value: unknown): SiteImageFocus | null {
  const parsed = siteImageFocusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const FOCUS_KEYS: readonly SiteFieldKey[] = [
  'profileImageFocus',
  'heroImage.imageFocus',
  'contact.backgroundFocus',
];

function readField<K extends SiteFieldKey>(fields: Y.Map<unknown>, key: K): SiteFieldValues[K];
function readField(fields: Y.Map<unknown>, key: SiteFieldKey): SiteFieldValues[SiteFieldKey] {
  const value = fields.get(key);
  if (FOCUS_KEYS.includes(key)) return readFocus(value);
  switch (key) {
    case 'variant':
      return readSiteVariant(typeof value === 'string' ? value : null);
    case 'header': {
      const parsed = siteHeaderStyleSchema.safeParse(value);
      return parsed.success ? parsed.data : defaultFieldValues.header;
    }
    case 'heroLayout': {
      const parsed = siteHeroLayoutSchema.safeParse(value);
      return parsed.success ? parsed.data : defaultFieldValues.heroLayout;
    }
    case 'social_links': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return defaultFieldValues.social_links;
      }
      return Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string'
        )
      );
    }
    case 'hidden':
      if (!Array.isArray(value)) return defaultFieldValues.hidden;
      return value.filter((entry): entry is SiteOptionalSection =>
        OPTIONAL_SECTIONS.includes(entry as SiteOptionalSection)
      );
    case 'socialFeed.showFeed':
      return typeof value === 'boolean' ? value : defaultFieldValues['socialFeed.showFeed'];
    default:
      return str(value, defaultFieldValues[key] as string);
  }
}

function writeSeedFields(ydoc: Y.Doc, draft: SiteDraft): void {
  const fields = fieldsMap(ydoc);
  const values: SiteFieldValues = {
    site_title: draft.site_title,
    tagline: draft.tagline,
    profile_image: draft.profile_image,
    profileImageFocus: draft.profileImageFocus ?? null,
    variant: draft.variant,
    header: draft.header,
    heroLayout: draft.heroLayout,
    contact_email: draft.contact_email,
    contact_phone: draft.contact_phone,
    social_links: draft.social_links,
    hidden: draft.hidden,
    'about.title': draft.about.title,
    'heroImage.imageUrl': draft.heroImage.imageUrl,
    'heroImage.imageFocus': draft.heroImage.imageFocus ?? null,
    'heroImage.title': draft.heroImage.title,
    'heroImage.subtitle': draft.heroImage.subtitle,
    'contact.title': draft.contact.title,
    'contact.backgroundImageUrl': draft.contact.backgroundImageUrl,
    'contact.backgroundFocus': draft.contact.backgroundFocus ?? null,
    'socialFeed.title': draft.socialFeed.title,
    'socialFeed.instagramUsername': draft.socialFeed.instagramUsername,
    'socialFeed.showFeed': draft.socialFeed.showFeed,
  };
  for (const key of SITE_FIELD_KEYS) fields.set(key, values[key]);
}

export function seedSiteDoc(ydoc: Y.Doc, draft: SiteDraft, seededAt: string): void {
  ydoc.transact(() => {
    writeSeedFields(ydoc, draft);
    seedFragment(getAboutFragment(ydoc), draft.about.content);

    const themes = themesMap(ydoc);
    const themeIds = themeOrder(ydoc);
    for (const theme of draft.themes) {
      const card = new Y.Map<unknown>();
      card.set('title', theme.title);
      card.set('imageUrl', theme.imageUrl);
      if (theme.imageFocus) card.set('imageFocus', theme.imageFocus);
      themes.set(theme.id, card);
      seedFragment(getThemeFragment(ydoc, theme.id), theme.content);
    }
    themeIds.push(draft.themes.map((theme) => theme.id));

    const actions = actionsMap(ydoc);
    const actionIds = actionOrder(ydoc);
    for (const action of draft.actions) {
      const tile = new Y.Map<unknown>();
      tile.set('text', action.text);
      tile.set('link', action.link);
      tile.set('imageUrl', action.imageUrl);
      if (action.imageFocus) tile.set('imageFocus', action.imageFocus);
      actions.set(action.id, tile);
    }
    actionIds.push(draft.actions.map((action) => action.id));

    const meta = metaMap(ydoc);
    meta.set(SITE_META_KEYS.schemaVersion, SITE_YDOC_SCHEMA_VERSION);
    meta.set(SITE_META_KEYS.seededAt, seededAt);
  }, SITE_SEED_ORIGIN);
}

export function encodeSiteSeed(draft: SiteDraft, seededAt: string): Uint8Array {
  const ydoc = new Y.Doc();
  try {
    seedSiteDoc(ydoc, draft, seededAt);
    return Y.encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
}

export function isSiteDocSeeded(ydoc: Y.Doc): boolean {
  return typeof metaMap(ydoc).get(SITE_META_KEYS.seededAt) === 'string';
}

/** Concurrent moves each delete and re-insert an id, so the order array can hold it twice. */
function uniqueIds(order: Y.Array<string>): string[] {
  return [...new Set(order.toArray().filter((id) => typeof id === 'string'))];
}

export function decodeSiteDraft(ydoc: Y.Doc): SiteDraft {
  const fields = fieldsMap(ydoc);

  const themes = themesMap(ydoc);
  const themeCards: SiteDraftThemeCard[] = [];
  for (const id of uniqueIds(themeOrder(ydoc))) {
    const card = themes.get(id);
    if (!(card instanceof Y.Map)) continue;
    const imageFocus = readFocus(card.get('imageFocus'));
    themeCards.push({
      id,
      title: str(card.get('title'), ''),
      imageUrl: str(card.get('imageUrl'), ''),
      ...(imageFocus ? { imageFocus } : {}),
      content: fragmentToRichText(getThemeFragment(ydoc, id)),
    });
    if (themeCards.length >= SITE_THEMES_MAX) break;
  }

  const actions = actionsMap(ydoc);
  const actionTiles: SiteDraftActionTile[] = [];
  for (const id of uniqueIds(actionOrder(ydoc))) {
    const tile = actions.get(id);
    if (!(tile instanceof Y.Map)) continue;
    const imageFocus = readFocus(tile.get('imageFocus'));
    actionTiles.push({
      id,
      text: str(tile.get('text'), ''),
      link: str(tile.get('link'), ''),
      imageUrl: str(tile.get('imageUrl'), ''),
      ...(imageFocus ? { imageFocus } : {}),
    });
    if (actionTiles.length >= SITE_ACTIONS_MAX) break;
  }

  const profileImageFocus = readField(fields, 'profileImageFocus');
  const heroFocus = readField(fields, 'heroImage.imageFocus');
  const backgroundFocus = readField(fields, 'contact.backgroundFocus');

  return {
    site_title: readField(fields, 'site_title'),
    tagline: readField(fields, 'tagline'),
    profile_image: readField(fields, 'profile_image'),
    ...(profileImageFocus ? { profileImageFocus } : {}),
    variant: readField(fields, 'variant'),
    header: readField(fields, 'header'),
    heroLayout: readField(fields, 'heroLayout'),
    contact_email: readField(fields, 'contact_email'),
    contact_phone: readField(fields, 'contact_phone'),
    social_links: readField(fields, 'social_links'),
    hidden: readField(fields, 'hidden'),
    about: {
      title: readField(fields, 'about.title'),
      content: fragmentToRichText(getAboutFragment(ydoc)),
    },
    heroImage: {
      imageUrl: readField(fields, 'heroImage.imageUrl'),
      ...(heroFocus ? { imageFocus: heroFocus } : {}),
      title: readField(fields, 'heroImage.title'),
      subtitle: readField(fields, 'heroImage.subtitle'),
    },
    themes: themeCards,
    actions: actionTiles,
    contact: {
      title: readField(fields, 'contact.title'),
      backgroundImageUrl: readField(fields, 'contact.backgroundImageUrl'),
      ...(backgroundFocus ? { backgroundFocus } : {}),
    },
    socialFeed: {
      title: readField(fields, 'socialFeed.title'),
      instagramUsername: readField(fields, 'socialFeed.instagramUsername'),
      showFeed: readField(fields, 'socialFeed.showFeed'),
    },
  };
}

export function setSiteField<K extends SiteFieldKey>(
  ydoc: Y.Doc,
  key: K,
  value: SiteFieldValues[K]
): void {
  ydoc.transact(() => {
    fieldsMap(ydoc).set(key, value);
  }, SITE_LOCAL_ORIGIN);
}

function addItem(
  ydoc: Y.Doc,
  items: Y.Map<Y.Map<unknown>>,
  order: Y.Array<string>,
  max: number,
  initial: Record<string, string>
): string | null {
  if (order.length >= max) return null;
  const id = newId();
  ydoc.transact(() => {
    const item = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(initial)) item.set(key, value);
    items.set(id, item);
    order.push([id]);
  }, SITE_LOCAL_ORIGIN);
  return id;
}

function patchItem(
  ydoc: Y.Doc,
  items: Y.Map<Y.Map<unknown>>,
  id: string,
  patch: Record<string, string | SiteImageFocus | null | undefined>
): void {
  const item = items.get(id);
  if (!item) return;
  ydoc.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) item.set(key, value);
    }
  }, SITE_LOCAL_ORIGIN);
}

function removeItem(
  ydoc: Y.Doc,
  items: Y.Map<Y.Map<unknown>>,
  order: Y.Array<string>,
  id: string,
  fragment: Y.XmlFragment | null
): void {
  ydoc.transact(() => {
    items.delete(id);
    if (fragment && fragment.length > 0) fragment.delete(0, fragment.length);
    for (let index = order.length - 1; index >= 0; index -= 1) {
      if (order.get(index) === id) order.delete(index, 1);
    }
  }, SITE_LOCAL_ORIGIN);
}

function moveItem(ydoc: Y.Doc, order: Y.Array<string>, id: string, toIndex: number): void {
  const from = order.toArray().indexOf(id);
  if (from === -1) return;
  const target = Math.max(0, Math.min(toIndex, order.length - 1));
  if (target === from) return;
  ydoc.transact(() => {
    order.delete(from, 1);
    order.insert(target, [id]);
  }, SITE_LOCAL_ORIGIN);
}

export function addSiteThemeCard(ydoc: Y.Doc): string | null {
  return addItem(ydoc, themesMap(ydoc), themeOrder(ydoc), SITE_THEMES_MAX, {
    title: '',
    imageUrl: '',
  });
}

// A removed theme leaves an empty `rt:theme:<id>` fragment stub behind: Yjs cannot delete a
// top-level type, so only its content is cleared; decode never reaches it.
export function removeSiteThemeCard(ydoc: Y.Doc, id: string): void {
  removeItem(ydoc, themesMap(ydoc), themeOrder(ydoc), id, getThemeFragment(ydoc, id));
}

export function updateSiteThemeCard(
  ydoc: Y.Doc,
  id: string,
  patch: Partial<Pick<SiteThemeCard, 'title' | 'imageUrl'>> & { imageFocus?: SiteImageFocus | null }
): void {
  patchItem(ydoc, themesMap(ydoc), id, patch);
}

export function moveSiteThemeCard(ydoc: Y.Doc, id: string, toIndex: number): void {
  moveItem(ydoc, themeOrder(ydoc), id, toIndex);
}

export function addSiteActionTile(ydoc: Y.Doc): string | null {
  return addItem(ydoc, actionsMap(ydoc), actionOrder(ydoc), SITE_ACTIONS_MAX, {
    text: '',
    link: '',
    imageUrl: '',
  });
}

export function updateSiteActionTile(
  ydoc: Y.Doc,
  id: string,
  patch: Partial<Pick<SiteActionTile, 'text' | 'link' | 'imageUrl'>> & {
    imageFocus?: SiteImageFocus | null;
  }
): void {
  patchItem(ydoc, actionsMap(ydoc), id, patch);
}

export function removeSiteActionTile(ydoc: Y.Doc, id: string): void {
  removeItem(ydoc, actionsMap(ydoc), actionOrder(ydoc), id, null);
}

export function moveSiteActionTile(ydoc: Y.Doc, id: string, toIndex: number): void {
  moveItem(ydoc, actionOrder(ydoc), id, toIndex);
}
