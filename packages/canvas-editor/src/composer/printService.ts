/**
 * The Grünerator's print service for the editor (`CanvasEditorServices.print`):
 * the V.i.S.d.P. / Impressum line and the print Vorlagen composer. The editor
 * core reaches both only through this object, which the host hands in.
 */
import { composePrint, composePrintImpressum, PRINT_IMPRESSUM_ID } from './composePrint';
import {
  IMPRESSUM_LABELS,
  impressumLine,
  impressumLocaleOf,
  isFilled,
  isImpressumComplete,
  parseImpressumLine,
} from './printImpressum';

import type { CanvasPrintService } from '../hostServices';

export const grueneratorPrint: CanvasPrintService = {
  impressum: {
    elementId: PRINT_IMPRESSUM_ID,
    localeOf: impressumLocaleOf,
    line: impressumLine,
    parse: parseImpressumLine,
    isFilled,
    isComplete: isImpressumComplete,
    labels: IMPRESSUM_LABELS,
    composeElement: composePrintImpressum,
  },
  composePrint,
};
