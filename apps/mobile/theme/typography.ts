import { Platform, type TextStyle } from 'react-native';

/**
 * Typography system for React Native
 * Raleway for headings (brand consistency with web)
 * System fonts for body text (native feel)
 */

const systemFont = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

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

  // Body text - System fonts
  body: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  } as TextStyle,

  bodyBold: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,

  bodySmall: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  } as TextStyle,

  // Labels and captions
  label: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  } as TextStyle,

  caption: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  } as TextStyle,

  // Buttons - System fonts
  button: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  } as TextStyle,

  buttonSmall: {
    fontFamily: systemFont,
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
 */
export const chatType = {
  /** The conversation itself: answers, the user's message, what you type. */
  chatBody: {
    fontSize: 17,
    lineHeight: 27,
  } as TextStyle,

  /** The heading of a card or a list row. */
  chatTitle: {
    fontSize: 15,
    lineHeight: 21,
  } as TextStyle,

  /** Prose inside a card — summaries, snippets, answers to a tool question. */
  chatSecondary: {
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,

  /** The name of a control, chip or column. */
  chatLabel: {
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,

  /** A fact about something: count, date, domain, query, status. */
  chatMeta: {
    fontSize: 12,
    lineHeight: 16,
  } as TextStyle,

  /** A marker: badge text, ordinal, legend. Nothing is smaller than this. */
  chatMicro: {
    fontSize: 11,
    lineHeight: 14,
  } as TextStyle,
} as const;
