import {
  sharepicColorsFor,
  themaOfColor,
  type SharepicColor,
  type SharepicCreatorLocale,
} from '@gruenerator/contracts';

import { boundsOf, type BlockSlide, type LiftedBlock } from '../blocks/liftedBlock';

import { colorOf } from './carouselChrome';

import type { IconState } from '../configs/factory/baseTypes';

// The block mechanics live in the editor core; re-exported for the composer's public API.
export {
  BLOCK_COLLECTIONS,
  blockElementIds,
  placeBlock,
  translateBlock,
  type LiftedBlock,
} from '../blocks/liftedBlock';

/**
 * The elements the composer made for `items` of a composed slide (ids
 * `sc-<i>-…`, a chart's `chart-sc-<i>-…`), cut loose from the slide: every id
 * re-prefixed with `blk-<token>-`, so a block inserted twice never collides
 * and the sharepic lift reads it as an element of the person's own, not as
 * part of the page's composed spec. Only the prefix changes — a card finds
 * its text by `${text.id}-card`.
 */
export function liftBlock(slide: BlockSlide, items: readonly number[], token: string): LiftedBlock {
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
