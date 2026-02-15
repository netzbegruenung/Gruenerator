import { getDefaultAgent } from './agents';
import { resolveMentionable } from './mentionables';

export interface MentionResult {
  agentId: string;
  cleanText: string;
}

export interface ParsedMentions {
  agentId: string;
  notebookIds: string[];
  forcedTools: string[];
  cleanText: string;
}

const MENTION_RE = /(?:^|\s)@(\S+)/g;

/**
 * Parse all @-mentions in a message text.
 * Resolves each to either an agent or notebook mentionable.
 * Agents: uses the last @agent found (or default).
 * Notebooks: collects all unique notebook IDs.
 * Strips all resolved mentions from the text.
 */
export function parseAllMentions(text: string): ParsedMentions {
  let agentId: string | null = null;
  const notebookIds: string[] = [];
  const forcedTools: string[] = [];
  const seenNotebooks = new Set<string>();
  const seenTools = new Set<string>();
  const mentionSpans: [number, number][] = [];

  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((match = MENTION_RE.exec(text)) !== null) {
    const alias = match[1];
    const mentionable = resolveMentionable(alias);
    if (!mentionable) continue;

    if (mentionable.type === 'agent') {
      agentId = mentionable.identifier;
    } else if (mentionable.type === 'tool') {
      if (!seenTools.has(mentionable.identifier)) {
        seenTools.add(mentionable.identifier);
        forcedTools.push(mentionable.identifier);
      }
    } else if (!seenNotebooks.has(mentionable.identifier)) {
      seenNotebooks.add(mentionable.identifier);
      notebookIds.push(mentionable.identifier);
    }

    // Record the span to strip. The match might include a leading space.
    const atIndex = match.index + match[0].indexOf('@');
    mentionSpans.push([atIndex, atIndex + alias.length + 1]); // +1 for @
  }

  // Strip resolved mentions from text (reverse order to preserve indices)
  let cleanText = text;
  for (let i = mentionSpans.length - 1; i >= 0; i--) {
    const [start, end] = mentionSpans[i];
    cleanText = cleanText.slice(0, start) + cleanText.slice(end);
  }
  cleanText = cleanText.replace(/\s{2,}/g, ' ').trim();

  return {
    agentId: agentId ?? getDefaultAgent(),
    notebookIds,
    forcedTools,
    cleanText,
  };
}

/**
 * Parse a single @-mention at the start of a message text (legacy).
 */
export function parseMention(text: string): MentionResult | null {
  const singleRe = /^\s*@(\S+)\s*/;
  const match = singleRe.exec(text);
  if (!match) return null;

  const mentionable = resolveMentionable(match[1]);
  if (!mentionable || mentionable.type !== 'agent') return null;

  return {
    agentId: mentionable.identifier,
    cleanText: text.slice(match[0].length),
  };
}

/**
 * Extract agent routing from message text.
 * Falls back to the default agent if no valid @-mention is found.
 */
export function extractAgentFromMessage(text: string): MentionResult {
  const { agentId, cleanText } = parseAllMentions(text);
  return { agentId, cleanText };
}
