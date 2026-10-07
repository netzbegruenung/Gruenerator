/**
 * Recovers the hand edits on a creator page by comparing it with what the
 * composer wrote (the baseline). Edited texts the composer only reformatted go
 * back into the base spec; everything else the spec cannot say — a moved or
 * restyled element, a rewritten opaque text, a deleted element — becomes an
 * override keyed by item type and rank, so it survives a recompose that
 * renumbers the items. Elements the composer never wrote stay as they are.
 *
 * Pure. The provenance is rebuilt from the baseline (ids, kinds and texts),
 * so nothing beyond the stored source is needed, and no text is measured.
 */
import {
  type SharepicBaseline,
  type SharepicFingerprint,
  type SharepicItem,
  type SharepicSlide,
  type SharepicSpec,
  sharepicSlideSchema,
} from '@gruenerator/contracts';

import { type ComposedSlide } from './composeSharepic';
import { invertLiftedText, slideProvenance, type SharepicProvenance } from './sharepicProvenance';

type ElementKind = SharepicFingerprint['kind'];
type FingerprintProp = Exclude<keyof SharepicFingerprint, 'kind'>;
export type SharepicStyleProp = Exclude<FingerprintProp, 'text'>;
export type SharepicStyleProps = Partial<Pick<SharepicFingerprint, SharepicStyleProp>>;

/** An element by what it shows, not by index: the `nth` item of `itemType`, and the part of it. */
export interface SharepicElementKey {
  /** null: chrome or a plane; `role` is then the element id itself. */
  itemType: SharepicItem['type'] | null;
  nth: number;
  /** The id with the item's `sc-${index}-${type}` replaced by `*`. */
  role: string;
}

export type SharepicOverride =
  /** The page's own values of the properties that differ from the baseline. */
  | { kind: 'style'; key: SharepicElementKey; props: SharepicStyleProps }
  | { kind: 'text'; key: SharepicElementKey; text: string }
  | { kind: 'deleted'; key: SharepicElementKey }
  | { kind: 'background'; offset?: { x: number; y: number }; scale?: number };

const INSTANCE_COLLECTIONS = [
  ['additionalTexts', 'text'],
  ['pillBadgeInstances', 'pill'],
  ['circleBadgeInstances', 'circle'],
  ['shapeInstances', 'shape'],
  ['assetInstances', 'asset'],
  ['chartInstances', 'chart'],
  ['userImageInstances', 'userImage'],
  // Never composed; only ever foreign.
  ['illustrationInstances', null],
  ['frameInstances', null],
  ['balkenInstances', null],
] as const;
export type SharepicPageCollection =
  | (typeof INSTANCE_COLLECTIONS)[number][0]
  /** `selectedIcons` + `iconStates`; the element is the icon's state. */
  | 'icons';

/** An element the composer did not write, kept verbatim. */
export interface SharepicForeignElement {
  collection: SharepicPageCollection;
  id: string;
  element: Record<string, unknown>;
  /** The composer's element directly below it in the layer order; null: at the bottom. */
  anchor: SharepicElementKey | null;
}

export interface LiftedSharepicPage {
  /** The one-slide base spec with the liftable text edits written in. */
  slide: SharepicSpec;
  overrides: SharepicOverride[];
  foreign: SharepicForeignElement[];
  /** Hand edits neither the spec nor an override carries (`background`: colour or photo swapped). */
  unliftable: string[];
}

/** Per kind: fingerprint property → element field. */
export const SHAREPIC_FINGERPRINT_FIELDS: Record<
  ElementKind,
  Partial<Record<FingerprintProp, string>>
