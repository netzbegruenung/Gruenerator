import { registerPptxFonts } from '@ggraphic/editor/export/pptx/pptxFonts';
import { registerMeasuredCornerReservation } from '@ggraphic/editor/utils/cornerReservation';
import { registerToast, type EditorToast } from '@ggraphic/editor/utils/editorToast';
import { toast, useMeasuredCornerReservation } from '@gruenerator/ui';

import { GRUENE_PPTX_FONTS } from './gruenePptxFonts';

/**
 * The Grünerator's side of the editor's UI seams: toasts go through the app's
 * sonner `toast`, the bottom bar reports its corner to the app's corner
 * registry (the one the feedback launcher reads). Registered once at start-up,
 * before the first render, next to the asset catalogue and the brand packs.
 */
export function registerGrueneHostSeams(): void {
  registerToast(toast as EditorToast);
  registerMeasuredCornerReservation(useMeasuredCornerReservation);
  registerPptxFonts(GRUENE_PPTX_FONTS);
}
