import { type TextStyle } from 'react-native';

/**
 * Typography system for React Native.
 * Raleway for headings (brand consistency with web), PT Sans for body text.
 *
 * PT Sans is loaded from `assets/fonts/*.ttf` in `app/_layout.tsx` — two files,
 * Regular and Bold. That is why nothing here sets `fontWeight`: on Android a
 * custom family does not synthesise weights, so a weight next to
 * `fontFamily: 'PTSans-Regular'` is silently ignored (and on iOS it fakes a
 * stroke the family does not have). Bold text picks the Bold FAMILY instead.
 *
 * Sizes are one point above the former system-font scale: PT Sans has a smaller
 * x-height than Roboto/SF at the same point size, so 16 pt read visibly smaller
 * than the Roboto 16 pt it replaced.
 */

export const BODY_FONT = 'PTSans-Regular';
export const BODY_FONT_BOLD = 'PTSans-Bold';

export const typography = {
  // Headings - Raleway (matches web)
  h1: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  } as TextStyle,

  h2: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.3,
  } as TextStyle,

  h3: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
  } as TextStyle,

  h4: {
    fontFamily: 'Raleway_600SemiBold',
    fontSize: 18,
    lineHeight: 24,
  } as TextStyle,

  // Body text - PT Sans
  body: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    lineHeight: 25,
  } as TextStyle,

  bodyBold: {
    fontFamily: BODY_FONT_BOLD,
    fontSize: 17,
    lineHeight: 25,
  } as TextStyle,

  bodySmall: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 21,
  } as TextStyle,

  // Labels and captions
  label: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 21,
  } as TextStyle,

  caption: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 17,
  } as TextStyle,

  // Buttons
  button: {
    fontFamily: BODY_FONT_BOLD,
    fontSize: 17,
    lineHeight: 25,
  } as TextStyle,

  buttonSmall: {
    fontFamily: BODY_FONT_BOLD,
    fontSize: 15,
    lineHeight: 21,
  } as TextStyle,
} as const;
