import { getDefaultAgent } from './agents';
import { resolveDocumentSlug } from './documentMentionables';
import {
  decodeWolkeToken,
  decodeConnectToken,
  resolveMentionable,
  type WolkeFileToken,
  type ConnectFileToken,
} from './mentionables';

export interface MentionResult {
  agentId: string;
  cleanText: string;
}

export interface ParsedMentions {
  agentId: string;
  agentMention?: string;
  notebookIds: string[];
  forcedTools: string[];
  documentIds: string[];
  textIds: string[];
  documentChatIds: string[];
  hasDocumentChat: boolean;
  boardIds: string[];
  docMentionIds: string[];
  wolkeFiles: WolkeFileToken[];
  connectFiles: ConnectFileToken[];
  unresolvedMentions: string[];
  cleanText: string;
}

const MENTION_RE = /(?:^|\s)([@/])(\S+)/g;

function addUnique(seen: Set<string>, list: string[], id: string): void {
  if (!seen.has(id)) {
    seen.add(id);
    list.push(id);
  }
}

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
  let agentMention: string | undefined;
  let hasDocumentChat = false;
  const notebookIds: string[] = [];
  const forcedTools: string[] = [];
  const documentIds: string[] = [];
  const textIds: string[] = [];
  const boardIds: string[] = [];
  const docMentionIds: string[] = [];
  const wolkeFiles: WolkeFileToken[] = [];
  const connectFiles: ConnectFileToken[] = [];
  const seenNotebooks = new Set<string>();
  const seenTools = new Set<string>();
  const seenDocuments = new Set<string>();
  const seenTexts = new Set<string>();
  const seenBoards = new Set<string>();
  const seenDocMentions = new Set<string>();
  const seenWolke = new Set<string>();
  const seenConnect = new Set<string>();
  const unresolvedMentions: string[] = [];
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
          addUnique(seenTexts, textIds, doc.documentId);
        } else {
          addUnique(seenDocuments, documentIds, doc.documentId);
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

    // Handle bare @dokumentchat trigger (strip from text; signal via hasDocumentChat flag)
    if (trigger === '@' && alias === 'dokumentchat') {
      hasDocumentChat = true;
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    // Handle @wolke:<base64-token> — decoded into wolkeFiles
    if (trigger === '@' && alias.startsWith('wolke:')) {
      const token = alias.slice(6);
      const ref = decodeWolkeToken(token);
      if (ref) {
        const key = `${ref.shareLinkId}:${ref.path}`;
        if (!seenWolke.has(key)) {
          seenWolke.add(key);
          wolkeFiles.push(ref);
        }
      }
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    // Handle bare @wolke trigger (popover hint — strip, no payload)
    if (trigger === '@' && alias === 'wolke') {
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    // Handle @connect:<base64-token> — decoded into connectFiles
    if (trigger === '@' && alias.startsWith('connect:')) {
      const token = alias.slice(8);
      const ref = decodeConnectToken(token);
      if (ref) {
        const key = `${ref.provider}:${ref.fileId}`;
        if (!seenConnect.has(key)) {
          seenConnect.add(key);
          connectFiles.push(ref);
        }
      }
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    // Handle bare @connect trigger (popover hint — strip, no payload)
    if (trigger === '@' && alias === 'connect') {
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    // Handle bare @canva trigger (popover hint — strip, no payload). Picked
    // designs are inserted as plain markdown links, not @canva: tokens, so
    // there's no payload form to decode here.
    if (trigger === '@' && alias === 'canva') {
      const triggerIndex = match.index + match[0].indexOf('@');
      mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1]);
      continue;
    }

    const mentionable = resolveMentionable(alias);
    if (!mentionable) {
      if (trigger === '@') {
        unresolvedMentions.push(alias);
      }
      continue;
    }

    if (trigger === '/') {
      // /alias → always treat as agent (skill)
      if (mentionable.type === 'agent') {
        agentId = mentionable.identifier;
        agentMention = mentionable.mention;
      }
      // If /alias resolves to a non-agent, ignore it (/ is only for skills)
    } else {
      // @alias → route by type
      if (mentionable.type === 'agent') {
        // Backward compat: @agent still works for saved threads
        agentId = mentionable.identifier;
        agentMention = mentionable.mention;
      } else if (mentionable.type === 'tool') {
        addUnique(seenTools, forcedTools, mentionable.identifier);
      } else if (mentionable.type === 'notebook') {
        addUnique(seenNotebooks, notebookIds, mentionable.identifier);
      } else if (mentionable.type === 'board') {
        if (mentionable.identifier === 'board-erstellen') {
          addUnique(seenTools, forcedTools, mentionable.identifier);
        } else {
          addUnique(seenBoards, boardIds, mentionable.identifier);
        }
      } else if (mentionable.type === 'doc') {
        if (mentionable.identifier === 'dokument-erstellen') {
          addUnique(seenTools, forcedTools, mentionable.identifier);
        } else {
          addUnique(seenDocMentions, docMentionIds, mentionable.identifier);
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
    agentMention,
    notebookIds,
    forcedTools,
    documentIds,
    textIds,
    documentChatIds: [],
    hasDocumentChat,
    boardIds,
    docMentionIds,
    wolkeFiles,
    connectFiles,
    unresolvedMentions,
    cleanText,
  };
}

export type MentionPreviewKind =
  | 'document'
  | 'doc'
  | 'agent'
  | 'tool'
  | 'notebook'
  | 'board'
  | 'wolke'
  | 'connect'
  | 'unresolved';

export interface MentionPreview {
  kind: MentionPreviewKind;
  match: string;
  start: number;
  end: number;
  title: string;
  avatar?: string;
}

/**
 * Extract mentions from `text` along with their display labels (title, avatar)
 * and the substring span needed to remove them. Bare triggers like `@datei`
 * are skipped — only resolved references and unresolved aliases produce chips.
 */
export function extractMentionPreviews(text: string): MentionPreview[] {
  const previews: MentionPreview[] = [];
  MENTION_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(text)) !== null) {
    const trigger = match[1];
    const alias = match[2];
    const triggerIndex = match.index + match[0].indexOf(trigger);
    const end = triggerIndex + alias.length + 1;
    const literal = text.slice(triggerIndex, end);

    // Skip mentions that aren't yet "committed" — i.e. the alias runs to the
    // end of the input without a terminator. These are in-progress as the user
    // types and shouldn't render chips (especially red unresolved ones).
    if (end === text.length) continue;

    if (
      trigger === '@' &&
      (alias === 'datei' ||
        alias === 'dokumentchat' ||
        alias === 'wolke' ||
        alias === 'connect' ||
        alias === 'canva')
    ) {
      continue;
    }

    if (trigger === '@' && alias.startsWith('connect:')) {
      const token = alias.slice(8);
      const ref = decodeConnectToken(token);
      if (ref) {
        previews.push({
          kind: 'connect',
          match: literal,
          start: triggerIndex,
          end,
          title: ref.name,
          avatar: '🔌',
        });
      } else {
        previews.push({
          kind: 'unresolved',
          match: literal,
          start: triggerIndex,
          end,
          title: alias,
        });
      }
      continue;
    }

    if (trigger === '@' && alias.startsWith('wolke:')) {
      const token = alias.slice(6);
      const ref = decodeWolkeToken(token);
      if (ref) {
        previews.push({
          kind: 'wolke',
          match: literal,
          start: triggerIndex,
          end,
          title: ref.name,
          avatar: '☁️',
        });
      } else {
        previews.push({
          kind: 'unresolved',
          match: literal,
          start: triggerIndex,
          end,
          title: alias,
        });
      }
      continue;
    }

    if (trigger === '@' && alias.startsWith('datei:')) {
      const slug = alias.slice(6);
      const doc = resolveDocumentSlug(slug);
      if (doc) {
        previews.push({
          kind: 'document',
          match: literal,
          start: triggerIndex,
          end,
          title: doc.documentTitle,
          avatar: doc.sourceType === 'text' ? '📝' : '📄',
        });
      } else {
        previews.push({
          kind: 'unresolved',
          match: literal,
          start: triggerIndex,
          end,
          title: alias,
        });
      }
      continue;
    }

    const mentionable = resolveMentionable(alias);
    if (!mentionable) {
      if (trigger === '@') {
        previews.push({
          kind: 'unresolved',
          match: literal,
          start: triggerIndex,
          end,
          title: alias,
        });
      }
      continue;
    }

    const kind: MentionPreviewKind =
      mentionable.type === 'agent'
        ? 'agent'
        : mentionable.type === 'tool'
          ? 'tool'
          : mentionable.type === 'notebook'
            ? 'notebook'
            : mentionable.type === 'board'
              ? 'board'
              : mentionable.type === 'doc'
                ? 'doc'
                : 'unresolved';

    previews.push({
      kind,
      match: literal,
      start: triggerIndex,
      end,
      title: mentionable.title,
      avatar: mentionable.avatar,
    });
  }

  return previews;
}

/**
 * Remove a single mention substring (matched by literal text and span) from
 * `text` and collapse adjacent whitespace. Returns the rewritten text.
 */
export function removeMentionFromText(text: string, preview: MentionPreview): string {
  if (text.slice(preview.start, preview.end) !== preview.match) {
    const idx = text.indexOf(preview.match);
    if (idx === -1) return text;
    return collapseSpaces(text.slice(0, idx) + text.slice(idx + preview.match.length));
  }
  return collapseSpaces(text.slice(0, preview.start) + text.slice(preview.end));
}

function collapseSpaces(s: string): string {
  return s.replace(/  +/g, ' ');
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
