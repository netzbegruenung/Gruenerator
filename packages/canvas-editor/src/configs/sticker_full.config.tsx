/**
 * Sticker Canvas Configuration
 *
 * The freeform editor on a transparent square: no background plane, so what is
 * drawn is the sticker and the host exports it with `includeBackground: false`
 * and trims it to its motif. One page, no AI chat — a sticker is a single
 * graphic, saved as a studio asset rather than shared.
 */

import { getCanvasFormatOrDefault } from '@ggraphic/editor/formats/index';
import { CANVAS_COLORS } from '@gruenerator/contracts';

import { getBrandPack } from '../brand/theme';

import {
  createFreeformFullConfig,
  type FreeformActions,
  type FreeformState,
} from './freeform_full.config';

import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';

/** The square sheet a sticker is drawn on; the export trims it to the motif. */
export const STICKER_FORMAT_ID = 'profile-square';

// Tanne text: white would vanish on the light checkerboard and in most places a sticker lands.
const base = createFreeformFullConfig(getCanvasFormatOrDefault(STICKER_FORMAT_ID), {
  fontColor: CANVAS_COLORS.TANNE,
});

export const stickerFullConfig: FullCanvasConfig<FreeformState, FreeformActions> = {
  ...base,
  id: 'sticker',
  // New elements start in the German brand pack, not whichever pack is active.
  brand: getBrandPack('de-DE'),
  // One sheet: a sticker is a single graphic.
  multiPage: { ...base.multiPage, enabled: true, maxPages: 1 },
  tabs: base.tabs.filter((tab) => tab.id !== 'chat'),
  getVisibleTabs: () => ['text', 'elements', 'tools', 'uploads'],
  // Without the colour and photo planes the sheet stays transparent.
  elements: base.elements.filter((el) => el.type !== 'background' && el.id !== 'background-image'),
  background: undefined,
};
