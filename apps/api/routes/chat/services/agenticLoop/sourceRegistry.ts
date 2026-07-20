/**
 * Per-turn source accumulator for the agentic loop.
 *
 * Search-family tools push their raw results here as they run. The registry
 * keeps a stable, de-duplicated ordering and is the SINGLE source of the `[N]`
 * numbering: the model is shown numbered snippets (`[N] title — snippet`), and
 * `getCitations()` projects citations in the SAME order with the SAME ids.
 *
 * Critically it does NOT delegate numbering to `buildCitations` — that function
 * groups by document, re-sorts by relevance and caps at 8, none of which
 * preserve the incremental order the model cited against. Instead we project
 * each already-numbered result individually (reusing `buildCitations` per item
 * for the projection shape only) and stamp the registry index as the id. Empty-
 * content results are skipped at register time so a numbered snippet always maps
 * to a real citation (buildCitations drops empty-content sources — skipping them
 * up front keeps `[N]` in lockstep).
 */
import { buildCitations } from '../../../../agents/langgraph/ChatGraph/nodes/citationUtils.js';

import type { Citation, SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';

/** How much of each result's content the model sees per snippet line. It's the
 *  only grounding text the model gets (the tool return drops the raw content),
 *  so keep it generous. */
const SNIPPET_CHARS = 320;

export interface SourceRegistry {
  /** Add raw results (search/web/research/examples). Returns the numbered
   *  snippet block for exactly the newly-added results so the calling tool can
   *  hand it back to the model. */
  register(results: SearchResult[]): string;
  /**
   * Seed sources gathered in EARLIER turns (cross-turn rehydration). These feed
   * ONLY {@link renderReference} (the edit op-planner's grounding) — NOT
   * `renderAll`/`getCitations`/`getResults`, so the synth's `[N]` block, the
   * citation UI, and persistence stay this-turn-only (no dangling citations, no
   * fresh sources pushed out of the capped persistence slice).
   */
  seedCarried(results: SearchResult[]): void;
  /** All accumulated results in stable order (capped), for persistence/UI. */
  getResults(limit?: number): SearchResult[];
  /** The full numbered snippet block for ALL accumulated results — injected into
   *  the synthesizer's context in the planner/executor split (the synth model
   *  has no tools, so it can't see results via tool returns). */
  renderAll(): string;
  /**
   * Numbered snippet block of carried (prior-turn) + this-turn sources, deduped —
   * the grounding reference handed to the edit op-planner so a "trag die Zahlen
   * ein" turn sees the research even when the search ran turns ago. Falls back to
   * this turn's sources only when nothing was carried.
   */
  renderReference(): string;
  /** Citations over all accumulated results — numbering matches the snippets. */
  getCitations(): Citation[];
  readonly size: number;
}

function resultKey(r: SearchResult): string {
  return `${r.url ?? ''}::${r.title ?? ''}::${(r.content ?? '').slice(0, 80)}`;
}

function snippetLine(index: number, r: SearchResult): string {
  const title = (r.title || r.source || 'Quelle').trim();
  const body = (r.content ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS);
  return `[${index}] ${title}${body ? ` — ${body}` : ''}`;
}

export function createSourceRegistry(): SourceRegistry {
  const ordered: SearchResult[] = [];
  const seen = new Set<string>();
  // Prior-turn sources, kept OUT of `ordered` so they never affect this turn's
  // citations/persistence — they only ground the edit op-planner (renderReference).
  const carried: SearchResult[] = [];

  return {
    register(results) {
      const lines: string[] = [];
      for (const r of results) {
        if (!r || typeof r !== 'object') continue;
        // Skip empty-content results: buildCitations drops them, so numbering
        // them here would desync the model's [N] from done.citations.
        if ((r.content ?? '').trim().length === 0) continue;
        const key = resultKey(r);
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(r);
        lines.push(snippetLine(ordered.length, r));
      }
      return lines.join('\n');
    },
    seedCarried(results) {
      const localSeen = new Set(carried.map((r) => resultKey(r)));
      for (const r of results) {
        if (!r || typeof r !== 'object') continue;
        if ((r.content ?? '').trim().length === 0) continue;
        const key = resultKey(r);
        if (localSeen.has(key)) continue;
        localSeen.add(key);
        carried.push(r);
      }
    },
    getResults(limit = 10) {
      return ordered.slice(0, limit);
    },
    renderAll() {
      return ordered.map((r, i) => snippetLine(i + 1, r)).join('\n');
    },
    renderReference() {
      // Carried (prior-turn) first, then this-turn's fresh sources not already
      // carried — one deduped, sequentially-numbered block for the op-planner.
      const refSeen = new Set<string>();
      const combined: SearchResult[] = [];
      for (const r of [...carried, ...ordered]) {
        const key = resultKey(r);
        if (refSeen.has(key)) continue;
        refSeen.add(key);
        combined.push(r);
      }
      return combined.map((r, i) => snippetLine(i + 1, r)).join('\n');
    },
    getCitations() {
      // Project each result in registry order and stamp the registry index as
      // the id — NOT buildCitations(ordered), which would re-sort/group/cap and
      // break alignment with the snippet numbers the model cited.
      return ordered.flatMap((r, i) => {
        const [projected] = buildCitations([r]);
        return projected ? [{ ...projected, id: i + 1 }] : [];
      });
    },
    get size() {
      return ordered.length;
    },
  };
}
