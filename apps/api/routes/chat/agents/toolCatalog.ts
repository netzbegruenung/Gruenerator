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
 * `scrape_url` is a further catalog tool (defined here, not from
 * createSearchTools): a mid-loop capability to read a named/found page into the
 * same source registry. It does NOT move the pasted-URL `scrape_url` INTENT into
 * the loop — that deterministic fast path stays; this just lets a search/web
 * turn also crawl a page ("suche X und lies den ersten Treffer").
 *
 * Loop-level concerns (guards, SSE cards, timeouts, truncation, step recording)
 * are layered on separately by `wrapToolsForLoop`.
 */
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { selectAndCrawlTopUrls } from '../../../services/search/index.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';

import { createSearchTools } from './searchTools.js';

import type { AgentConfig } from './types.js';
import type { SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

const log = createLogger('toolCatalog');

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

  // scrape_url is defined here (not from createSearchTools): a capability the
  // loop model can call to read a page it found or the user named, feeding the
  // content into the source registry like any other search result. URLs are
  // SSRF-validated (CLAUDE.md) before crawling.
  tools.scrape_url = tool({
    description: `Ruft den vollständigen Textinhalt einer oder mehrerer Webseiten ab.

NUTZE WENN:
- Der*die Nutzer*in eine URL genannt/eingefügt hat und deren Inhalt gebraucht wird
- Du nach einer Websuche eine konkrete Trefferseite im Volltext lesen willst

Übergib die vollständigen URLs (inkl. https://). Der Inhalt wird als zitierbare Quelle [N] verfügbar.`,
    inputSchema: z.object({
      urls: z.array(z.string()).min(1).max(3).describe('Vollständige URLs inkl. Protokoll'),
    }),
    execute: async ({ urls }) => {
      const validated: string[] = [];
      for (const raw of urls) {
        const check = await validateUrlForFetch(raw);
        if (check.isValid && check.url) validated.push(check.url.toString());
        else log.warn(`[scrape_url] rejected URL: ${check.error ?? 'invalid'}`);
      }
      if (validated.length === 0) {
        return { error: 'Keine gültige oder erlaubte URL. Prüfe die Adresse (inkl. https://).' };
      }
      const seeds = validated.map((url, idx) => ({
        url,
        title: url,
        content: '',
        relevance: 1 - idx * 0.1,
      }));
      const crawled = await selectAndCrawlTopUrls(seeds, '', { maxUrls: 3, timeout: 8000 });
      const results: SearchResult[] = crawled
        .filter((r) => r.crawled && (r.fullContent || r.content))
        .map((r) => ({
          source: 'web',
          url: r.url,
          title: r.title || r.url || '',
          content: r.fullContent || r.content || '',
        }));
      if (results.length === 0) {
        return {
          error: 'Konnte die Seite(n) nicht lesen (Timeout, Blockade oder kein Textinhalt).',
        };
      }
      const sources = sourceRegistry.register(results);
      return { resultCount: results.length, sources };
    },
  });

  return { tools, toolNames: Object.keys(tools) };
}
