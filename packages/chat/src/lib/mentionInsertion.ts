import { mentionTokenFor } from './mentionParser';

import type { Mentionable, MentionableType } from './mentionables';

export interface MentionInsertionResult {
  newText: string;
  cursorPosition: number;
}

/**
 * The draft seed a mentionable contributes. Recipes and agents carry a
 * `promptTemplate` ("Schreibe eine Pressemitteilung im Stil … zum Thema: ")
 * that only restates what the recipe already tells the model — dropping it
 * keeps the composer empty for the user's own topic. Tool mentions keep their
 * seed: there it is the query stem the user types into (`@umfragen` →
 * "Suche aktuelle Umfragen zu ").
 */
function seedFor(mentionable: Mentionable): string {
  return mentionable.category === 'skill' ? '' : (mentionable.promptTemplate ?? '');
}

/**
 * Compute new text content after a mention is selected.
 * Platform-agnostic — works in both web and React Native.
 */
export function computeMentionInsertion(
  currentText: string,
  mentionable: Mentionable,
  mentionStart: number,
  caretPosition: number
): MentionInsertionResult {
  // '@' for skills too: recipes live in the @-namespace now ('/' stays a
  // legacy input trigger in the parser, but nothing inserts it anymore).
  const trigger = '@';
  const insertAt = mentionStart >= 0 ? mentionStart : currentText.length;
  const before = currentText.slice(0, insertAt);
  const after = mentionStart >= 0 ? currentText.slice(caretPosition) : '';
  const prefix = before.length > 0 && !before.endsWith(' ') && mentionStart < 0 ? ' ' : '';
  const tmpl = seedFor(mentionable);
  const newText = `${before}${prefix}${trigger}${mentionable.mention} ${tmpl}${after}`;
  const cursorPosition =
    before.length + prefix.length + mentionable.mention.length + 2 + tmpl.length;

  return { newText, cursorPosition };
}

/**
 * Pill-mode insertion: the mention itself becomes a composer chip instead of
 * text, so only the seed from `seedFor` lands in the textarea. The typed
 * `@quer…` trigger span (mentionStart..caretPosition) is removed.
 */
export function computePillMentionInsertion(
  currentText: string,
  mentionable: Mentionable,
  mentionStart: number,
  caretPosition: number
): MentionInsertionResult {
  const insertAt = mentionStart >= 0 ? mentionStart : currentText.length;
  const before = currentText.slice(0, insertAt);
  const after = mentionStart >= 0 ? currentText.slice(caretPosition) : '';
  const tmpl = seedFor(mentionable);
  return { newText: `${before}${tmpl}${after}`, cursorPosition: before.length + tmpl.length };
}

/**
 * The prefix a set of pill mentions contributes at send time — already in the
 * durable `@[Label](type:id)` form, not the plain `@websuche` one.
 *
 * The plain form used to be enough because the adapter rewrote it to tokens on
 * the way out. But that rewrite only ever touched the wire COPY of the message
 * (`textPart.text = parsed.tokenText`), never the runtime's own — so the bubble
 * the user saw carried bare `@tally` text, and `UserMessageText` renders chips
 * only from tokens. The tag looked lost until a reload re-read the (correctly
 * tokenised) server row. Emitting tokens here makes the optimistic message, the
 * wire message and the persisted row carry the same text.
 *
 * Safe to hand back into the parser: `parseAllMentions` skips `@[`-prefixed
 * aliases and preserves them in `tokenText`, which is exactly the path an
 * edit-resubmit of a persisted message already takes. The backend derives the
 * same routing fields from the token that the plain form produced client-side
 * (`deriveMentionTokenFields` is the declared inverse of `mentionTokenFor`).
 *
 * Recipes are the exception and keep the plain `@presse`: their durable form is
 * a `skill:` token, and a skill token deliberately carries no agent — the
 * backend leaves `agentId` to the body, and only the plain form makes the
 * client's parser resolve the owning agent. Recipes lose nothing by it; their
 * chip rides `activeSkillMention` in the store, as before.
 */
// Typed against the union, not `Set<string>`: renaming or dropping a member has
// to break the build here. Untyped, the set would silently stop matching, every
// recipe would tokenise, and each one would quietly lose its agent.
const CARRIES_ITS_OWN_AGENT: ReadonlySet<MentionableType> = new Set<MentionableType>([
  'agent',
  'textform',
]);

export function buildMentionPrefix(
  mentions: ReadonlyArray<Pick<Mentionable, 'type' | 'identifier' | 'title' | 'mention'>>
): string {
  return mentions
    .map(
      (m) => (CARRIES_ITS_OWN_AGENT.has(m.type) ? undefined : mentionTokenFor(m)) ?? `@${m.mention}`
    )
    .join(' ');
}
