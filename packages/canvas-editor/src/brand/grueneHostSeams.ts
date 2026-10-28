import { registerPptxFonts } from '@ggraphic/editor/export/pptx/pptxFonts';
import { registerHostMessages } from '@ggraphic/editor/i18n/messages';
import { registerMeasuredCornerReservation } from '@ggraphic/editor/utils/cornerReservation';
import { registerToast, type EditorToast } from '@ggraphic/editor/utils/editorToast';
import { registerElementKind } from '@ggraphic/editor/utils/elementKinds';
import { toast, useMeasuredCornerReservation } from '@gruenerator/ui';

import { BALKEN_KIND, BALKEN_MESSAGES } from './balkenKind';
import { GRUENE_PPTX_FONTS } from './gruenePptxFonts';

/**
 * The Grünerator's side of the editor's seams: toasts go through the app's
 * sonner `toast`, the bottom bar reports its corner to the app's corner
 * registry (the one the feedback launcher reads), and the Balken are an
 * element kind of their own, with their texts. Registered once at start-up,
 * before the first render, next to the asset catalogue and the brand packs.
 * The Balken's renderer is installed by the package entry (`src/index.ts`),
 * because it pulls Konva.
 */
export function registerGrueneHostSeams(): void {
  registerToast(toast as EditorToast);
  registerMeasuredCornerReservation(useMeasuredCornerReservation);
  registerPptxFonts(GRUENE_PPTX_FONTS);
  registerElementKind(BALKEN_KIND);
  registerHostMessages(BALKEN_MESSAGES);
}
