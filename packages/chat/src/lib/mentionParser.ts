import { getDefaultAgent } from './agents';
import { resolveDocumentSlug } from './documentMentionables';
import { resolveMentionable } from './mentionables';

export interface MentionResult {
  agentId: string;
  cleanText: string;
}

export interface ParsedMentions {
  agentId: string;
  notebookIds: string[];
  forcedTools: string[];
  documentIds: string[];
  textIds: string[];
  documentChatIds: string[];
  cleanText: string;
}

const MENTION_RE = /(?:^|\s)([@/])(\S+)/g;

/**
 * Parse all @-mentions and /mentions in a message text.
 *
 * Routing rules:
 * - /alias → resolve as agent (skill) → sets agentId
 * - @alias → resolve as tool/notebook/document (function)
 * - @alias that resolves to an agent → still accepted (backward compat for saved threads)
 * - @datei:slug → resolve as document reference
 *
 * Agents: uses the last agent found (or default).
 * Notebooks: collects all unique notebook IDs.
 * Strips all resolved mentions from the text.
 */
export function parseAllMentions(text: string): ParsedMentions {
  let agentId: string | null = null;
  const notebookIds: string[] = [];
  const forcedTools: string[] = [];
  const documentIds: string[] = [];
  const textIds: string[] = [];
  const seenNotebooks = new Set<string>();
  const seenTools = new Set<string>();
  const seenDocuments = new Set<string>();
  const seenTexts = new Set<string>();
  const mentionSpans: [number, number][] = [];

  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((match = MENTION_RE.exec(text)) !== null) {
    const trigger = match[1]; // '@' or '/'
    const alias = match[2];

    // Handle @datei:slug document mentions — route by sourceType (@ only)
    if (trigger === '@' && alias.startsWith('datei:')) {
      const slug = alias.slice(6); // strip 'datei:'
      const doc = resolveDocumentSlug(slug);
      if (doc) {
        if (doc.sourceType === 'text') {
          if (!seenTexts.has(doc.documentId)) {
            seenTexts.add(doc.documentId);
            textIds.push(doc.documentId);
          }
        } else {
          if (!seenDocuments.has(doc.documentId)) {
            seenDocuments.add(doc.documentId);
            documentIds.push(doc.documentId);
          }
        }
      }
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]); // +1 for @
      continue;
    }

    // Handle bare @datei trigger (just strip it, don't add to documentIds)
    if (trigger === '@' && alias === 'datei') {
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    // Handle bare @dokumentchat trigger (strip from text; actual IDs come from the store)
    if (trigger === '@' && alias === 'dokumentchat') {
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    const mentionable = resolveMentionable(alias);
    if (!mentionable) continue;

    if (trigger === '/') {
      // /alias → always treat as agent (skill)
      if (mentionable.type === 'agent') {
        agentId = mentionable.identifier;
      }
      // If /alias resolves to a non-agent, ignore it (/ is only for skills)
    } else {
      // @alias → route by type
      if (mentionable.type === 'agent') {
        // Backward compat: @agent still works for saved threads
        agentId = mentionable.identifier;
      } else if (mentionable.type === 'tool') {
        if (!seenTools.has(mentionable.identifier)) {
          seenTools.add(mentionable.identifier);
          forcedTools.push(mentionable.identifier);
        }
      } else if (mentionable.type === 'notebook') {
        if (!seenNotebooks.has(mentionable.identifier)) {
          seenNotebooks.add(mentionable.identifier);
          notebookIds.push(mentionable.identifier);
        }
      }
    }

    // Record the span to strip. The match might include a leading space.
    const triggerIndex = match.index + match[0].indexOf(trigger);
    mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]); // +1 for trigger char
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
    documentIds,
    textIds,
    documentChatIds: [],
    cleanText,
  };
}

/**
 * Parse a single @-mention or /mention at the start of a message text (legacy).
 */
export function parseMention(text: string): MentionResult | null {
  const singleRe = /^\s*[/@](\S+)\s*/;
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
 * Falls back to the default agent if no valid mention is found.
 */
export function extractAgentFromMessage(text: string): MentionResult {
  const { agentId, cleanText } = parseAllMentions(text);
  return { agentId, cleanText };
}
