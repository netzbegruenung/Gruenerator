/**
 * Freeform AT Full Canvas Configuration (Österreich / de-AT)
 *
 * Thin wrapper over the DE freeform config: same free-design behaviour, but
 * seeded with the Austrian CI — dunkelgrüner Default-Hintergrund, Gotham-Font
 * und AT-Farbpalette im Hintergrund-Picker.
 */

import { getBrandTheme } from '../brand/theme';

import {
  createFreeformFullConfig,
  type FreeformState,
  type FreeformActions,
} from './freeform_full.config';

import type { CanvasFormat } from '../formats';
import type { FullCanvasConfig } from './types';
import type { ImageBackgroundSectionProps } from '../sidebar/sections/ImageBackgroundSection';

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
  const base = createFreeformFullConfig(format);
  const baseBackgroundSection = base.sections.background;
  return {
    ...base,
    id: 'freeform-at',
    fonts: {
      primary: AT.fonts.headline,
      fontSize: base.fonts?.fontSize ?? 60,
      requireFontLoad: base.fonts?.requireFontLoad ?? true,
    },
    sections: {
      ...base.sections,
      // Swap the colour-picker palette to the AT brand colours; keep the rest of
      // the section wiring (image search, mode switching, zoom) intact.
      background: {
        ...baseBackgroundSection,
        propsFactory: (state, actions, context) => ({
          ...(baseBackgroundSection.propsFactory(
            state,
            actions,
            context
          ) as ImageBackgroundSectionProps),
          backgroundColors: AT_BACKGROUND_COLORS,
        }),
      },
    },
    createInitialState: (props: Record<string, unknown>) => ({
      ...base.createInitialState(props),
      backgroundColor: (props.backgroundColor as string | undefined) ?? AT.colors.primary,
    }),
  };
};
