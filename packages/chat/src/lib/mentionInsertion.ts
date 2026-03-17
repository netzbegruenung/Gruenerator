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
  const ctxSuffix = mentionable.contextPrefix ? `${mentionable.contextPrefix} ` : '';
  const tmpl = mentionable.promptTemplate ?? '';
  const newText = `${before}${prefix}${trigger}${mentionable.mention} ${ctxSuffix}${tmpl}${after}`;
  const cursorPosition =
    before.length + prefix.length + mentionable.mention.length + 2 + ctxSuffix.length + tmpl.length;

  return { newText, cursorPosition };
}
