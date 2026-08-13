import type { Mentionable } from './mentionables';

export interface MentionInsertionResult {
  newText: string;
  cursorPosition: number;
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
  const trigger = mentionable.category === 'skill' ? '/' : '@';
  const insertAt = mentionStart >= 0 ? mentionStart : currentText.length;
  const before = currentText.slice(0, insertAt);
  const after = mentionStart >= 0 ? currentText.slice(caretPosition) : '';
  const prefix = before.length > 0 && !before.endsWith(' ') && mentionStart < 0 ? ' ' : '';
  const tmpl = mentionable.promptTemplate ?? '';
  const newText = `${before}${prefix}${trigger}${mentionable.mention} ${tmpl}${after}`;
  const cursorPosition =
    before.length + prefix.length + mentionable.mention.length + 2 + tmpl.length;

  return { newText, cursorPosition };
}

/**
 * Pill-mode insertion: the mention itself becomes a composer chip instead of
 * text, so only the optional promptTemplate lands in the textarea. The typed
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
  const tmpl = mentionable.promptTemplate ?? '';
  return { newText: `${before}${tmpl}${after}`, cursorPosition: before.length + tmpl.length };
}

/**
 * The plain-text prefix a set of pill mentions contributes at send time —
 * `@websuche @berlin ` / `/presse `. Prepending this to the draft re-enters the
 * exact text path a hand-typed mention takes today (`parseAllMentions` →
 * routing + durable `@[Label](type:id)` tokens), so the wire format and the
 * persisted message stay byte-identical to the pre-pill behaviour.
 */
export function buildMentionPrefix(
  mentions: ReadonlyArray<Pick<Mentionable, 'category' | 'mention'>>
): string {
  return mentions.map((m) => `${m.category === 'skill' ? '/' : '@'}${m.mention}`).join(' ');
}
