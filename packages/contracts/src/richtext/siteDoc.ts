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
import { siteDraftFromSite, type SiteDraft } from '../schemas/siteDraft.js';
import {
  defaultSiteBlock,
  readSiteVariant,
  SITE_BLOCKS_MAX,
  siteBlockSpec,
  siteBlockTypeSchema,
  siteHeaderStyleSchema,
  siteHeroLayoutSchema,
  siteImageFocusSchema,
  withHeroOnTop,
  type SiteActionItem,
  type SiteBlock,
  type SiteBlockOf,
  type SiteBlockType,
  type SiteImageFocus,
  type SiteThemeItem,
} from '../schemas/sites.js';
import {
  SITE_BLOCK_ITEM_KEYS,
  SITE_FIELD_KEYS,
  SITE_META_KEYS,
  SITE_YDOC_KEYS,
  SITE_YDOC_SCHEMA_VERSION,
  siteBlockFragmentKey,
  siteItemFragmentKey,
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
  contact_email: defaults.contact_email,
  contact_phone: defaults.contact_phone,
  social_links: defaults.social_links,
};

const newId = (): string => crypto.randomUUID();

type YBlock = Y.Map<unknown>;

const fieldsMap = (ydoc: Y.Doc) => ydoc.getMap<unknown>(SITE_YDOC_KEYS.fields);
const metaMap = (ydoc: Y.Doc) => ydoc.getMap<unknown>(SITE_YDOC_KEYS.meta);
const blocksMap = (ydoc: Y.Doc) => ydoc.getMap<YBlock>(SITE_YDOC_KEYS.blocks);
const blockOrder = (ydoc: Y.Doc) => ydoc.getArray<string>(SITE_YDOC_KEYS.blockOrder);

export function getBlockFragment(ydoc: Y.Doc, blockId: string): Y.XmlFragment {
  return ydoc.getXmlFragment(siteBlockFragmentKey(blockId));
}

