/**
 * Notebook conversation history — normalization, turn-granular budgeting and
 * carry-over of previously cited sources.
 *
 * `ultra` is the only depth tier that puts history in the PROMPT (see
 * notebookDepthProfiles). `deep` reads history too, but only to rewrite the
 * search query against it (`buildRewriteTranscript`) — it never reaches the
 * model. Three invariants this module exists to hold:
 *
 * 1. **Messages are never cut in the middle.** A follow-up may refer to the
 *    END of an earlier answer, so a message is either present in full or
 *    absent as a whole turn. The budget trims at turn boundaries only.
 * 2. **Old citation markers never reach the model raw.** `[N]` in an old
 *    answer refers to THAT turn's numbering; against the new turn's source
 *    list it would silently misattribute. Markers are rewritten to the merged
 *    numbering where the message's own citation metadata allows it, and
 *    stripped where it does not.
 * 3. **Previously cited sources stay citable.** Their passages are appended to
 *    the new turn's references map (deduped against fresh retrieval), so
 *    "was stand nochmal in Quelle 3?" has something to point at and the model
 *    can re-cite an old source with a valid, clickable id.
 */

import { CHARS_PER_TOKEN } from './messageHelpers.js';

import type { ReferenceData, ReferencesMap } from '../../../services/search/types.js';

/**
 * Minimal citation shape carried per history message. Mirrors the fields of
 * the persisted/raw notebook citation (snake_case, see notebookCitationSchema
 * in @gruenerator/contracts) that the carry-over actually needs.
 */
export interface NotebookHistoryCitation {
  index: string;
  document_id?: string | undefined;
  document_title?: string | undefined;
  title?: string | undefined;
  cited_text?: string | undefined;
  source_url?: string | null | undefined;
  chunk_index?: number | undefined;
  page_number?: number | null | undefined;
  filename?: string | null | undefined;
  similarity_score?: number | undefined;
  collection_id?: string | undefined;
  collection_name?: string | undefined;
  date?: string | null | undefined;
}

export interface NotebookHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: NotebookHistoryCitation[] | undefined;
}

/** Share of the model's window the conversation history may occupy. */
const HISTORY_WINDOW_SHARE = 0.2;
/** Floor so an unknown window still allows a couple of turns. */
const MIN_HISTORY_BUDGET_TOKENS = 8000;
/**
 * Hard bound for the always-kept newest turn: if even that single turn
 * exceeds half the window, history is dropped entirely rather than handed to
 * a lane that would truncate it silently (verdigado cuts at ~64k without an
 * error — see lane measurements).
 */
const NEWEST_TURN_WINDOW_SHARE = 0.5;

/** Assistant messages (newest first) whose citations are carried over. */
const CARRY_MAX_ASSISTANT_MESSAGES = 3;
/** Cap on carried sources appended to the references map, after dedupe. */
const CARRY_MAX_SOURCES = 12;

/**
 * Inline citation markers in both wire forms: `[cite:12]` (persisted answers)
 * and `[3]` / `[1, 4]` (normalized display text). Rebuilt per use — a shared
 * /g regex carries `lastIndex` between calls.
 */
const HISTORY_MARKER_PATTERN = /\[cite:(\d+)\]|\[(\d+(?:\s*,\s*\d+)*)\]/g;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Normalize raw wire messages (untrusted, loosely typed) into history
 * messages. Tolerates `content` as string or as an AI-SDK style parts array;
 * keeps only non-empty user/assistant messages.
 */
export function normalizeNotebookHistory(raw: readonly unknown[]): NotebookHistoryMessage[] {
  const out: NotebookHistoryMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const msg = entry as Record<string, unknown>;
    const role = msg.role;
    if (role !== 'user' && role !== 'assistant') continue;

    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter(
          (p): p is { type: 'text'; text: string } =>
            !!p &&
            typeof p === 'object' &&
            (p as { type?: unknown }).type === 'text' &&
            typeof (p as { text?: unknown }).text === 'string'
        )
        .map((p) => p.text)
        .join('');
    }
    content = content.trim();
    if (!content) continue;

    let citations: NotebookHistoryCitation[] | undefined;
    if (Array.isArray(msg.citations)) {
      const cleaned = msg.citations.filter(
        (c): c is NotebookHistoryCitation =>
          !!c && typeof c === 'object' && typeof (c as { index?: unknown }).index === 'string'
      );
      if (cleaned.length > 0) citations = cleaned;
    }

    out.push({ role, content, ...(citations && { citations }) });
  }
  return out;
}

