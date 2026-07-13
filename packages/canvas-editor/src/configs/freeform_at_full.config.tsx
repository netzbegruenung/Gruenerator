/**
 * Freeform AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Thin wrapper over the DE freeform config: same free-design behaviour, but
 * seeded with the Austrian CI — dunkelgrüner Default-Hintergrund, Gotham-Font
 * und AT-Farbpalette im Hintergrund-Picker.
 */

import { getBrandTheme } from '../brand/theme';

import {
  freeformFullConfig,
  type FreeformState,
  type FreeformActions,
} from './freeform_full.config';

import type { FullCanvasConfig } from './types';

const AT = getBrandTheme('de-AT');

const AT_BACKGROUND_COLORS = [
  { id: 'dunkelgruen', label: 'Dunkelgrün', color: AT.colors.primary },
  { id: 'hellgruen', label: 'Hellgrün', color: AT.colors.secondary },
  { id: 'gelb', label: 'Gelb', color: AT.colors.accent },
  { id: 'weiss', label: 'Weiß', color: '#ffffff' },
  { id: 'schwarz', label: 'Schwarz', color: '#000000' },
];

const baseBackgroundSection = freeformFullConfig.sections.background;

export const freeformAtFullConfig: FullCanvasConfig<FreeformState, FreeformActions> = {
  ...freeformFullConfig,
  id: 'freeform-at',
  fonts: {
    primary: AT.fonts.headline,
    fontSize: freeformFullConfig.fonts?.fontSize ?? 60,
    requireFontLoad: freeformFullConfig.fonts?.requireFontLoad ?? true,
  },
  sections: {
    ...freeformFullConfig.sections,
    // Swap the colour-picker palette to the AT brand colours; keep the rest of
    // the section wiring (image search etc.) intact.
    background: {
      ...baseBackgroundSection,
      propsFactory: (state, actions, context) => ({
        ...baseBackgroundSection.propsFactory(state, actions, context),
        colors: AT_BACKGROUND_COLORS,
        currentColor: state.backgroundMode === 'color' ? state.backgroundColor : AT.colors.primary,
      }),
    },
  },
  createInitialState: (props: Record<string, unknown>) => ({
    ...freeformFullConfig.createInitialState(props),
    backgroundColor: (props.backgroundColor as string | undefined) ?? AT.colors.primary,
  }),
};
