import { getGreeting } from '@gruenerator/shared/utils';

/** Anything that already closes a line — a second mark after these reads as a typo. */
const CLOSED = /[.!?…]$/;

/**
 * The greeting as the phone says it: short, and closed with a mark.
 *
 * Both belong together, which is why this exists rather than `{ short: true }`
 * spelled out at each call site. Web's hero sets the greeting against a
 * "wie kann ich dir helfen?" line below it, so it stays open on purpose. The
 * phone dropped that second line — the composer sits directly underneath and
 * asks the same thing — and an unclosed "Guten Tag, Moritz" then reads like a
 * sentence someone forgot to finish.
 *
 * The check matters for the templates that are already whole sentences:
 * "Happy Pride, @Vorname!" must not come out with two marks.
 */
export function mobileGreeting(
  locale: string | null | undefined,
  firstName: string | null
): string {
  const greeting = getGreeting(locale, firstName, { short: true });
  return CLOSED.test(greeting) ? greeting : `${greeting}!`;
}
