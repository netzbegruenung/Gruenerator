import { resolveAgentMention, getDefaultAgent } from './agents';

export interface MentionResult {
  agentId: string;
  cleanText: string;
}

const MENTION_RE = /^\s*@(\S+)\s*/;

/**
 * Parse an @-mention at the start of a message text.
 * Returns the resolved agentId and text with the mention stripped,
 * or null if no valid mention was found.
 */
export function parseMention(text: string): MentionResult | null {
  const match = MENTION_RE.exec(text);
  if (!match) return null;

  const alias = match[1];
  const agentId = resolveAgentMention(alias);
  if (!agentId) return null;

  return {
    agentId,
    cleanText: text.slice(match[0].length),
  };
}

/**
 * Extract agent routing from message text.
 * Falls back to the default agent if no valid @-mention is found.
 */
export function extractAgentFromMessage(text: string): MentionResult {
  return parseMention(text) ?? { agentId: getDefaultAgent(), cleanText: text };
}
