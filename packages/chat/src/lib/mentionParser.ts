import { buildMentionToken, type MentionTokenType } from '@gruenerator/shared/utils';

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
  sheetIds: string[];
  docMentionIds: string[];
  wolkeFiles: WolkeFileToken[];
  connectFiles: ConnectFileToken[];
  unresolvedMentions: string[];
  cleanText: string;
  /** Text with resolved mentions rewritten as durable @[Label](type:id) tokens
   *  (payload mentions like @wolke:/@connect:/@datei: stay stripped — they ride
   *  attachments/fields). This is what actually gets sent + persisted. */
  tokenText: string;
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
  const sheetIds: string[] = [];
  const docMentionIds: string[] = [];
  const wolkeFiles: WolkeFileToken[] = [];
  const connectFiles: ConnectFileToken[] = [];
  const seenNotebooks = new Set<string>();
  const seenTools = new Set<string>();
  const seenDocuments = new Set<string>();
  const seenTexts = new Set<string>();
  const seenBoards = new Set<string>();
  const seenSheets = new Set<string>();
  const seenDocMentions = new Set<string>();
  const seenWolke = new Set<string>();
  const seenConnect = new Set<string>();
  const unresolvedMentions: string[] = [];
  // [start, end, tokenReplacement?] — no replacement = strip in both forms.
  const mentionSpans: [number, number, string?][] = [];

  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;

  while ((match = MENTION_RE.exec(text)) !== null) {
    const trigger = match[1]; // '@' or '/'
    const alias = match[2];

    // Already-durable token (@[Label](type:id), e.g. from edit-resubmit of a
    // tokenized message) — leave untouched; the backend derives from it.
    if (trigger === '@' && alias.startsWith('[')) {
      continue;
    }

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

    // Handle bare @vorlagen trigger (popover hint — strip, no payload). Picked
    // templates are inserted as plain markdown links, like @canva.
    if (trigger === '@' && alias === 'vorlagen') {
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
      } else if (mentionable.type === 'sheet') {
        if (mentionable.identifier === 'sheet-erstellen') {
          addUnique(seenTools, forcedTools, mentionable.identifier);
        } else {
          addUnique(seenSheets, sheetIds, mentionable.identifier);
        }
      } else if (mentionable.type === 'presentation') {
        // Only the create-tool exists for presentations today (no @deck mentions).
        addUnique(seenTools, forcedTools, mentionable.identifier);
      } else if (mentionable.type === 'doc') {
        if (mentionable.identifier === 'dokument-erstellen') {
          addUnique(seenTools, forcedTools, mentionable.identifier);
        } else {
          addUnique(seenDocMentions, docMentionIds, mentionable.identifier);
        }
      }
    }

    // Record the span. Routed @-mentions become durable tokens; /skill spans
    // stay stripped (the skill's prompt fragment rides activeSkillMention).
    const triggerIndex = match.index + match[0].indexOf(trigger);
    const token = trigger === '@' ? mentionTokenFor(mentionable) : undefined;
    mentionSpans.push([triggerIndex, triggerIndex + alias.length + 1, token]); // +1 for trigger char
  }

  // Rewrite spans (reverse order to preserve indices): cleanText strips all,
  // tokenText keeps routed mentions as durable tokens.
  let cleanText = text;
  let tokenText = text;
  for (let i = mentionSpans.length - 1; i >= 0; i--) {
    const [start, end, token] = mentionSpans[i];
    cleanText = cleanText.slice(0, start) + cleanText.slice(end);
    tokenText = tokenText.slice(0, start) + (token ?? '') + tokenText.slice(end);
  }
  cleanText = cleanText.replace(/\s{2,}/g, ' ').trim();
  tokenText = tokenText.replace(/[^\S\n]{2,}/g, ' ').trim();

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
    sheetIds,
    docMentionIds,
    wolkeFiles,
    connectFiles,
    unresolvedMentions,
    cleanText,
    tokenText,
  };
}

/**
 * Durable token for a routed @-mention (see @gruenerator/shared mentionTokens).
 * mcp servers hide inside tool identifiers as `mcp:<serverId>`; the create-*
 * pseudo-mentions (board-erstellen, …) act as tools. Returns undefined for
 * types that have no durable form (payload mentions handled earlier).
 */
function mentionTokenFor(m: {
  type: string;
  identifier: string;
  title: string;
}): string | undefined {
  const build = (type: MentionTokenType, id: string) => buildMentionToken(m.title, type, id);
  switch (m.type) {
    case 'tool':
      return m.identifier.startsWith('mcp:')
        ? build('mcp', m.identifier.slice(4))
        : build('tool', m.identifier);
    case 'notebook':
      return build('notebook', m.identifier);
    case 'board':
      return m.identifier === 'board-erstellen'
        ? build('tool', m.identifier)
        : build('board', m.identifier);
    case 'sheet':
      return m.identifier === 'sheet-erstellen'
        ? build('tool', m.identifier)
        : build('sheet', m.identifier);
    case 'presentation':
      return build('tool', m.identifier);
    case 'doc':
      return m.identifier === 'dokument-erstellen'
        ? build('tool', m.identifier)
        : build('doc', m.identifier);
    case 'agent':
      return build('agent', m.identifier);
    default:
      return undefined;
  }
}

export type MentionPreviewKind =
  | 'document'
  | 'doc'
  | 'agent'
  | 'tool'
  | 'notebook'
  | 'board'
  | 'sheet'
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
        alias === 'canva' ||
        alias === 'vorlagen')
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
              : mentionable.type === 'sheet'
                ? 'sheet'
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