export function getItemFragment(ydoc: Y.Doc, itemId: string): Y.XmlFragment {
  return ydoc.getXmlFragment(siteItemFragmentKey(itemId));
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

function readField<K extends SiteFieldKey>(fields: Y.Map<unknown>, key: K): SiteFieldValues[K];
function readField(fields: Y.Map<unknown>, key: SiteFieldKey): SiteFieldValues[SiteFieldKey] {
  const value = fields.get(key);
  switch (key) {
    case 'profileImageFocus':
      return readFocus(value);
    case 'variant':
      return readSiteVariant(typeof value === 'string' ? value : null);
    case 'header': {
      const parsed = siteHeaderStyleSchema.safeParse(value);
      return parsed.success ? parsed.data : defaultFieldValues.header;
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
    default:
      return str(value, defaultFieldValues[key]);
  }
}

// ── Block layout in the doc ─────────────────────────────────────────────────

/** Plain fields each block type keeps as single keys of its Y.Map (rich text lives apart). */
const BLOCK_SCALARS: { [T in SiteBlockType]: readonly string[] } = {
  hero: ['layout'],
  about: ['title'],
  heroImage: ['imageUrl', 'imageFocus', 'title', 'subtitle'],
  themes: [],
  actions: [],
  socialFeed: ['title', 'instagramUsername'],
  contact: ['title', 'backgroundImageUrl', 'backgroundFocus'],
};

type ListType = 'themes' | 'actions';
const ITEM_SCALARS: { [T in ListType]: readonly string[] } = {
  themes: ['title', 'imageUrl', 'imageFocus'],
  actions: ['text', 'link', 'imageUrl', 'imageFocus'],
};
const EMPTY_ITEM: { [T in ListType]: Record<string, string> } = {
  themes: { title: '', imageUrl: '' },
  actions: { text: '', link: '', imageUrl: '' },
};

const isListType = (type: SiteBlockType): type is ListType =>
  type === 'themes' || type === 'actions';

/** A patch value: `null` or `undefined` clears an optional field such as a focus. */
type Clearable<T> = { [K in keyof T]?: T[K] | null };
export type SiteBlockPatch<T extends SiteBlockType> = Clearable<
  Omit<SiteBlockOf<T>, 'id' | 'type' | 'hidden' | 'items' | 'content'>
>;
export type SiteItemPatch =
  Clearable<Omit<SiteThemeItem, 'id' | 'content'>> | Clearable<Omit<SiteActionItem, 'id'>>;

function readScalar(key: string, value: unknown, fallback: unknown): unknown {
  if (key.endsWith('Focus')) return readFocus(value) ?? undefined;
  if (key === 'layout') {
    const parsed = siteHeroLayoutSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback;
  return str(value, typeof fallback === 'string' ? fallback : '');
}

/** Copies the known keys of `source` onto `target`, leaving out unset ones. */
function readScalars(
  target: Record<string, unknown>,
  map: Y.Map<unknown>,
  keys: readonly string[]
) {
  for (const key of keys) {
    const value = readScalar(key, map.get(key), target[key]);
    if (value === undefined) delete target[key];
    else target[key] = value;
  }
}

function writeScalars(map: Y.Map<unknown>, source: object, keys: readonly string[]) {
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key];
    if (value === undefined || value === null) map.delete(key);
    else map.set(key, value);
  }
}

function blockType(map: YBlock): SiteBlockType | null {
  const parsed = siteBlockTypeSchema.safeParse(map.get('type'));
  return parsed.success ? parsed.data : null;
}

function itemMaps(map: YBlock): { items: Y.Map<Y.Map<unknown>>; order: Y.Array<string> } | null {
  const items = map.get(SITE_BLOCK_ITEM_KEYS.items);
  const order = map.get(SITE_BLOCK_ITEM_KEYS.order);
  return items instanceof Y.Map && order instanceof Y.Array
    ? { items: items as Y.Map<Y.Map<unknown>>, order: order as Y.Array<string> }
    : null;
}

/** Concurrent moves each delete and re-insert an id, so an order array can hold it twice. */
function uniqueIds(order: Y.Array<string>): string[] {
  return [...new Set(order.toArray().filter((id) => typeof id === 'string'))];
}

function decodeBlock(ydoc: Y.Doc, id: string, map: YBlock): SiteBlock | null {
  const type = blockType(map);
  if (!type) return null;
  const block = defaultSiteBlock(type, () => id) as Record<string, unknown>;
  readScalars(block, map, BLOCK_SCALARS[type]);
  // `hidden` comes from the doc only, never from the type's defaults.
  delete block['hidden'];
  if (map.get('hidden') === true && !siteBlockSpec(type).pinned) block['hidden'] = true;
  if (type === 'about') block['content'] = fragmentToRichText(getBlockFragment(ydoc, id));
  if (isListType(type)) {
    const lists = itemMaps(map);
    const max = siteBlockSpec(type).itemMax;
    const items: Record<string, unknown>[] = [];
    for (const itemId of lists ? uniqueIds(lists.order) : []) {
      const itemMap = lists?.items.get(itemId);
      if (!(itemMap instanceof Y.Map)) continue;
      const item: Record<string, unknown> = { id: itemId, ...EMPTY_ITEM[type] };
      readScalars(item, itemMap, ITEM_SCALARS[type]);
      if (type === 'themes') item['content'] = fragmentToRichText(getItemFragment(ydoc, itemId));
      items.push(item);
      if (items.length >= max) break;
    }
    block['items'] = items;
  }
  // Boundary cast: built from the type's defaults and its known keys only.
  return block as SiteBlock;
}

function writeBlock(ydoc: Y.Doc, block: SiteBlock): YBlock {
  const map = new Y.Map<unknown>();
  map.set('type', block.type);
  if (block.hidden) map.set('hidden', true);
  writeScalars(map, block, BLOCK_SCALARS[block.type]);
  blocksMap(ydoc).set(block.id, map);
  if (block.type === 'about') seedFragment(getBlockFragment(ydoc, block.id), block.content);
  if (block.type === 'themes' || block.type === 'actions') {
    const items = new Y.Map<Y.Map<unknown>>();
    const order = new Y.Array<string>();
    map.set(SITE_BLOCK_ITEM_KEYS.items, items);
    map.set(SITE_BLOCK_ITEM_KEYS.order, order);
    for (const item of block.items) {
      const itemMap = new Y.Map<unknown>();
      writeScalars(itemMap, item, ITEM_SCALARS[block.type]);
      items.set(item.id, itemMap);
      if ('content' in item) seedFragment(getItemFragment(ydoc, item.id), item.content);
    }
    order.push(block.items.map((item) => item.id));
  }
  return map;
}

function clearFragment(fragment: Y.XmlFragment): void {
  if (fragment.length > 0) fragment.delete(0, fragment.length);
}

// ── Seed and decode ─────────────────────────────────────────────────────────

function writeSeedFields(ydoc: Y.Doc, draft: SiteDraft): void {
  const fields = fieldsMap(ydoc);
  const values: SiteFieldValues = {
    site_title: draft.site_title,
    tagline: draft.tagline,
    profile_image: draft.profile_image,
    profileImageFocus: draft.profileImageFocus ?? null,
    variant: draft.variant,
    header: draft.header,
    contact_email: draft.contact_email,
    contact_phone: draft.contact_phone,
    social_links: draft.social_links,
  };
  for (const key of SITE_FIELD_KEYS) fields.set(key, values[key]);
}

export function seedSiteDoc(ydoc: Y.Doc, draft: SiteDraft, seededAt: string): void {
  ydoc.transact(() => {
    writeSeedFields(ydoc, draft);
    for (const block of draft.blocks) writeBlock(ydoc, block);
    blockOrder(ydoc).push(draft.blocks.map((block) => block.id));
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

/**
 * Seeded in the block layout. The block order is the mark, not the meta: only a seed of this
 * layout writes it, and it is never empty afterwards (the hero cannot be removed). The meta
 * would not do: an editor tab of an older layout writes its own meta back, and Yjs settles the
 * concurrent entries by client id, so the old schema version can win.
 */
export function isSiteDocSeeded(ydoc: Y.Doc): boolean {
  return blockOrder(ydoc).length > 0;
}

/**
 * The blocks in page order, repaired so the page always parses: duplicate order entries go, a
 * block that lost its order entry is appended instead of lost, the hero sits on top (one is added
 * when none is left) and blocks past a type's limit or the page limit are dropped.
 */
function decodeBlocks(ydoc: Y.Doc): SiteBlock[] {
  const maps = blocksMap(ydoc);
  const ids = uniqueIds(blockOrder(ydoc));
  const ordered = new Set(ids);
  for (const id of maps.keys()) if (!ordered.has(id)) ids.push(id);
  const counts = new Map<SiteBlockType, number>();
  const out: SiteBlock[] = [];
  for (const id of ids) {
    const map = maps.get(id);
    if (!(map instanceof Y.Map)) continue;
    const block = decodeBlock(ydoc, id, map);
    if (!block) continue;
    const count = (counts.get(block.type) ?? 0) + 1;
    const max = siteBlockSpec(block.type).max;
    if (max !== null && count > max) continue;
    counts.set(block.type, count);
    out.push(block);
  }
  return withHeroOnTop(out).slice(0, SITE_BLOCKS_MAX);
}

export function decodeSiteDraft(ydoc: Y.Doc): SiteDraft {
  const fields = fieldsMap(ydoc);
  const profileImageFocus = readField(fields, 'profileImageFocus');
  return {
    site_title: readField(fields, 'site_title'),
    tagline: readField(fields, 'tagline'),
    profile_image: readField(fields, 'profile_image'),
    ...(profileImageFocus ? { profileImageFocus } : {}),
    variant: readField(fields, 'variant'),
    header: readField(fields, 'header'),
    contact_email: readField(fields, 'contact_email'),
    contact_phone: readField(fields, 'contact_phone'),
    social_links: readField(fields, 'social_links'),
    blocks: decodeBlocks(ydoc),
  };
}

// ── Mutators ────────────────────────────────────────────────────────────────

export function setSiteField<K extends SiteFieldKey>(
  ydoc: Y.Doc,
  key: K,
  value: SiteFieldValues[K]
): void {
  ydoc.transact(() => {
    fieldsMap(ydoc).set(key, value);
  }, SITE_LOCAL_ORIGIN);
}

function liveBlock(ydoc: Y.Doc, id: string): { map: YBlock; type: SiteBlockType } | null {
  const map = blocksMap(ydoc).get(id);
  if (!(map instanceof Y.Map)) return null;
  const type = blockType(map);
  return type ? { map, type } : null;
}

function countOf(draft: SiteDraft, type: SiteBlockType): number {
  return draft.blocks.filter((block) => block.type === type).length;
}

function roomFor(draft: SiteDraft, type: SiteBlockType): boolean {
  const spec = siteBlockSpec(type);
  if (spec.pinned || draft.blocks.length >= SITE_BLOCKS_MAX) return false;
  return spec.max === null || countOf(draft, type) < spec.max;
}

function insertBlock(ydoc: Y.Doc, block: SiteBlock, index: number): void {
  const order = blockOrder(ydoc);
  // Index 0 belongs to the hero.
  const target = Math.max(1, Math.min(index, order.length));
  ydoc.transact(() => {
    writeBlock(ydoc, block);
    order.insert(target, [block.id]);
  }, SITE_LOCAL_ORIGIN);
}

/** Adds an empty block of `type` at `index`; null when the page or the type is full. */
export function addSiteBlock(ydoc: Y.Doc, type: SiteBlockType, index: number): string | null {
  if (!roomFor(decodeSiteDraft(ydoc), type)) return null;
  const block = defaultSiteBlock(type, newId);
  insertBlock(ydoc, block, index);
  return block.id;
}

/** A copy right after the original, with new ids for the block and each card, and its texts. */
export function duplicateSiteBlock(ydoc: Y.Doc, id: string): string | null {
  const draft = decodeSiteDraft(ydoc);
  const index = draft.blocks.findIndex((block) => block.id === id);
  const original = draft.blocks[index];
  if (!original || !roomFor(draft, original.type)) return null;
  const copy = {
    ...structuredClone(original),
    id: newId(),
    ...('items' in original
      ? { items: original.items.map((item) => ({ ...structuredClone(item), id: newId() })) }
      : {}),
  } as SiteBlock;
  insertBlock(ydoc, copy, index + 1);
  return copy.id;
}

// A removed block leaves empty `rt:` fragment stubs behind: Yjs cannot delete a top-level type,
// so only their content is cleared; decode never reaches them.
export function removeSiteBlock(ydoc: Y.Doc, id: string): boolean {
  const live = liveBlock(ydoc, id);
  if (!live || siteBlockSpec(live.type).pinned) return false;
  ydoc.transact(() => {
    clearFragment(getBlockFragment(ydoc, id));
    for (const itemId of itemMaps(live.map)?.items.keys() ?? []) {
      clearFragment(getItemFragment(ydoc, itemId));
    }
    blocksMap(ydoc).delete(id);
    const order = blockOrder(ydoc);
    for (let index = order.length - 1; index >= 0; index -= 1) {
      if (order.get(index) === id) order.delete(index, 1);
    }
  }, SITE_LOCAL_ORIGIN);
  return true;
}

/**
 * Moves `id` to `target` in page coordinates. `live` is the list as decoded (deduped, orphans
 * appended, dangling ids gone); the order array is rewritten from it, so a move also heals what
 * concurrent edits left behind. A concurrent add elsewhere survives, a concurrent remove leaves a
 * dangling id that decode skips.
 */
function moveInOrder(
  ydoc: Y.Doc,
  order: Y.Array<string>,
  live: string[],
  id: string,
  target: number
): boolean {
  if (!live.includes(id)) return false;
  const next = live.filter((entry) => entry !== id);
  next.splice(target, 0, id);
  const current = order.toArray();
  if (current.length === next.length && current.every((entry, i) => entry === next[i])) {
    return true;
  }
  ydoc.transact(() => {
    order.delete(0, order.length);
    order.insert(0, next);
  }, SITE_LOCAL_ORIGIN);
  return true;
}

export function moveSiteBlock(ydoc: Y.Doc, id: string, toIndex: number): boolean {
  const live = liveBlock(ydoc, id);
  if (!live || siteBlockSpec(live.type).pinned) return false;
  const ids = decodeSiteDraft(ydoc).blocks.map((block) => block.id);
  return moveInOrder(
    ydoc,
    blockOrder(ydoc),
    ids,
    id,
    Math.max(1, Math.min(toIndex, ids.length - 1))
  );
}

export function setSiteBlockHidden(ydoc: Y.Doc, id: string, hidden: boolean): boolean {
  const live = liveBlock(ydoc, id);
  if (!live || siteBlockSpec(live.type).pinned) return false;
  ydoc.transact(() => {
    if (hidden) live.map.set('hidden', true);
    else live.map.delete('hidden');
  }, SITE_LOCAL_ORIGIN);
  return true;
}

/** Sets plain fields of a block of `type`; false when the block is missing or of another type. */
export function setSiteBlockField<T extends SiteBlockType>(
  ydoc: Y.Doc,
  id: string,
  type: T,
  patch: SiteBlockPatch<T>
): boolean {
  const live = liveBlock(ydoc, id);
  if (!live || live.type !== type) return false;
  const keys = BLOCK_SCALARS[type].filter((key) => key in patch);
  ydoc.transact(() => writeScalars(live.map, patch, keys), SITE_LOCAL_ORIGIN);
  return true;
}

function liveList(ydoc: Y.Doc, blockId: string) {
  const live = liveBlock(ydoc, blockId);
  if (!live || !isListType(live.type)) return null;
  const lists = itemMaps(live.map);
  return lists ? { ...lists, type: live.type } : null;
}

/** The card ids of a block as decoded: deduped, without dangling ids, capped at the limit. */
function liveItemIds(ydoc: Y.Doc, blockId: string): string[] {
  const block = decodeSiteDraft(ydoc).blocks.find((entry) => entry.id === blockId);
  return block && 'items' in block ? block.items.map((item) => item.id) : [];
}

/** Adds an empty card at `index` (default: the end); null at the type's card limit. */
export function addSiteItem(ydoc: Y.Doc, blockId: string, index?: number): string | null {
  const list = liveList(ydoc, blockId);
  if (!list || liveItemIds(ydoc, blockId).length >= siteBlockSpec(list.type).itemMax) return null;
  const id = newId();
  ydoc.transact(() => {
    const item = new Y.Map<unknown>();
    for (const [key, value] of Object.entries(EMPTY_ITEM[list.type])) item.set(key, value);
    list.items.set(id, item);
    const target = Math.max(0, Math.min(index ?? list.order.length, list.order.length));
    list.order.insert(target, [id]);
  }, SITE_LOCAL_ORIGIN);
  return id;
}

export function updateSiteItem(
  ydoc: Y.Doc,
  blockId: string,
  itemId: string,
  patch: SiteItemPatch
): boolean {
  const list = liveList(ydoc, blockId);
  const item = list?.items.get(itemId);
  if (!list || !(item instanceof Y.Map)) return false;
  const keys = ITEM_SCALARS[list.type].filter((key) => key in patch);
  ydoc.transact(() => writeScalars(item, patch, keys), SITE_LOCAL_ORIGIN);
  return true;
}

export function removeSiteItem(ydoc: Y.Doc, blockId: string, itemId: string): boolean {
  const list = liveList(ydoc, blockId);
  if (!list || !list.items.has(itemId)) return false;
  ydoc.transact(() => {
    list.items.delete(itemId);
    clearFragment(getItemFragment(ydoc, itemId));
    for (let index = list.order.length - 1; index >= 0; index -= 1) {
      if (list.order.get(index) === itemId) list.order.delete(index, 1);
    }
  }, SITE_LOCAL_ORIGIN);
  return true;
}

export function moveSiteItem(
  ydoc: Y.Doc,
  blockId: string,
  itemId: string,
  toIndex: number
): boolean {
  const list = liveList(ydoc, blockId);
  if (!list) return false;
  const ids = liveItemIds(ydoc, blockId);
  return moveInOrder(ydoc, list.order, ids, itemId, Math.max(0, Math.min(toIndex, ids.length - 1)));
}
