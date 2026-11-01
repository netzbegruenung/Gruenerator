/**
 * Freeform Grüne Jugend Österreich Full Canvas Configuration (de-AT)
 *
 * Thin wrapper over the DE freeform config: same free-design behaviour, but
 * seeded with the Grüne Jugend Österreich brand — Waldgrün als Default-Hintergrund, die
 * Schrift der Jugendorganisation, GJ-Farbpalette im Hintergrund-Picker und in
 * neuen Diagrammen.
 */

import { getBrandPack, getBrandTheme } from '../brand/theme';
import { SHAREPIC_COLOR_HEX } from '../composer/chromeParts';

import {
  createFreeformFullConfig,
  type FreeformState,
  type FreeformActions,
} from './freeform_full.config';

import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';
import type { CanvasFormat } from '@ggraphic/editor/formats/index';

const GJ = getBrandTheme('de-AT', 'gruene-jugend');

const GJ_BACKGROUND_COLORS = [
  { id: 'waldgruen', label: 'Waldgrün', color: SHAREPIC_COLOR_HEX.waldgruen },
  { id: 'maigruen', label: 'Maigrün', color: SHAREPIC_COLOR_HEX.maigruen },
  { id: 'creme', label: 'Creme', color: SHAREPIC_COLOR_HEX.creme },
  { id: 'gelb', label: 'Gelb', color: SHAREPIC_COLOR_HEX.gelb },
  { id: 'veilchen', label: 'Violett', color: SHAREPIC_COLOR_HEX.veilchen },
  // Themed grounds (Frauen, Pride, Europa); `pride` is the middle of its gradient.
  { id: 'lila', label: 'Lila', color: SHAREPIC_COLOR_HEX.lila },
  { id: 'flieder', label: 'Flieder', color: SHAREPIC_COLOR_HEX.flieder },
  { id: 'pride', label: 'Pride', color: SHAREPIC_COLOR_HEX.pride },
  { id: 'europablau', label: 'Europablau', color: SHAREPIC_COLOR_HEX.europablau },
  { id: 'himmelblau', label: 'Himmelblau', color: SHAREPIC_COLOR_HEX.himmelblau },
];

export const createFreeformGjAtFullConfig = (
  format: CanvasFormat
): FullCanvasConfig<FreeformState, FreeformActions> => {
  const base = createFreeformFullConfig(format, {
    brand: getBrandPack('de-AT', 'gruene-jugend'),
  });
  return {
    ...base,
    id: 'freeform-gj-at',
    fonts: {
      primary: GJ.fonts.headline,
      fontSize: base.fonts?.fontSize ?? 60,
      requireFontLoad: base.fonts?.requireFontLoad ?? true,
    },
    // Same background wiring, GJ brand palette.
    background: (state, actions) => ({
      ...base.background?.(state, actions),
      colors: GJ_BACKGROUND_COLORS,
    }),
    createInitialState: (props: Record<string, unknown>) => ({
      ...base.createInitialState(props),
      backgroundColor: (props.backgroundColor as string | undefined) ?? GJ.colors.primary,
    }),
  };
};
