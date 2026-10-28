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

import type { CanvasBlockService } from '../grueneratorHostServices';
import type { CanvasCarouselService } from '@ggraphic/editor/hostServices';

export const grueneratorBlocks: CanvasBlockService = {
  ground: blockGround,
  lift: liftBlock,
};

export const grueneratorCarousel: CanvasCarouselService = {
  refreshChrome: refreshCarouselChromeInDoc,
  pptxFontHint: {
    'de-DE':
      'Damit die Folien wie im Grünerator aussehen, installiere die Schriften GrueneType Neue und PT Sans – sonst ersetzt PowerPoint sie.',
    'de-AT':
      'Damit die Folien wie im Grünerator aussehen, installiere die Schriften Gotham Narrow Book, Bold und Ultra – sonst ersetzt PowerPoint sie.',
  },
};
