/**
 * The Grünerator's print service for the editor (`CanvasEditorServices.print`):
 * the V.i.S.d.P. / Impressum line and the print Vorlagen composer. The editor
 * core reaches both only through this object, which the host hands in.
 */
import { PRINT_UNGETESTET_HINWEIS } from '@gruenerator/contracts';

import { composePrint, composePrintImpressum, PRINT_IMPRESSUM_ID } from './composePrint';
import {
  IMPRESSUM_LABELS,
  impressumLine,
  impressumLocaleOf,
  fromImprintParts,
  isFilled,
  isImpressumComplete,
  parseImpressumLine,
  toImprintParts,
} from './printImpressum';

import type { CanvasPrintService } from '../grueneratorHostServices';

export const grueneratorPrint: CanvasPrintService = {
  imprint: {
    elementId: PRINT_IMPRESSUM_ID,
    localeOf: impressumLocaleOf,
    line: (locale, parts) => impressumLine(locale, fromImprintParts(parts)),
    parse: (locale, text) => toImprintParts(parseImpressumLine(locale, text)),
    isFilled,
    isComplete: (parts) => isImpressumComplete(fromImprintParts(parts)),
    labels: IMPRESSUM_LABELS,
    composeElement: composePrintImpressum,
  },
  composePrint,
  untestedNotice: PRINT_UNGETESTET_HINWEIS,
};
