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

/**
 * Text scale for the chat surface.
 *
 * Six tiers ordered by distance from the conversation, not by pixel size. The
 * rule for placing a style is what it *is*, never what it currently measures:
 *
 * - a sentence someone reads in the conversation → `chatBody`
 * - the heading of a card or row                 → `chatTitle`
 * - a sentence inside a card                     → `chatSecondary`
 * - the name of a control or a column            → `chatLabel`
 * - a fact about a thing (count, date, domain)   → `chatMeta`
 * - a marker or ordinal (badge, index)           → `chatMicro`
 *
 * Before this existed, twelve sizes between 10 and 26 sat inline across 133
 * styles, and 12px alone carried four different jobs — readable sentences,
 * labels, facts and code. Changing "how airy is the chat" meant a search rather
 * than an edit. Each tier carries its own leading on purpose: consistent line
 * spacing is half of what reads as airy.
 *
 * Each tier carries the body face as well. A style that opts into the scale
 * must never have to remember the font separately — that split is exactly how
 * three styles silently lost PT Sans while these branches were merged.
 */
export const chatType = {
  /** The conversation itself: answers, the user's message, what you type. */
  chatBody: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    lineHeight: 27,
  } as TextStyle,

  /** The heading of a card or a list row. */
  chatTitle: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    lineHeight: 21,
  } as TextStyle,

  /** Prose inside a card — summaries, snippets, answers to a tool question. */
  chatSecondary: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,

  /** The name of a control, chip or column. */
  chatLabel: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,

  /** A fact about something: count, date, domain, query, status. */
  chatMeta: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    lineHeight: 16,
  } as TextStyle,

  /** A marker: badge text, ordinal, legend. Nothing is smaller than this. */
  chatMicro: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    lineHeight: 14,
  } as TextStyle,
} as const;
