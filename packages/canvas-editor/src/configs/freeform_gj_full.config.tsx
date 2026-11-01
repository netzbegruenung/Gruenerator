/**
 * Freeform GRÜNE JUGEND Full Canvas Configuration (Deutschland / de-DE)
 *
 * Thin wrapper over the DE freeform config: same free-design behaviour, but
 * seeded with the GRÜNE JUGEND brand — Hellgrün als Default-Hintergrund, die
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

const GJ = getBrandTheme('de-DE', 'gruene-jugend');

const GJ_BACKGROUND_COLORS = [
  { id: 'hellgruen', label: 'Hellgrün', color: SHAREPIC_COLOR_HEX.limette },
  { id: 'lavendel', label: 'Lavendel', color: SHAREPIC_COLOR_HEX.lavendel },
  { id: 'pink', label: 'Pink', color: SHAREPIC_COLOR_HEX.pink },
  { id: 'apricot', label: 'Apricot', color: SHAREPIC_COLOR_HEX.apricot },
  { id: 'weiss', label: 'Weiß', color: '#ffffff' },
  { id: 'schwarz', label: 'Schwarz', color: '#000000' },
  // Themed grounds (Frauen, Pride, Europa); `pride` is the middle of its gradient.
  { id: 'lila', label: 'Lila', color: SHAREPIC_COLOR_HEX.lila },
  { id: 'flieder', label: 'Flieder', color: SHAREPIC_COLOR_HEX.flieder },
  { id: 'violett', label: 'Violett', color: SHAREPIC_COLOR_HEX.violett },
  { id: 'pride', label: 'Pride', color: SHAREPIC_COLOR_HEX.pride },
  { id: 'europablau', label: 'Europablau', color: SHAREPIC_COLOR_HEX.europablau },
  { id: 'himmelblau', label: 'Himmelblau', color: SHAREPIC_COLOR_HEX.himmelblau },
];

export const createFreeformGjFullConfig = (
  format: CanvasFormat
): FullCanvasConfig<FreeformState, FreeformActions> => {
  const base = createFreeformFullConfig(format, {
    brand: getBrandPack('de-DE', 'gruene-jugend'),
  });
  return {
    ...base,
    id: 'freeform-gj',
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
