/**
 * Freeform AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Thin wrapper over the DE freeform config: same free-design behaviour, but
 * seeded with the Austrian CI — dunkelgrüner Default-Hintergrund, Gotham-Font,
 * AT-Farbpalette im Hintergrund-Picker und im AT-Markenpaket für alles, was neu
 * hinzukommt (Schriften, Farben, Diagrammreihen).
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

const AT = getBrandTheme('de-AT');

const AT_BACKGROUND_COLORS = [
  { id: 'dunkelgruen', label: 'Dunkelgrün', color: AT.colors.primary },
  { id: 'hellgruen', label: 'Hellgrün', color: AT.colors.secondary },
  { id: 'gelb', label: 'Gelb', color: AT.colors.accent },
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

export const createFreeformAtFullConfig = (
  format: CanvasFormat
): FullCanvasConfig<FreeformState, FreeformActions> => {
  const base = createFreeformFullConfig(format, { brand: getBrandPack('de-AT') });
  return {
    ...base,
    id: 'freeform-at',
    fonts: {
      primary: AT.fonts.headline,
      fontSize: base.fonts?.fontSize ?? 60,
      requireFontLoad: base.fonts?.requireFontLoad ?? true,
    },
    // Same background wiring, AT brand palette.
    background: (state, actions) => ({
      ...base.background?.(state, actions),
      colors: AT_BACKGROUND_COLORS,
    }),
    createInitialState: (props: Record<string, unknown>) => ({
      ...base.createInitialState(props),
      backgroundColor: (props.backgroundColor as string | undefined) ?? AT.colors.primary,
    }),
  };
};
