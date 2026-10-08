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

import { DEFAULT_FORMAT_ID } from '../formats';

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
  /** Photo placement, and a hand-swapped colour or photo (`imageSrc` null: photo removed). */
  | {
      kind: 'background';
      offset?: { x: number; y: number };
      scale?: number;
      color?: string;
      imageSrc?: string | null;
    };

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
  // `unwrap` needs no break guard: its row count is the guard.
  const lifted = invertLiftedText(prov.lift, text, prov.wraps ?? null);
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
  if (typeof pageState.backgroundColor === 'string' && pageState.backgroundColor !== bg.color) {
    background.color = pageState.backgroundColor;
  }
  const imageSrc = typeof pageState.currentImageSrc === 'string' ? pageState.currentImageSrc : null;
  if (imageSrc !== bg.imageSrc) background.imageSrc = imageSrc;
  if (Object.keys(background).length > 1) overrides.push(background);

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
  // Bottom to top, so a recompose can stack the ones on one anchor back in order.
  const zOf = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const foreign: SharepicForeignElement[] = [...page]
    .filter(([id]) => !Object.hasOwn(baseline.elements, id))
    .sort(([a], [b]) => zOf(a) - zOf(b))
    .map(([id, { collection, element }]) => ({ collection, id, element, anchor: anchorBelow(id) }));

  return { slide: { ...source.slide, slides: [slide] }, overrides, foreign };
}

/** A composed page with hand edits put back; foreign elements may fill collections the composer leaves out. */
export type RecomposedSlide = ComposedSlide &
  Partial<
    Record<
      'illustrationInstances' | 'frameInstances' | 'balkenInstances',
      Record<string, unknown>[]
    >
  >;

export interface RecomposedSharepicPage {
  state: RecomposedSlide;
  /** The fresh compose before the overrides: the next lift reads them as edits again. */
  baseline: SharepicBaseline;
  /** Overrides, or the part of one, that no longer fit the fresh compose. */
  droppedOverrides: SharepicOverride[];
}

const POSITION_PROPS = ['x', 'y'] as const;
/** The texts line boxes split: their numbered ids mean a line when boxed, a segment otherwise. */
const BOXABLE: ReadonlySet<string> = new Set(['headline', 'absatz', 'text']);
/** Above this share of changed characters, a hand position belongs to a different text. */
const TEXT_CHANGE_LIMIT = 0.5;

const itemForKey = (key: SharepicElementKey, slide: SharepicSlide) =>
  key.itemType === null
    ? null
    : (slide.items.filter((i) => i.type === key.itemType)[key.nth] ?? null);

/**
 * Every string under `value` with its dotted path; keys in `skip` are left
 * out. Shared with the web's spec edit, so both read a slide's texts alike.
 */
export function textLeaves(
  value: unknown,
  skip: readonly string[] = ['type'],
  path = ''
): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  const at = (k: string | number) => (path ? `${path}.${k}` : String(k));
  if (Array.isArray(value)) return value.flatMap((v, i) => textLeaves(v, skip, at(i)));
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([k, v]) =>
      skip.includes(k) ? [] : textLeaves(v, skip, at(k))
    );
  }
  return [];
}

const strings = (value: unknown): string[] => textLeaves(value).map(([, text]) => text);

export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j]! + 1,
        next[j - 1]! + 1,
        row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    row = next;
  }
  return row[b.length]!;
}

/** Share of the item's text that changed: edit distance over the longer text; 0 for chrome. */
function textChange(key: SharepicElementKey, before: SharepicSlide, after: SharepicSlide): number {
  const a = strings(itemForKey(key, before)).join('\n');
  const b = strings(itemForKey(key, after)).join('\n');
  return a === b ? 0 : editDistance(a, b) / Math.max(a.length, b.length);
}

const textSide = (slide: SharepicSlide) =>
  slide.background.kind === 'foto' ? slide.background.textSeite : null;
const formatOf = (spec: SharepicSpec) => spec.format ?? DEFAULT_FORMAT_ID;
const photo = (slide: SharepicSlide) =>
  'filename' in slide.background ? slide.background.filename : null;

/**
 * The fresh compose of a page with its hand edits put back. `previous` and
 * `fresh` are the one-slide compose inputs (tweaks applied) of the page the
 * overrides were lifted from and of `freshSlide`. Hand positions go when the
 * layout moves (format, position, text side, line boxes) or their item's
 * text changed by more than half; a hand text goes once the spec rewrote its
 * item. With `previousBaseline` (what the composer wrote for `previous`), any
 * other hand style goes where the spec change moved the composer's own value
 * of that property — the requested change wins. Pure.
 */