> = {
  text: {
    x: 'x',
    y: 'y',
    width: 'width',
    fontSize: 'fontSize',
    fill: 'fill',
    rotation: 'rotation',
    scale: 'scale',
    opacity: 'opacity',
    text: 'text',
  },
  pill: {
    x: 'x',
    y: 'y',
    fontSize: 'fontSize',
    fill: 'backgroundColor',
    rotation: 'rotation',
    scale: 'scale',
    opacity: 'opacity',
    text: 'text',
  },
  circle: {
    x: 'x',
    y: 'y',
    fill: 'backgroundColor',
    rotation: 'rotation',
    scale: 'scale',
    opacity: 'opacity',
  },
  shape: {
    x: 'x',
    y: 'y',
    width: 'width',
    height: 'height',
    fill: 'fill',
    rotation: 'rotation',
    scale: 'scaleX',
    scaleY: 'scaleY',
    opacity: 'opacity',
  },
  asset: { x: 'x', y: 'y', rotation: 'rotation', scale: 'scale', opacity: 'opacity' },
  chart: {
    x: 'x',
    y: 'y',
    width: 'width',
    height: 'height',
    rotation: 'rotation',
    scale: 'scale',
    opacity: 'opacity',
  },
  userImage: {
    x: 'x',
    y: 'y',
    width: 'width',
    height: 'height',
    rotation: 'rotation',
    scale: 'scale',
    opacity: 'opacity',
  },
  icon: {
    x: 'x',
    y: 'y',
    fill: 'color',
    rotation: 'rotation',
    scale: 'scale',
    opacity: 'opacity',
  },
};

/** What an absent property renders as, so a page that fills in defaults reads unchanged. */
const DEFAULTS: Partial<Record<SharepicStyleProp, number>> = {
  rotation: 0,
  scale: 1,
  scaleY: 1,
  opacity: 1,
};

