import {
  layoutRichTextBlock,
  sharepicColorsFor,
  themaOfColor,
  type SharepicColor,
  type SharepicCreatorLocale,
} from '@gruenerator/contracts';

import { runMeasurer } from '../utils/textUtils';

import { colorOf } from './carouselChrome';

import type { ComposedSlide } from './composeSharepic';
import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';

/** The element collections a block can bring onto a page; all of them the freeform page holds. */
export const BLOCK_COLLECTIONS = [
  'additionalTexts',
  'shapeInstances',
  'assetInstances',
  'chartInstances',
  'userImageInstances',
  'pillBadgeInstances',
  'circleBadgeInstances',
] as const;
type BlockCollection = (typeof BLOCK_COLLECTIONS)[number];

export type LiftedBlock = Pick<ComposedSlide, BlockCollection | 'selectedIcons' | 'iconStates'> & {
  /** The block's ids bottom to top, as the composer layered them. */
  layerOrder: string[];
  /** Canvas px the block covers. */
  bounds: { x: number; y: number; width: number; height: number };
};

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const textHeight = (t: AdditionalText) => {
  const measure = runMeasurer(t.fontSize, t.fontFamily, t.fontStyle ?? 'normal', 0, t.accent);
  return layoutRichTextBlock(t.text, t.width, measure).length * t.fontSize * (t.lineHeight ?? 1.2);
};

/** Editor icons are drawn 120 px across at scale 1, centred on their x/y. */
const ICON_SIZE = 120;

/**
 * The elements the composer made for `items` of a composed slide (ids
 * `sc-<i>-…`, a chart's `chart-sc-<i>-…`), cut loose from the slide: every id
 * re-prefixed with `blk-<token>-`, so a block inserted twice never collides
 * and the sharepic lift reads it as an element of the person's own, not as
 * part of the page's composed spec. Only the prefix changes — a card finds
 * its text by `${text.id}-card`.
 */
export function liftBlock(
  slide: ComposedSlide,
  items: readonly number[],
  token: string
): LiftedBlock {
  const prefixes = items.flatMap((i) => [`sc-${i}-`, `chart-sc-${i}-`]);
  const owned = (id: string) => prefixes.some((p) => id.startsWith(p));
  const rename = (id: string) =>
    id.replace(
      /^(chart-)?sc-\d+-/,
      (_, chart: string | undefined) => `${chart ?? ''}blk-${token}-`
    );

  const pick = <T extends { id: string }>(list: readonly T[]): T[] =>
    list.filter((e) => owned(e.id)).map((e) => structuredClone({ ...e, id: rename(e.id) }));

  const selectedIcons = slide.selectedIcons.filter(owned);
  const iconStates: Record<string, IconState> = Object.fromEntries(
    selectedIcons.map((id) => [rename(id), structuredClone(slide.iconStates[id]!)])
  );

  const block = {
    additionalTexts: pick(slide.additionalTexts),
    shapeInstances: pick(slide.shapeInstances),
    assetInstances: pick(slide.assetInstances),
    chartInstances: pick(slide.chartInstances),
    userImageInstances: pick(slide.userImageInstances),
    pillBadgeInstances: pick(slide.pillBadgeInstances),
    circleBadgeInstances: pick(slide.circleBadgeInstances),
    selectedIcons: selectedIcons.map(rename),
    iconStates,
    layerOrder: slide.layerOrder.filter(owned).map(rename),
  };
  return { ...block, bounds: boundsOf(block) };
}

