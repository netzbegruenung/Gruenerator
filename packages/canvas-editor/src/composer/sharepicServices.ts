/**
 * The Grünerator's block and carousel services for the editor
 * (`CanvasEditorServices.blocks` and `.carousel`): a block cut out of a
 * composed sharepic slide on the page's brand ground, and the composed
 * carousel chrome (k/n, dots, swipe arrow, point numerals) kept true after
 * page ops. The editor core reaches both only through these objects, which
 * the host hands in.
 */
import { refreshCarouselChromeInDoc } from './carouselChrome';
import { blockGround, liftBlock } from './liftBlock';

import type { CanvasBlockService, CanvasCarouselService } from '../hostServices';

export const grueneratorBlocks: CanvasBlockService = {
  ground: blockGround,
  lift: liftBlock,
};

export const grueneratorCarousel: CanvasCarouselService = {
  refreshChrome: refreshCarouselChromeInDoc,
};