export interface PreparedNotebookHistory {
  messages: NotebookHistoryMessage[];
  /** Whole turns dropped at the old end (0 = complete history). */
  droppedTurns: number;
}

/**
 * Trim history to a share of the model's window, at turn boundaries only.
 *
 * A turn is a user message plus the assistant messages that follow it. Turns
 * are kept newest-first while they fit; the newest turn is kept even when it
 * alone exceeds the budget (a follow-up like "fass das kürzer" is useless
 * without the answer it refers to), unless it exceeds half the window.
 */
export function prepareNotebookHistory(
  history: readonly NotebookHistoryMessage[],
  contextWindowTokens?: number
): PreparedNotebookHistory {
  if (history.length === 0) return { messages: [], droppedTurns: 0 };

  const budget = contextWindowTokens
    ? Math.max(MIN_HISTORY_BUDGET_TOKENS, Math.floor(contextWindowTokens * HISTORY_WINDOW_SHARE))
    : MIN_HISTORY_BUDGET_TOKENS;
  const newestTurnCap = contextWindowTokens
    ? Math.floor(contextWindowTokens * NEWEST_TURN_WINDOW_SHARE)
    : MIN_HISTORY_BUDGET_TOKENS * 2;

  // Group into turns: a 'user' message starts a new turn; leading assistant
  // messages (history sliced mid-thread) form their own turn.
  const turns: NotebookHistoryMessage[][] = [];
  for (const msg of history) {
    const current = turns[turns.length - 1];
    if (msg.role === 'user' || !current) {
      turns.push([msg]);
    } else {
      current.push(msg);
    }
  }

  const kept: NotebookHistoryMessage[][] = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const turnTokens = turn.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const isNewest = i === turns.length - 1;
    if (isNewest) {
      if (turnTokens > newestTurnCap) break;
      kept.unshift(turn);
      total += turnTokens;
      continue;
    }
    if (total + turnTokens > budget) break;
    kept.unshift(turn);
    total += turnTokens;
  }

  return { messages: kept.flat(), droppedTurns: turns.length - kept.length };
}

export interface CarriedCitationsMergeResult {
  referencesMap: ReferencesMap;
  /** History with old `[N]`/`[cite:N]` markers rewritten to the merged ids. */
  history: NotebookHistoryMessage[];
  /** Entries appended for previously cited sources, in id order. */
  appended: Array<{ id: string; ref: ReferenceData }>;
}

/**
 * Trust boundary for carried citations: they arrive in the CLIENT payload, and
 * a re-cited carried source is persisted into the thread and rendered by
 * CitationPreview as a plain `<a href>` — threads are shareable, so a hostile
 * `javascript:` URL would execute for OTHER users. Only http(s) URLs pass;
 * free-text fields are length-capped (React escapes them, so scheme is the
 * attack surface — the caps just keep hostile payloads from bloating the
 * prompt and the persisted thread).
 */
function sanitizeCarriedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {
    // not a parseable absolute URL — drop it
  }
  return null;
}

const CARRY_TITLE_MAX_CHARS = 300;
const CARRY_TEXT_MAX_CHARS = 1200;

/** Identity of a cited passage across turns — mirrors the fresh-side dedupe. */
function carryKey(c: {
  document_id?: string | undefined;
  chunk_index?: number | null | undefined;
  source_url?: string | null | undefined;
  title?: string | undefined;
}): string | null {
  if (c.document_id) return `doc:${c.document_id}:${c.chunk_index ?? 'x'}`;
  if (c.source_url) return `url:${c.source_url}`;
  if (c.title) return `title:${c.title}`;
  return null;
}

/**
 * Merge the sources cited in recent assistant answers into the new turn's
 * references map and rewrite the history's citation markers accordingly.
 *
 * Fresh retrieval keeps the low numbers (ranking stays decisive); carried
 * sources are appended behind them, capped, and deduped so a re-retrieved
 * source is one entry, not two. Markers that cannot be mapped (no citation
 * metadata for that message, or the id is unknown) are stripped — an
 * unmapped old number in front of the new source list is worse than none.
 */
