import { type ChatBackground } from '@gruenerator/contracts';

import { colors } from './colors';

/**
 * What each chat-background preset looks like on mobile: one flat colour, not a
 * gradient.
 *
 * Web stores a CSS gradient per preset — several stops plus a fade — which has
 * no equivalent here: the picker draws plain circles, and the chat-start glow is
 * a single radial whose centre is one colour. So mobile keeps its own values out
 * of the app palette rather than borrowing web's stops, which are tuned for a
 * wide surface and read muddy on a phone.
 *
 * The keys come from `chatBackgroundSchema`; names and descriptions from
 * `@gruenerator/shared/settings`. Only the colour is ours.
 *
 * `null` means the preset paints nothing — the plain theme background shows.
 */
export const CHAT_BACKGROUND_COLORS: Record<ChatBackground, string | null> = {
  // The glow this screen has always had, kept as the default.
  sunrise: '#E9D696',
  tanne: colors.primary[500],
  // No blue or pink in the brand palette, so these two are defined here —
  // desaturated to sit at the same weight as the tokens either side of them.
  himmel: '#7FA8C9',
  sand: '#D8C7AC',
  magenta: '#D98FB4',
  regenbogen: '#B49BD6',
  neutral: null,
};

export function chatBackgroundColor(key: ChatBackground): string | null {
  return CHAT_BACKGROUND_COLORS[key];
}