function boundsOf(block: Omit<LiftedBlock, 'bounds'>): LiftedBlock['bounds'] {
  const boxes: Box[] = [
    ...block.additionalTexts.map((t) => ({
      x0: t.x,
      y0: t.y,
      x1: t.x + t.width,
      y1: t.y + textHeight(t),
    })),
    ...block.shapeInstances.map((s) => {
      const w = (s.width * s.scaleX) / 2;
      const h = (s.height * s.scaleY) / 2;
      return { x0: s.x - w, y0: s.y - h, x1: s.x + w, y1: s.y + h };
    }),
    ...[...block.chartInstances, ...block.userImageInstances].map((c) => ({
      x0: c.x,
      y0: c.y,
      x1: c.x + c.width,
      y1: c.y + c.height,
    })),
    ...Object.values(block.iconStates).map((i) => {
      const r = (ICON_SIZE * i.scale) / 2;
      return { x0: i.x - r, y0: i.y - r, x1: i.x + r, y1: i.y + r };
    }),
    // Emoji and badges sit inside the card or beside a text; their point is enough.
    ...[...block.assetInstances, ...block.pillBadgeInstances, ...block.circleBadgeInstances].map(
      (a) => ({ x0: a.x, y0: a.y, x1: a.x, y1: a.y })
    ),
  ];
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x0 = Math.min(...boxes.map((b) => b.x0));
  const y0 = Math.min(...boxes.map((b) => b.y0));
  const x1 = Math.max(...boxes.map((b) => b.x1));
  const y1 = Math.max(...boxes.map((b) => b.y1));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The block moved by dx/dy: every element keeps its anchor, so one shift fits all. */
export function translateBlock(block: LiftedBlock, dx: number, dy: number): LiftedBlock {
  const move = <T extends { x: number; y: number }>(list: readonly T[]): T[] =>
    list.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));
  return {
    ...block,
    additionalTexts: move(block.additionalTexts),
    shapeInstances: move(block.shapeInstances),
    assetInstances: move(block.assetInstances),
    chartInstances: move(block.chartInstances),
    userImageInstances: move(block.userImageInstances),
    pillBadgeInstances: move(block.pillBadgeInstances),
    circleBadgeInstances: move(block.circleBadgeInstances),
    iconStates: Object.fromEntries(
      Object.entries(block.iconStates).map(([id, s]) => [id, { ...s, x: s.x + dx, y: s.y + dy }])
    ),
    bounds: { ...block.bounds, x: block.bounds.x + dx, y: block.bounds.y + dy },
  };
}

/** The composer's margin on a 1080 px wide slide, as a share of the width. */
const MARGIN = 70 / 1080;

/**
 * The block with its centre on `center` (canvas px), pulled back inside the
 * composer's margin where it would stick out; where the margin leaves too
 * little room, inside the canvas, and a block wider than the page keeps its left edge.
 */
export function placeBlock(
  block: LiftedBlock,
  center: { x: number; y: number },
  canvas: { width: number; height: number }
): LiftedBlock {
  const { x, y, width, height } = block.bounds;
  const margin = Math.round(canvas.width * MARGIN);
  const clamp = (v: number, size: number, max: number) => {
    if (size >= max) return 0;
    const edge = size + 2 * margin <= max ? margin : 0;
    return Math.min(Math.max(v, edge), max - size - edge);
  };
  const left = clamp(center.x - width / 2, width, canvas.width);
  const top = clamp(center.y - height / 2, height, canvas.height);
  return translateBlock(block, left - x, top - y);
}

/** Every element id of the block, for the selection after the insert. */
export const blockElementIds = (block: LiftedBlock): string[] => [
  ...new Set([
    ...block.layerOrder,
    ...BLOCK_COLLECTIONS.flatMap((key) => block[key].map((e) => e.id)),
    ...block.selectedIcons,
  ]),
];

/** The country's dark ground: text on a photo is set light, as the composer does there. */
const PHOTO_GROUND: Record<SharepicCreatorLocale, SharepicColor> = {
  'de-DE': 'tanne',
  'de-AT': 'dunkelgruen',
};

/**
 * The ground to compose a block on for a page: its background colour when
 * that is one of the country's brand colours or a themed ground, so text and card contrast with
 * what is really behind them; on a photo the country's dark ground (light
 * text); on any other colour the ground the block's preview shows.
 */
export function blockGround(
  locale: SharepicCreatorLocale,
  page: { backgroundMode?: unknown; backgroundColor?: unknown },
  fallback: SharepicColor
): SharepicColor {
  if (page.backgroundMode === 'image') return PHOTO_GROUND[locale];
  const color = colorOf(page.backgroundColor);
  return color && sharepicColorsFor(locale, themaOfColor(color)).includes(color) ? color : fallback;
}
