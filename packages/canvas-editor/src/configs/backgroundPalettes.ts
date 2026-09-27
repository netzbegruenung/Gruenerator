/**
 * Background palettes for the photo-backed templates.
 *
 * These templates (zitat, simple, dreizeilen, and their AT twins) draw a solid
 * plane UNDER the photo, so the canvas has a colour before a picture is chosen
 * and the user can decide to stay on colour. The palette is deliberately NOT
 * the same list the colour-backed templates offer:
 *
 * A colour template derives its font colour from the chosen background
 * (`textColorMap`) and can therefore offer light colours — zitat-pure puts dark
 * green on Sand. A photo template cannot: its text colour is baked in as white
 * (`ZITAT_CONFIG.quote.color`, and `createImageTwoTextCanvas` hands `'#FFFFFF'`
 * to `createBaseActions` for every text the user adds). Offering Sand here
 * would produce white on #F5F1E9 — a contrast of 1.1:1, invisible.
 *
 * So the rule for this file is: **only colours that carry white text.** Every
 * entry below is measured against #FFFFFF (WCAG 2.x relative luminance):
 *
 *   Tanne      #005538   11.6:1   passes AA for any size
 *   Klee       #008939    4.5:1   passes AA for normal text
 *   Dunkelgrün #257639    6.6:1   passes AA for normal text
 *   Schwarz    #000000     21:1   passes AAA
 *
 * Deliberately absent: AT's Hellgrün #56af31, which the AT colour templates DO
 * offer. White on it measures 2.8:1 — under the 3:1 floor even for large text.
 * The colour templates inherit that pairing from `BRAND_THEMES` and the AT CI;
 * a surface being added now should not reproduce it.
 *
 * This module is the source for BOTH the editor configs and the server-safe
 * descriptors in `@gruenerator/contracts` (which cannot import from here — the
 * dependency runs the other way). `ai/sharepicDescriptorParity.vitest.ts`
 * compares the two, so a colour added here without the descriptor line fails
 * the build rather than leaving the chat unable to name it.
 */

import { getBrandTheme } from '../brand/theme';

import type { BackgroundColorOption } from '../sidebar/types';

const AT = getBrandTheme('de-AT');
const DE = getBrandTheme('de-DE');

/** Photo-template background palette, Germany. */
export const PHOTO_BACKGROUND_COLORS_DE: readonly BackgroundColorOption[] = [
  { id: 'tanne', label: 'Tanne', color: DE.colors.primary },
  { id: 'klee', label: 'Klee', color: DE.colors.accent },
  { id: 'schwarz', label: 'Schwarz', color: '#000000' },
] as const;

/** Photo-template background palette, Austria. */
export const PHOTO_BACKGROUND_COLORS_AT: readonly BackgroundColorOption[] = [
  { id: 'dunkelgruen', label: 'Dunkelgrün', color: AT.colors.primary },
  { id: 'schwarz', label: 'Schwarz', color: '#000000' },
] as const;

export const DEFAULT_PHOTO_BACKGROUND_DE = DE.colors.primary;
export const DEFAULT_PHOTO_BACKGROUND_AT = AT.colors.primary;
