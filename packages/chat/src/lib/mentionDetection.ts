import { filterMentionables, type Mentionable } from './mentionables';

export interface MentionDetectionResult {
  mode: 'functions' | 'skills';
  query: string;
  mentionStart: number;
}

/**
 * Detect an active mention trigger from text + cursor position.
 * Platform-agnostic — works in both web and React Native.
 */
export function detectMention(text: string, caretPosition: number): MentionDetectionResult | null {
  const textBeforeCaret = text.slice(0, caretPosition);

  const atIndex = textBeforeCaret.lastIndexOf('@');
  const slashIndex = textBeforeCaret.lastIndexOf('/');

  const candidates: { index: number; mode: 'functions' | 'skills' }[] = [];

  if (atIndex >= 0) {
    const charBefore = atIndex > 0 ? text[atIndex - 1] : ' ';
    const queryStr = textBeforeCaret.slice(atIndex + 1);
    if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !queryStr.includes(' ')) {
      candidates.push({ index: atIndex, mode: 'functions' });
    }
  }

  if (slashIndex >= 0) {
    const charBefore = slashIndex > 0 ? text[slashIndex - 1] : ' ';
    const queryStr = textBeforeCaret.slice(slashIndex + 1);
    if (
      (charBefore === ' ' || charBefore === '\n' || slashIndex === 0) &&
      !queryStr.includes(' ')
    ) {
      const textBeforeSlash = text.slice(0, slashIndex);
      if (!textBeforeSlash.endsWith(':') && !textBeforeSlash.endsWith(':/')) {
        candidates.push({ index: slashIndex, mode: 'skills' });
      }
    }
  }

  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => (a.index > b.index ? a : b));
  return {
    mode: best.mode,
    query: textBeforeCaret.slice(best.index + 1),
    mentionStart: best.index,
  };
}

export function getFilteredFunctions(query: string): Mentionable[] {
  const { notebooks, tools, documents } = filterMentionables(query);
  return [...tools, ...documents, ...notebooks];
}

export function getFilteredSkills(query: string): Mentionable[] {
  const { agents, customAgents } = filterMentionables(query);
  return [...agents, ...customAgents];
}

export function getFilteredForMode(mode: 'functions' | 'skills', query: string): Mentionable[] {
  return mode === 'skills' ? getFilteredSkills(query) : getFilteredFunctions(query);
}
