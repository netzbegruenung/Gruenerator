/**
 * Freeform AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Thin wrapper over the DE freeform config: same free-design behaviour, but
 * seeded with the Austrian CI — dunkelgrüner Default-Hintergrund, Gotham-Font,
 * AT-Farbpalette im Hintergrund-Picker und in neuen Diagrammen.
 */

import { getBrandTheme } from '../brand/theme';
import { CHART_PALETTES } from '../utils/chartUtils';

import {
  createFreeformFullConfig,
  type FreeformState,
  type FreeformActions,
} from './freeform_full.config';

import type { CanvasFormat } from '../formats';
import type { FullCanvasConfig } from './types';

const AT = getBrandTheme('de-AT');

const AT_BACKGROUND_COLORS = [
  { id: 'dunkelgruen', label: 'Dunkelgrün', color: AT.colors.primary },
  { id: 'hellgruen', label: 'Hellgrün', color: AT.colors.secondary },
  { id: 'gelb', label: 'Gelb', color: AT.colors.accent },
  { id: 'weiss', label: 'Weiß', color: '#ffffff' },
  { id: 'schwarz', label: 'Schwarz', color: '#000000' },
];

export const createFreeformAtFullConfig = (
  format: CanvasFormat
): FullCanvasConfig<FreeformState, FreeformActions> => {
  const base = createFreeformFullConfig(format, { chartColors: CHART_PALETTES['de-AT'] });
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
