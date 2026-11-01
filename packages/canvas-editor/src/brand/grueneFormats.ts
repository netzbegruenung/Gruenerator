import { registerCanvasFormatGroups, registerCanvasFormats } from '@ggraphic/editor/host';
import {
  LEGACY_CANVAS_FORMAT_GROUPS,
  LEGACY_CANVAS_FORMATS,
} from '@ggraphic/editor/internal/formats/legacyCatalog';

/**
 * The Grünerator's formats beyond the editor's three built-ins (`post-portrait`,
 * `profile-square`, `slide-16-9`): `post-portrait-tall` and the 14 `print-*`
 * formats. Their ids are stored with documents and written by the sharepic
 * creator (F0), so every process that opens, composes or renders a design
 * registers them before the first lookup. Unregistered, a print id is refused
 * and `post-portrait-tall` quietly renders as 4:5.
 *
 * The list is still the editor's deprecated legacy catalogue, byte for byte the
 * definitions before ggraphic alpha.2; it moves into this repository before
 * that catalogue goes (D2f).
 */
export function registerGrueneFormats(): void {
  registerCanvasFormatGroups(LEGACY_CANVAS_FORMAT_GROUPS);
  registerCanvasFormats(LEGACY_CANVAS_FORMATS);
}
