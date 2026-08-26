import { type Mentionable } from './mentionables';
import { buildMentionSections, flattenMentionSections } from './mentionSections';

export interface MentionDetectionResult {
  query: string;
  mentionStart: number;
}

/**
 * Detect an active mention trigger from text + cursor position.
 * Platform-agnostic — works in both web and React Native.
 *
 * `@` is the only trigger. Recipes (formerly "skills") used to have their own
 * `/` trigger, which meant knowing in advance which of the two lists a thing
 * lived in; they are now one list behind one character.
 */
export function detectMention(text: string, caretPosition: number): MentionDetectionResult | null {
  const textBeforeCaret = text.slice(0, caretPosition);
  const atIndex = textBeforeCaret.lastIndexOf('@');
  if (atIndex < 0) return null;

  const charBefore = atIndex > 0 ? text[atIndex - 1] : ' ';
  const query = textBeforeCaret.slice(atIndex + 1);
  const atWordStart = charBefore === ' ' || charBefore === '\n' || atIndex === 0;
  if (!atWordStart || query.includes(' ')) return null;

  return { query, mentionStart: atIndex };
}

/**
 * Everything mentionable in the order the popover renders it, flattened —
 * recipes first: they are the most frequent pick and used to sit behind their
 * own trigger. Derived from `buildMentionSections` so keyboard navigation and
 * the rendered list can never index different things (#2874).
 */
export function getFilteredMentionables(query: string): Mentionable[] {
  return flattenMentionSections(buildMentionSections(query));
}
