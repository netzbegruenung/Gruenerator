/**
 * The pure projections over a thread's persisted `tool_results` rows, newest
 * first. Split from `threadPersistenceService` (which reads them from Postgres)
 * so the integration harness's in-memory thread store can build the same tool
 * history from its own messages instead of returning an empty one.
 */

import { type PersistedStep } from './agenticLoop/types.js';
import { documentContextKind } from './artifactGeneration.js';
import { sharepicVariantCall } from './sharepicToolCalls.js';

import type { SearchResult, ThreadToolContext } from '../../../agents/langgraph/ChatGraph/types.js';

/** The `tool_results` keys these projections read. */
export interface ToolStepRow {
  toolCalls?: unknown;
  searchResults?: unknown[] | null;
}

/**
 * How deep each projection looks into the thread. Four functions used to run
 * the SAME query — `thread_id`, `role='assistant'`, `tool_results IS NOT NULL`,
 * newest first — differing in nothing but this number, and a single loop turn
 * fired three of them.
 *
 * The windows stay PER PROJECTION on purpose. The widest is read once and each
 * projection slices its own depth, so unifying the read does not quietly change
 * how far back replay or source rehydration reaches. Whether artifacts really
 * need 20 where sources get 12 is a product question; this is not the change
 * that answers it.
 */
export const ROW_WINDOW = {
  artifacts: 20,
  toolSteps: 12,
  sources: 12,
  lastImage: 10,
} as const;

export function toToolSteps(rows: ToolStepRow[], limit: number): PersistedStep[] {
  // Newest first throughout, then one reverse: rows come newest first, but a
  // row's calls are stored in call order, so they are walked backwards here.
  // Walking them forwards reversed the order inside a turn and made the
  // turn's FIRST call look like its newest.
  const steps: PersistedStep[] = [];
  for (const row of rows.slice(0, ROW_WINDOW.toolSteps)) {
    const calls = (Array.isArray(row.toolCalls) ? row.toolCalls : []) as PersistedStep[];
    for (const c of [...calls].reverse()) {
      if (c && typeof c === 'object' && typeof (c as PersistedStep).toolName === 'string') {
        steps.push(c);
      }
    }
    if (steps.length >= limit) break;
  }
  return steps.slice(0, limit).reverse();
}

/**
 * Newest first, in two passes. First what the answers CITED (the `cited` stamp
 * of `SourceRegistry.getResults`), then everything else.
 *
 * One pass by recency let a single intervening search evict the research the
 * conversation stood on. Live 07.11.2026 (#5458): turn A found and cited
 * Stöglehner, turn B ran a forced search on another topic, and turn C
 * rehydrated B's ten hits. It then told the user its own answer from turn A was
 * unfounded ("nimm diese Angaben bitte zurück").
 *
 * Rows from before the stamp carry no `cited`, so they read exactly as before.
 */
export function toSources(rows: ToolStepRow[], limit: number): SearchResult[] {
  const window = rows
    .slice(0, ROW_WINDOW.sources)
    .map((row) => (Array.isArray(row.searchResults) ? row.searchResults : []) as SearchResult[]);
  const collected: SearchResult[] = [];
  const seen = new Set<string>();
  for (const citedOnly of [true, false]) {
    for (const results of window) {
      for (const r of results) {
        if (!r || typeof r !== 'object') continue;
        if (citedOnly && r.cited !== true) continue;
        if (typeof r.content !== 'string' || r.content.trim() === '') continue;
        const key = `${r.url ?? ''}::${r.title ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(r);
        if (collected.length >= limit) return collected;
      }
    }
  }
  return collected;
}

/**
 * The artifacts a thread holds, newest first, one per message, deduped by kind
 * and ref. Rebuilt from the same message metadata the cards rehydrate from; see
 * `listThreadArtifacts`.
 */
export function toArtifacts(rows: ArtifactMetadataShape[], limit: number): ThreadToolContext[] {
  const artifacts: ThreadToolContext[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, ROW_WINDOW.artifacts)) {
    const artifact = artifactFromMessageMetadata(row);
    if (!artifact) continue;
    // Two turns editing the same document are one artifact. A sharepic carries
    // no stable id across turns, so its kind alone dedupes — the thread's
    // sharepic is a single editable thing, not one per refinement.
    const key = `${artifact.kind}:${artifact.ref ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    artifacts.push(artifact);
    if (artifacts.length >= limit) break;
  }
  return artifacts;
}

export interface ArtifactMetadataShape {
  generatedImage?: { url?: string; prompt?: string } | null;
  createdDocument?: { documentId?: string; title?: string; subtype?: string } | null;
  toolCalls?: Array<{
    toolName?: string;
    result?: { variants?: Array<{ initialProps?: Record<string, unknown> }> };
  }> | null;
}

/** The one artifact an assistant message produced, or null for a plain turn. */
function artifactFromMessageMetadata(meta: unknown): ThreadToolContext | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as ArtifactMetadataShape;

  const imageUrl = m.generatedImage?.url;
  if (typeof imageUrl === 'string' && imageUrl) {
    return { kind: 'image', ref: imageUrl, label: labelOf(m.generatedImage?.prompt) };
  }

  const variant = sharepicVariantCall(m.toolCalls)?.result?.variants?.[0];
  if (variant) {
    const p = variant.initialProps ?? {};
    const text = [p['line1'], p['line2'] ?? p['accent'], p['line3'], p['quote'], p['header']]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ');
    return { kind: 'sharepic', ref: null, label: labelOf(text) };
  }

  const doc = m.createdDocument;
  if (doc?.documentId) {
    const kind = documentContextKind(doc.subtype ?? '');
    return { kind, ref: doc.documentId, label: labelOf(doc.title) };
  }
  return null;
}

/** Short, single-line label for prompt injection; null when there is nothing to show. */
function labelOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 60) : null;
}
