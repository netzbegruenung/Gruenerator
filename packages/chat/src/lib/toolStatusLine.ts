// Which tool calls live in the shimmering status line instead of their own card.
//
// Platform-neutral (zero react/DOM imports) so web and mobile share one rule:
// web via GrueneratorToolUIs / ToolCallGroup / StreamingStatusLine, mobile via
// ToolCallPart / ChatProgressIndicator.

import { resolveToolEntry } from './toolRegistry';
import { getToolMeta, getToolQuery } from './toolResults';

import type { PartLike } from './narrationView';
import type { SerializableCitation } from '../components/tool-ui/citation/schema';

/**
 * Retrieval tools that get NO card. A search pill only ever said "ich suche
 * gerade", and its hits are re-surfaced in the message's Quellen-Liste
 * (`SearchResultsSection`) — so the running search belongs in the one shimmer
 * line above the answer, ChatGPT-style, and nothing is left behind once the
 * answer arrives.
 *
 * Deliberately NOT in here, because their card IS the result and has no second
 * surface: `research` (the written Deep-Research report), `scrape_url` (link
 * preview), the personal-content tools (`find_content`, `documents`,
 * `notebooks`, `boards_tasks`, `groups`, `media`, `search_user_content`,
 * `search_chat_history`), and everything that produces an artifact.
 */
const SEARCH_PROGRESS_TOOLS: ReadonlySet<string> = new Set([
  'web_search',
  'gruenerator_search',
  'gruenerator_docs_search',
  'search_sources',
  'bundestag',
  // Same shape and role as `bundestag` — {resultCount, sources}, hits re-surface
  // in the message's Quellen-Liste — so they belong in the line, not in a card.
  'abgeordnetenwatch',
  // Attachment readers: the turn's own documents. A card per slice would narrate
  // the plumbing of a document the user attached themselves.
  'dokumente_lesen',
  'expand_attachment',
]);

/** Whether this tool reports through the status line instead of a card. */
export function isSearchProgressTool(toolName: string): boolean {
  return SEARCH_PROGRESS_TOOLS.has(toolName);
}

/** Message-part shape the selectors below read (assistant-ui `message.parts`). */
export interface StatusPartLike extends PartLike {
  readonly text?: unknown;
  readonly args?: unknown;
  readonly result?: unknown;
}

/** Longest query echoed in the status line before it is elided. */
const MAX_QUERY_CHARS = 60;

const ELLIPSIS = '…';

/**
 * Drop trailing ellipses (the server often sends an already-elided query, and
 * appending our own would read `„Klimageld……"`).
 *
 * Deliberately a loop, not `/…+$/`. An end-anchored `+` backtracks: for a string
 * of N ellipses that fails the anchor, the engine retries from every start
 * position, which is quadratic in N — CodeQL `js/polynomial-redos`, and the input
 * is a tool argument, so its length is not ours to bound. Scanning from the end
 * is linear and needs no reasoning about the engine.
 */
function stripTrailingEllipses(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === ELLIPSIS) end--;
  return value.slice(0, end);
}

/**
 * The status-line label for one retrieval step, e.g. `Websuche „Wer war Marilyn
 * Monroe?"`. Without a usable query it degrades to the bare tool label.
 */
export function searchStatusLabel(toolName: string, query: string | null): string {
  const label = getToolMeta(toolName).label;
  const q = stripTrailingEllipses((query ?? '').trim()).trim();
  // `tool_step_start` falls back to the card TITLE as `query` when the server
  // sends no args — „Websuche „Websuche"" reads like a bug, so drop it.
  if (!q || q.toLowerCase() === label.toLowerCase()) return label;
  const shown = q.length > MAX_QUERY_CHARS ? `${q.slice(0, MAX_QUERY_CHARS)}…` : q;
  return `${label} „${shown}“`;
}

/**
 * Label for the retrieval step that is still running, newest first, or null.
 * A finished step returns null on purpose: the next stage ("Formuliere
 * Antwort…") owns the line from then on.
 */
export function selectSearchStatusLabel(parts: ReadonlyArray<StatusPartLike>): string | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.type !== 'tool-call') continue;
    const name = part.toolName;
    if (!name || !isSearchProgressTool(name)) continue;
    if (part.result != null) return null;
    return searchStatusLabel(name, getToolQuery(part.args));
  }
  return null;
}

/**
 * Whether the message still renders a tool CARD. Search steps no longer do, so
 * a search-only turn must keep the status line the way a tool-less turn does.
 */
export function selectHasVisibleToolCard(parts: ReadonlyArray<StatusPartLike>): boolean {
  return parts.some(
    (p) => p.type === 'tool-call' && !!p.toolName && !isSearchProgressTool(p.toolName)
  );
}

/** The tool names that still produce a card — the basis for all group chrome. */
export function visibleToolNames(toolNames: ReadonlyArray<string>): ReadonlyArray<string> {
  return toolNames.filter((name) => !isSearchProgressTool(name));
}

/**
 * Whether the turn took a step AFTER its answer text had already begun — the
 * signature of a multi-step agentic turn, where the first prose is not the end
 * of the work but a preamble between tool calls.
 *
 * The status line normally retires at the first token, on the assumption that
 * text means the turn has stopped working. In the agentic loop that assumption
 * is wrong: the model writes, calls a tool, thinks, writes again — and the line
 * (which carries BOTH the stage label and the thinking dropdown) was gone from
 * the first token on, so every step past the first had no surface at all.
 *
 * Read off the part ORDER, which the adapter keeps in true event order, so this
 * needs no extra state and can only flip on: parts are append-only while the
 * message streams. Empty text parts don't count — `buildResult` appends a
 * trailing empty one after every card.
 */
export function selectStepAfterText(parts: ReadonlyArray<StatusPartLike>): boolean {
  let sawText = false;
  for (const part of parts) {
    if (part.type === 'text') {
      if (typeof part.text === 'string' && part.text.length > 0) sawText = true;
    } else if (part.type === 'tool-call' && sawText) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// What the status line can drop down to show. Both selectors read the SAME
// message parts the line already lives on, so the panel and the label can never
// disagree about which turn they describe.
// ---------------------------------------------------------------------------

/**
 * The model's thinking so far, or null. Reasoning is never persisted (no thread
 * storage writes it), so this only ever has content mid-stream — which is
 * exactly as long as the status line lives.
 */
export function selectReasoningText(parts: ReadonlyArray<StatusPartLike>): string | null {
  const text = parts
    .filter((p) => p.type === 'reasoning' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
  return text.trim().length > 0 ? text : null;
}

/** Most sources the dropdown lists before it stops — a panel, not an archive. */
const MAX_PANEL_SOURCES = 8;

/**
 * What the retrieval steps have found so far, deduped by URL. Parsed through
 * the shared registry, so each tool's own citation shape is honoured rather
 * than re-guessed here.
 */
export function selectSearchSources(
  parts: ReadonlyArray<StatusPartLike>
): ReadonlyArray<SerializableCitation> {
  const seen = new Set<string>();
  const sources: SerializableCitation[] = [];
  for (const part of parts) {
    if (part.type !== 'tool-call' || !part.toolName) continue;
    if (!isSearchProgressTool(part.toolName) || part.result == null) continue;
    const vm = resolveToolEntry(part.toolName).parse(part.args, part.result);
    if (vm.kind !== 'citations') continue;
    for (const citation of vm.citations) {
      const key = citation.href || citation.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      sources.push(citation);
      if (sources.length >= MAX_PANEL_SOURCES) return sources;
    }
  }
  return sources;
}