export function recomposePage(
  freshSlide: ComposedSlide,
  overrides: SharepicOverride[],
  foreign: SharepicForeignElement[],
  previous: SharepicSpec,
  fresh: SharepicSpec,
  previousBaseline: SharepicBaseline | null = null
): RecomposedSharepicPage {
  const baseline = fingerprint(freshSlide);
  const state = structuredClone(freshSlide) as RecomposedSlide;
  const before = previous.slides[0]!;
  const after = fresh.slides[0]!;
  const boxesToggled = !!before.zeilenboxen !== !!after.zeilenboxen;
  const formatChanged = formatOf(previous) !== formatOf(fresh);
  const layoutMoved =
    boxesToggled ||
    formatChanged ||
    before.position !== after.position ||
    textSide(before) !== textSide(after);
  const elements = pageElements(state as unknown as Record<string, unknown>);
  const deleted = new Set<string>();
  const dropped: SharepicOverride[] = [];

  for (const override of overrides) {
    if (override.kind === 'background') {
      // Placement follows the photo; a hand colour or photo only an unchanged background.
      const placed = photo(before) === photo(after) && !formatChanged;
      const sameBackground =
        !formatChanged && JSON.stringify(before.background) === JSON.stringify(after.background);
      const { offset, scale, color, imageSrc } = override;
      const lost: Extract<SharepicOverride, { kind: 'background' }> = { kind: 'background' };
      if (offset) {
        if (placed) state.imageOffset = offset;
        else lost.offset = offset;
      }
      if (scale !== undefined) {
        if (placed) state.imageScale = scale;
        else lost.scale = scale;
      }
      if (color !== undefined) {
        if (sameBackground) state.backgroundColor = color;
        else lost.color = color;
      }
      if (imageSrc !== undefined) {
        if (!sameBackground) lost.imageSrc = imageSrc;
        else if (imageSrc === null) delete state.currentImageSrc;
        else state.currentImageSrc = imageSrc;
      }
      if (Object.keys(lost).length > 1) dropped.push(lost);
      continue;
    }
    const id = elementIdForKey(override.key, after);
    const target = id === null ? null : elements.get(id);
    const segment =
      override.key.itemType !== null &&
      BOXABLE.has(override.key.itemType) &&
      /^\*-\d+$/.test(override.key.role);
    // The element is gone from the fresh compose as well: the deletion holds.
    if (override.kind === 'deleted' && (!id || !target)) continue;
    if (!id || !target?.kind || (segment && layoutMoved)) {
      dropped.push(override);
      continue;
    }
    if (override.kind === 'deleted') {
      deleted.add(id);
    } else if (override.kind === 'text') {
      // The hand text was written over the old spec text, not the new one.
      if (textChange(override.key, before, after) > 0) dropped.push(override);
      else target.element.text = override.text;
    } else {
      const props: SharepicStyleProps = { ...override.props };
      const lost: SharepicStyleProps = {};
      if (layoutMoved || textChange(override.key, before, after) > TEXT_CHANGE_LIMIT) {
        for (const prop of POSITION_PROPS) {
          if (props[prop] === undefined) continue;
          lost[prop] = props[prop];
          delete props[prop];
        }
      }
      // Positions follow the layout rule above: a reflow moves them without a request.
      const oldId = previousBaseline ? elementIdForKey(override.key, before) : null;
      const was = oldId === null ? null : (previousBaseline?.elements[oldId] ?? null);
      const now = baseline.elements[id];
      if (was && now) {
        for (const prop of Object.keys(props) as SharepicStyleProp[]) {
          if (prop === 'x' || prop === 'y' || styleValue(was, prop) === styleValue(now, prop)) {
            continue;
          }
          (lost as Record<string, unknown>)[prop] = props[prop];
          delete props[prop];
        }
      }
      if (Object.keys(lost).length) dropped.push({ ...override, props: lost });
      const fields = SHAREPIC_FINGERPRINT_FIELDS[target.kind];
      for (const [prop, value] of Object.entries(props)) {
        const field = fields[prop as SharepicStyleProp];
        if (field) target.element[field] = value;
      }
    }
  }

  const slide = state as unknown as Record<string, unknown>;
  if (deleted.size) {
    for (const [collection] of INSTANCE_COLLECTIONS) {
      if (Array.isArray(slide[collection])) {
        slide[collection] = records(slide[collection]).filter((e) => !deleted.has(e.id as string));
      }
    }
    state.selectedIcons = state.selectedIcons.filter((id) => !deleted.has(id));
    for (const id of deleted) delete state.iconStates[id];
    state.layerOrder = state.layerOrder.filter((id) => !deleted.has(id));
  }

  // Bottom to top: each goes directly above its anchor and the foreign ones already on it.
  const top = new Map<string | null, string>();
  for (const { collection, id, element, anchor } of foreign) {
    if (collection === 'icons') {
      state.selectedIcons.push(id);
      state.iconStates[id] = structuredClone(
        element
      ) as unknown as ComposedSlide['iconStates'][string];
    } else {
      slide[collection] = [...records(slide[collection]), structuredClone(element)];
    }
    const order = state.layerOrder;
    const anchorId = anchor === null ? null : elementIdForKey(anchor, after);
    if (anchor !== null && (anchorId === null || !order.includes(anchorId))) {
      order.push(id);
      continue;
    }
    const below = top.get(anchorId) ?? anchorId;
    order.splice(below === null ? 0 : order.indexOf(below) + 1, 0, id);
    top.set(anchorId, id);
  }

  return { state, baseline, droppedOverrides: dropped };
}
