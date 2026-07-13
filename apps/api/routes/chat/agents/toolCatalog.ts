/**
 * Builds the tool catalog the agentic chat loop exposes to the model.
 *
 * Phase 1: a focused slice of the internal search family — document search, web
 * search, and the social/press example tools (`createSearchTools`, finally used
 * by the chat path and not only the board agent). The `research` tool is
 * deliberately excluded: it emits its own inline `[1][2]` markers and citation
 * list, which would collide with the loop's registry-based `[N]` numbering — it
 * stays on the single-pass deep-research path until a Phase 2 citation merge.
 *
 * Document/web search tools are decorated to register their raw results in the
 * per-turn source registry and hand the model a numbered snippet block
 * (`sources`) INSTEAD of the raw results. The model grounds and cites `[N]` from
 * `sources`; the full results live in the registry (for `done.citations` and the
 * persisted searchResults). Returning the lean shape also keeps the sizable
 * `sources` block from being sliced by the loop's safety-net truncation.
 *
 * Loop-level concerns (guards, SSE cards, timeouts, truncation, step recording)
 * are layered on separately by `wrapToolsForLoop`.
 */
import { createSearchTools } from './searchTools.js';

import type { AgentConfig } from './types.js';
import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { ToolSet } from 'ai';

/** Tools exposed to the Phase-1 agentic loop (research intentionally excluded). */
const CATALOG_TOOLS = new Set([
  'gruenerator_search',
  'web_search',
  'gruenerator_examples_search',
  'gruenerator_pressemitteilung_examples',
]);

/** Tools whose results feed the citation registry and get the lean `sources` shape. */
const SOURCE_HARVEST_TOOLS = new Set(['gruenerator_search', 'web_search']);

type ExecuteFn = (input: unknown, options: { toolCallId: string }) => Promise<unknown>;

export interface ChatToolCatalog {
  tools: ToolSet;
  toolNames: string[];
}

export function buildChatToolCatalog(params: {
  agentConfig: AgentConfig;
  sourceRegistry: SourceRegistry;
}): ChatToolCatalog {
  const { agentConfig, sourceRegistry } = params;

  // No `direct_response` — the loop simply answers without a tool call when no
  // tool is needed (toolChoice stays 'auto').
  const base = createSearchTools(agentConfig);

  const tools: ToolSet = {};
  for (const [name, def] of Object.entries(base)) {
    if (!CATALOG_TOOLS.has(name)) continue;

    if (!SOURCE_HARVEST_TOOLS.has(name)) {
      // Examples tools: surfaced to the model + UI as-is (they render via the
      // examples card and don't produce `[N]` citations).
      tools[name] = def;
      continue;
    }

    const original = (def as { execute?: ExecuteFn }).execute;
    if (typeof original !== 'function') {
      tools[name] = def;
      continue;
    }
    const decorated: ExecuteFn = async (input, options) => {
      const result = await original(input, options);
      const results =
        result &&
        typeof result === 'object' &&
        Array.isArray((result as { results?: unknown }).results)
          ? ((result as { results: SearchResult[] }).results ?? [])
          : [];
      if (results.length === 0) return result;
      const sources = sourceRegistry.register(results);
      if (!sources) return { resultCount: 0, sources: '' };
      // Lean model-facing shape: the numbered `sources` block is the grounding
      // (the raw content lives in the registry → done.citations). Dropping the
      // heavy `results[]` here keeps `sources` intact under result truncation
      // and halves the tokens the model pays per search.
      return { resultCount: results.length, sources };
    };
    tools[name] = { ...def, execute: decorated } as ToolSet[string];
  }

  return { tools, toolNames: Object.keys(tools) };
}
