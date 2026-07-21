/**
 * Durable mention tokens: `@[Label](type:identifier)`.
 *
 * Mentions used to be stripped from the message text on send, leaving only
 * per-request fields — the persisted history carried no trace of "@tally".
 * Instead, resolved mentions are rewritten into these tokens, which persist in
 * chat_messages.content and are the single source of truth: the backend derives
 * the routing fields from them, the UI renders them as chips, and LLM/heuristic
 * consumers get sanitized views (`label` = "@Label", `remove` = gone).
 *
 * Tokens are user-typed text at the end of the day — NEVER trust the embedded
 * ids without the downstream ownership/access checks.
 */

export type MentionTokenType = 'tool' | 'mcp' | 'notebook' | 'board' | 'sheet' | 'doc' | 'agent';

export interface MentionToken {
  label: string;
  type: MentionTokenType;
  id: string;
  /** Raw token text as it appears in the message. */
  raw: string;
  /** Start offset of the token in the source text. */
  index: number;
}

const TYPE_ALTERNATION = 'tool|mcp|notebook|board|sheet|doc|agent';
// Label: no ] or newline, bounded. Id: conservative charset, bounded — notably
// NO ')' so the token always terminates, and ':' allowed for nested identifiers.
const MENTION_TOKEN_SOURCE = `@\\[([^\\]\\n]{1,80})\\]\\((${TYPE_ALTERNATION}):([A-Za-z0-9:_.\\-]{1,128})\\)`;

/** Fresh regex per use — the `g` flag makes shared instances stateful. */
export function mentionTokenRegex(): RegExp {
  return new RegExp(MENTION_TOKEN_SOURCE, 'g');
}

export function buildMentionToken(label: string, type: MentionTokenType, id: string): string {
  // Keep the label renderable inside the token grammar; the id charset is the
  // caller's contract (identifiers in this codebase are slugs/uuids already).
  const safeLabel =
    label
      .replace(/[\]\n]/g, ' ')
      .trim()
      .slice(0, 80) || type;
  return `@[${safeLabel}](${type}:${id})`;
}

export function parseMentionTokens(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  const re = mentionTokenRegex();
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({
      label: match[1]!,
      type: match[2] as MentionTokenType,
      id: match[3]!,
      raw: match[0],
      index: match.index,
    });
  }
  return tokens;
}

/**
 * Sanitize tokens out of a text.
 * - `label`: token → `@Label` — readable for LLM prompts, classifier history,
 *   titles/tags/memory.
 * - `remove`: token gone entirely — for regex heuristics (sharepic/reel edit
 *   verbs would false-positive on labels like "Bild generieren") and for
 *   embedding inputs (recall vectors).
 */
export function sanitizeMentionTokens(text: string, mode: 'label' | 'remove'): string {
  const re = mentionTokenRegex();
  const out = text.replace(re, (_raw, label: string) => (mode === 'label' ? `@${label}` : ''));
  if (mode === 'label') return out;
  return out
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+\n/g, '\n')
    .replace(/\n[^\S\n]+/g, '\n')
    .trim();
}

export function hasMentionTokens(text: string): boolean {
  return mentionTokenRegex().test(text);
}
