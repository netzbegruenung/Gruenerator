import { type TextStyle } from 'react-native';

/**
 * Typography system for React Native
 * Raleway for headings, PT Sans for body — the same pairing the web app uses.
 */

/**
 * Body copy, matching the brand's web font.
 *
 * The two faces are linked into the native projects by the `expo-font` config
 * plugin (see `app.json`) as one family with weights 400 and 700, which is why
 * `fontWeight` works here — the platform picks the face. Raleway takes the other
 * route: `useFonts` loads it at runtime, one family name per weight
 * (`Raleway_700Bold`), and setting `fontWeight` on it does nothing.
 *
 * Because it is linked rather than loaded, PT Sans needs a native rebuild to
 * appear, and it is available before the first render — no splash-screen gate.
 */
export const BODY_FONT = 'PT Sans';

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

  // Body text
  body: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  } as TextStyle,

  bodyBold: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,

  bodySmall: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  } as TextStyle,

  // Labels and captions
  label: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  } as TextStyle,

  caption: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,

  // Buttons
  button: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,

  buttonSmall: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  } as TextStyle,
} as const;
