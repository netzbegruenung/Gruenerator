import { COLOR_SWATCHES_AT, COLOR_SWATCHES_DE, type Swatch } from '../../profilbild/backgrounds.js';

export type StickerLocale = 'de-DE' | 'de-AT';

export interface SolidSwatch {
  id: string;
  label: string;
  color: string;
}

/** Flat colours of a locale palette as picker entries. */
export const solidSwatches = (swatches: Swatch[]): SolidSwatch[] =>
  swatches.flatMap((s) =>
    s.background.kind === 'color' ? [{ id: s.id, label: s.label, color: s.background.color }] : []
  );

export const stickerSwatches = (locale: StickerLocale): SolidSwatch[] =>
  solidSwatches(locale === 'de-AT' ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE);

export const swatchColor = (swatches: SolidSwatch[], id: string): string =>
  swatches.find((s) => s.id === id)?.color ?? '#ffffff';

/** DE: Sonne auf Tanne; AT: Weiß auf Magenta, the CI's Störer colour. */
export const BADGE_DEFAULT_COLORS = {
  'de-DE': { background: 'tanne', text: 'sonne' },
  'de-AT': { background: 'magenta', text: 'weiss' },
} as const satisfies Record<StickerLocale, { background: string; text: string }>;

/** Line height of the CD headline face per locale (AT: the brand theme's value). */
export const BADGE_LINE_HEIGHT = { 'de-DE': 1, 'de-AT': 0.9 } as const satisfies Record<
  StickerLocale,
  number
>;

/** The badge's white outline, at design scale; stroked at twice the width under the fill. */
export const BADGE_OUTLINE = 20;
export const BADGE_OUTLINE_COLOR = '#ffffff';
/** Room around the shape so the outline stays on the canvas. */
export const BADGE_PAD = BADGE_OUTLINE + 4;
export const BADGE_TEXT_MAX = 60;
export const BADGE_DEFAULT_TEXT = 'Jetzt\nGrün wählen!';

/** Two colours a badge may not share: background and text must differ. */
export const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
