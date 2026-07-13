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
  /** All accumulated results in stable order (capped), for persistence/UI. */
  getResults(limit?: number): SearchResult[];
  /** The full numbered snippet block for ALL accumulated results — injected into
   *  the synthesizer's context in the planner/executor split (the synth model
   *  has no tools, so it can't see results via tool returns). */
  renderAll(): string;
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
    getResults(limit = 10) {
      return ordered.slice(0, limit);
    },
    renderAll() {
      return ordered.map((r, i) => snippetLine(i + 1, r)).join('\n');
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