interface PageElement {
  collection: SharepicPageCollection;
  kind: ElementKind | null;
  element: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const records = (value: unknown) => (Array.isArray(value) ? value.filter(isRecord) : []);

/** Every element of a page state, by id; read tolerantly, as it comes out of Yjs. */
function pageElements(state: Record<string, unknown>): Map<string, PageElement> {
  const out = new Map<string, PageElement>();
  for (const [collection, kind] of INSTANCE_COLLECTIONS) {
    for (const element of records(state[collection])) {
      if (typeof element.id === 'string') out.set(element.id, { collection, kind, element });
    }
  }
  const iconStates = isRecord(state.iconStates) ? state.iconStates : {};
  const icons = Array.isArray(state.selectedIcons) ? state.selectedIcons : [];
  for (const id of icons) {
    if (typeof id !== 'string') continue;
    const iconState = iconStates[id];
    out.set(id, {
      collection: 'icons',
      kind: 'icon',
      element: isRecord(iconState) ? iconState : {},
    });
  }
  return out;
}

function readFingerprint(kind: ElementKind, element: Record<string, unknown>): SharepicFingerprint {
  const out: SharepicFingerprint = { kind, x: 0, y: 0 };
  for (const [prop, field] of Object.entries(SHAREPIC_FINGERPRINT_FIELDS[kind])) {
    const value = element[field];
    if (typeof value === 'number' || typeof value === 'string') {
      (out as Record<string, unknown>)[prop] = value;
    }
  }
  return out;
}

/** The baseline of a composed page: what the composer wrote for each element and the background. */
export function fingerprint(slide: ComposedSlide): SharepicBaseline {
  const elements: Record<string, SharepicFingerprint> = {};
  for (const [id, { kind, element }] of pageElements(slide as unknown as Record<string, unknown>)) {
    if (kind) elements[id] = readFingerprint(kind, element);
  }
  return {
    elements,
    background: {
      color: slide.backgroundColor,
      imageSrc: slide.currentImageSrc ?? null,
      offset: slide.imageOffset ?? null,
      scale: slide.imageScale ?? null,
    },
  };
}

/** The composer's provenance of a page, rebuilt from its baseline. */
export function baselineProvenance(
  slide: SharepicSlide,
  baseline: SharepicBaseline
): Record<string, SharepicProvenance> {
  const entries = Object.entries(baseline.elements);
  const ofKind = (kind: ElementKind) =>
    entries.filter(([, f]) => f.kind === kind).map(([id, f]) => ({ id, text: f.text ?? '' }));
  return slideProvenance(slide, {
    additionalTexts: ofKind('text'),
    pillBadgeInstances: ofKind('pill'),
    circleBadgeInstances: ofKind('circle'),
    shapeInstances: ofKind('shape'),
    assetInstances: ofKind('asset'),
    chartInstances: ofKind('chart'),
    userImageInstances: ofKind('userImage'),
    selectedIcons: ofKind('icon').map((e) => e.id),
    iconStates: {},
    layerOrder: [],
  });
}

const itemPrefix = (index: number, item: SharepicItem) => `sc-${index}-${item.type}`;

export function elementKey(id: string, slide: SharepicSlide): SharepicElementKey {
  const bare = id.startsWith('chart-') ? id.slice('chart-'.length) : id;
  const index = slide.items.findIndex((item, i) => {
    const prefix = itemPrefix(i, item);
    return bare === prefix || bare.startsWith(`${prefix}-`);
  });
  if (index < 0) return { itemType: null, nth: 0, role: id };
  const item = slide.items[index]!;
  const nth = slide.items.slice(0, index).filter((other) => other.type === item.type).length;
  return { itemType: item.type, nth, role: id.replace(itemPrefix(index, item), '*') };
}

/** The id a key names on `slide`; null when the slide has no such item. */
export function elementIdForKey(key: SharepicElementKey, slide: SharepicSlide): string | null {
  if (key.itemType === null) return key.role;
  let seen = 0;
  const index = slide.items.findIndex((item) => item.type === key.itemType && seen++ === key.nth);
  return index < 0 ? null : key.role.replace('*', itemPrefix(index, slide.items[index]!));
}

/** `target` with `value` at `path`, copied along the way; null when the path does not exist. */
function setAt(target: unknown, path: string[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [key, ...rest] = path as [string, ...string[]];
  if (Array.isArray(target)) {
    const list = target as unknown[];
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) return null;
    const next = setAt(list[index], rest, value);
    return next === null ? null : list.map((v, i) => (i === index ? next : v));
  }
  if (!isRecord(target) || !(key in target)) return null;
  const next = setAt(target[key], rest, value);
  return next === null ? null : { ...target, [key]: next };
}

const valueAt = (source: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (value, key) =>
      isRecord(value) || Array.isArray(value) ? (value as Record<string, unknown>)[key] : null,
    source
  );

const breaks = (text: string) => text.split('\n').length - 1;

/** The slide with an edited text written into its field; null when it does not go back. */
function liftText(
  slide: SharepicSlide,
  prov: SharepicProvenance,
  text: string,
  before: string
): SharepicSlide | null {
  // A new break in a one-line field would be a line the composer does not know.
  if ((prov.lift === 'verbatim' || prov.lift === 'prefix') && breaks(text) > breaks(before)) {
    return null;
  }
  const lifted = invertLiftedText(prov.lift, text);
  if (lifted === null || !prov.field) return null;
  const path = [
    ...(prov.kind === 'item' ? ['items', String(prov.item)] : []),
    ...prov.field.split('.'),
  ];
  let value: unknown = lifted;
  if (prov.range) {
    // Only line for line: more or fewer lines would shift the accent indices.
    const current = valueAt(slide, path);
    const { start, end } = prov.range;
    if (!Array.isArray(current) || !Array.isArray(lifted) || lifted.length !== end - start) {
      return null;
    }
    value = [...current.slice(0, start), ...lifted, ...current.slice(end)];
  }
  const next = setAt(slide, path, value);
  // The slide alone: a carousel page's one-slide spec breaks the deck rules (seitenzahl, weiter).
  const parsed = next === null ? null : sharepicSlideSchema.safeParse(next);
  if (!parsed?.success) return null;
  // The field as the schema reads it (trimmed), not as typed.
  return setAt(slide, path, valueAt(parsed.data, path)) as SharepicSlide;
}

const styleValue = (fp: SharepicFingerprint, prop: SharepicStyleProp) => fp[prop] ?? DEFAULTS[prop];

export function liftPage(
  pageState: Record<string, unknown>,
  source: { slide: SharepicSpec; baseline: SharepicBaseline }
): LiftedSharepicPage {
  const { baseline } = source;
  let slide = source.slide.slides[0]!;
  const keyOf = (id: string) => elementKey(id, source.slide.slides[0]!);
  const provenance = baselineProvenance(slide, baseline);
  const page = pageElements(pageState);
  const overrides: SharepicOverride[] = [];
  const unliftable: string[] = [];

  for (const [id, base] of Object.entries(baseline.elements)) {
    const now = page.get(id);
    if (!now) {
      overrides.push({ kind: 'deleted', key: keyOf(id) });
      continue;
    }
    const current = readFingerprint(base.kind, now.element);
    const props: SharepicStyleProps = {};
    for (const prop of Object.keys(SHAREPIC_FINGERPRINT_FIELDS[base.kind]) as FingerprintProp[]) {
      if (prop === 'text') continue;
      const value = styleValue(current, prop);
      if (value !== styleValue(base, prop) && value !== undefined) {
        (props as Record<string, unknown>)[prop] = value;
      }
    }
    if (Object.keys(props).length) overrides.push({ kind: 'style', key: keyOf(id), props });

    if (current.text === undefined || current.text === base.text) continue;
    const prov = provenance[id];
    const next =
      prov && prov.lift !== 'opaque' ? liftText(slide, prov, current.text, base.text ?? '') : null;
    if (next) {
      slide = next;
    } else {
      overrides.push({ kind: 'text', key: keyOf(id), text: current.text });
    }
  }

  const bg = baseline.background;
  const offset = isRecord(pageState.imageOffset) ? pageState.imageOffset : null;
  const scale = typeof pageState.imageScale === 'number' ? pageState.imageScale : null;
  const baseOffset = bg.offset ?? { x: 0, y: 0 };
  const background: Extract<SharepicOverride, { kind: 'background' }> = { kind: 'background' };
  if (offset && typeof offset.x === 'number' && typeof offset.y === 'number') {
    if (offset.x !== baseOffset.x || offset.y !== baseOffset.y) {
      background.offset = { x: offset.x, y: offset.y };
    }
  }
  if (scale !== null && scale !== (bg.scale ?? 1)) background.scale = scale;
  if (background.offset || background.scale !== undefined) overrides.push(background);
  const imageSrc = typeof pageState.currentImageSrc === 'string' ? pageState.currentImageSrc : null;
  if (pageState.backgroundColor !== bg.color || imageSrc !== bg.imageSrc) {
    unliftable.push('background');
  }

  const order = Array.isArray(pageState.layerOrder)
    ? pageState.layerOrder.filter((id): id is string => typeof id === 'string')
    : [];
  const kept = (id: string) => Object.hasOwn(baseline.elements, id) && page.has(id);
  const anchorBelow = (id: string) => {
    const at = order.indexOf(id);
    // Not in the layer order: it renders above everything that is.
    const below = at < 0 ? order : order.slice(0, at);
    const anchor = [...below].reverse().find(kept);
    return anchor === undefined ? null : keyOf(anchor);
  };
  const foreign: SharepicForeignElement[] = [];
  for (const [id, { collection, element }] of page) {
    if (!Object.hasOwn(baseline.elements, id)) {
      foreign.push({ collection, id, element, anchor: anchorBelow(id) });
    }
  }

  return { slide: { ...source.slide, slides: [slide] }, overrides, foreign, unliftable };
}
