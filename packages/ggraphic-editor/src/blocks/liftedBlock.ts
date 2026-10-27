// SPDX-License-Identifier: MPL-2.0
/**
 * A block: a group of canvas items already built for a page (texts, shapes,
 * assets, charts, images, badges, icons), carried with their layer order and
 * the box they cover, so the editor can place it on a page and select its
 * parts together. Where its items come from is the host's business
 * (`CanvasBlockService` in `hostServices.ts`); a host may cut them out of a
 * composed slide.
 */
import { layoutRichTextBlock } from '@ggraphic/schema';

import { runMeasurer } from '@ggraphic/editor/utils/textUtils';

import type { IconState } from '../configs/factory/baseTypes';
import type { AdditionalText } from '../configs/types';
import type { AssetInstance } from '../utils/canvasAssets';
import type { ChartInstance } from '@ggraphic/editor/utils/chartTypes';
import type { CircleBadgeInstance } from '@ggraphic/editor/utils/circleBadgeUtils';
import type { PillBadgeInstance } from '@ggraphic/editor/utils/pillBadgeUtils';
import type { ShapeInstance } from '@ggraphic/editor/utils/shapes';
import type { UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

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

/** The element collections of a page a block is cut from (a composed sharepic slide is one). */
export interface BlockSlide {
  additionalTexts: AdditionalText[];
  shapeInstances: ShapeInstance[];
  assetInstances: AssetInstance[];
  chartInstances: ChartInstance[];
  userImageInstances: UserImageInstance[];
  pillBadgeInstances: PillBadgeInstance[];
  circleBadgeInstances: CircleBadgeInstance[];
  selectedIcons: string[];
  iconStates: Record<string, IconState>;
  layerOrder: string[];
}

export type LiftedBlock = Pick<BlockSlide, BlockCollection | 'selectedIcons' | 'iconStates'> & {
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

/** The box the block covers, in canvas px. */
export function boundsOf(block: Omit<LiftedBlock, 'bounds'>): LiftedBlock['bounds'] {
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