export function mergeCarriedCitations(
  referencesMap: ReferencesMap,
  history: readonly NotebookHistoryMessage[]
): CarriedCitationsMergeResult {
  const merged: ReferencesMap = { ...referencesMap };

  const keyToId = new Map<string, string>();
  let maxId = 0;
  for (const [id, ref] of Object.entries(merged)) {
    const numeric = Number(id);
    if (Number.isFinite(numeric)) maxId = Math.max(maxId, numeric);
    const key = carryKey({ ...ref, title: ref.title });
    if (key && !keyToId.has(key)) keyToId.set(key, id);
  }

  const appended: Array<{ id: string; ref: ReferenceData }> = [];

  // Per-message old-index → merged-id mapping, keyed by message array index.
  const perMessageMapping = new Map<number, Map<string, string>>();

  let carriedFromMessages = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== 'assistant') continue;
    if (!msg.citations || msg.citations.length === 0) continue;
    if (carriedFromMessages >= CARRY_MAX_ASSISTANT_MESSAGES) break;
    carriedFromMessages++;

    const mapping = new Map<string, string>();
    for (const citation of msg.citations) {
      const key = carryKey(citation);
      if (!key) continue;

      let id = keyToId.get(key);
      if (!id) {
        if (appended.length >= CARRY_MAX_SOURCES) continue;
        maxId++;
        id = String(maxId);
        const citedText = (citation.cited_text || '').slice(0, CARRY_TEXT_MAX_CHARS);
        const ref: ReferenceData = {
          title: (citation.document_title || citation.title || 'Frühere Quelle').slice(
            0,
            CARRY_TITLE_MAX_CHARS
          ),
          snippets: [[citedText]],
          ...(citedText && { chunk_text: citedText }),
          description: null,
          date: citation.date ?? null,
          source: 'qa_history_carryover',
          document_id: (citation.document_id || '').slice(0, CARRY_TITLE_MAX_CHARS),
          source_url: sanitizeCarriedUrl(citation.source_url),
          filename: citation.filename?.slice(0, CARRY_TITLE_MAX_CHARS) ?? null,
          similarity_score: citation.similarity_score ?? 0,
          chunk_index: citation.chunk_index ?? 0,
          page_number: citation.page_number ?? null,
          ...(citation.collection_id && {
            collection_id: citation.collection_id.slice(0, CARRY_TITLE_MAX_CHARS),
          }),
          ...(citation.collection_name && {
            collection_name: citation.collection_name.slice(0, CARRY_TITLE_MAX_CHARS),
          }),
        };
        merged[id] = ref;
        keyToId.set(key, id);
        appended.push({ id, ref });
      }
      mapping.set(citation.index, id);
    }
    if (mapping.size > 0) perMessageMapping.set(i, mapping);
  }

  const rewritten = history.map((msg, i) => {
    if (msg.role !== 'assistant') return msg;
    const mapping = perMessageMapping.get(i);
    return { ...msg, content: rewriteMarkers(msg.content, mapping) };
  });

  return { referencesMap: merged, history: rewritten, appended };
}

/**
 * Rewrite `[cite:N]` and `[N]`/`[N, M]` markers via the given mapping; ids
 * without a mapping are dropped, and a marker whose ids all fail to map is
 * removed entirely (never left pointing at the wrong source).
 */
function rewriteMarkers(content: string, mapping: Map<string, string> | undefined): string {
  const pattern = new RegExp(HISTORY_MARKER_PATTERN);
  return content
    .replace(pattern, (_full, citeId: string | undefined, plainIds: string | undefined) => {
      const ids = citeId != null ? [citeId] : (plainIds ?? '').split(',').map((s) => s.trim());
      const mappedIds = mapping
        ? ids.map((id) => mapping.get(id)).filter((id): id is string => !!id)
        : [];
      return mappedIds.length > 0 ? `[${mappedIds.join(', ')}]` : '';
    })
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ');
}

/** Head+tail slice for the rewrite transcript — keeps the ending visible. */
function headTail(text: string, head: number, tail: number): string {
  if (text.length <= head + tail + 20) return text;
  return `${text.slice(0, head)}\n[...]\n${text.slice(-tail)}`;
}

/**
 * Compact transcript of the most recent turns for the retrieval query
 * rewrite. This feeds an internal LLM call that resolves references ("und in
 * Bayern?" → standalone query) — NOT the generation context, so head+tail
 * excerpting is fine here; the ending stays visible because follow-ups often
 * refer to it.
 */
export function buildRewriteTranscript(history: readonly NotebookHistoryMessage[]): string {
  const MAX_TURN_MESSAGES = 4;
  const recent = history.slice(-MAX_TURN_MESSAGES);
  return recent
    .map((msg) => {
      const label = msg.role === 'user' ? 'Nutzer*in' : 'Assistent';
      const text =
        msg.role === 'assistant'
          ? headTail(rewriteMarkers(msg.content, undefined), 1200, 1200)
          : msg.content.slice(0, 600);
      return `${label}: ${text}`;
    })
    .join('\n\n');
}
