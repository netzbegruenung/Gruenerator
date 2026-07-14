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
 * Phase 2b: when a `loop` context is supplied (the live agentic path, absent in
 * unit tests) the classified intent's DOMAIN tool is mounted too — `summary`,
 * `bundestag` or `abgeordnetenwatch` (see `domainTools.ts`). These are
 * intent-scoped (only the routed intent's tool is added) to keep Mistral's
 * catalog lean; a general per-turn selector is Phase 3n.
 *
 * Loop-level concerns (guards, SSE cards, timeouts, truncation, step recording)
 * are layered on separately by `wrapToolsForLoop`.
 */
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { selectAndCrawlTopUrls } from '../../../services/search/index.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';

import {
  makeAbgeordnetenwatchTool,
  makeBundestagTool,
  makeCreateBoardTool,
  makeCreateDocTool,
  makeCreateSharepicTool,
  makeImageTool,
  makeSummaryTool,
} from './domainTools.js';
import {
  makeBoardsTasksTool,
  makeDocumentsTool,
  makeFindContentTool,
  makeGroupsTool,
  makeMediaTool,
  makeNotebooksTool,
  type PersonalToolCtx,
} from './personalDataTools.js';
import { createSearchTools } from './searchTools.js';

import type { AgentConfig } from './types.js';
import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { Request } from 'express';

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
  /**
   * Live-loop context. Present only on the agentic path; enables the intent-
   * scoped domain tools (summary/bundestag/abgeordnetenwatch) which emit their
   * own SSE and run existing ChatGraph nodes. Absent in unit tests → search
   * family only.
   */
  loop?: { sse: SSEWriter; state: ChatGraphState; req?: Request; threadId?: string | null };
}): ChatToolCatalog {
  const { agentConfig, sourceRegistry, loop } = params;

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
      const raw =
        result &&
        typeof result === 'object' &&
        Array.isArray((result as { results?: unknown }).results)
          ? ((result as { results: Record<string, unknown>[] }).results ?? [])
          : [];
      if (raw.length === 0) return result;
      // CRITICAL: executeDirectSearch/executeDirectWebSearch items carry their
      // text in `excerpt` (docs) / `snippet` (web) — NOT `content`. The source
      // registry keys on `content`, so without this normalisation every result
      // was skipped as "empty", the model was handed `{ resultCount: 0 }`, and
      // it answered from its own knowledge with no [N] citations.
      const mapped: SearchResult[] = raw.map((r) => ({
        source: String(r.source ?? r.domain ?? 'web'),
        title: String(r.title ?? r.source ?? r.url ?? 'Quelle'),
        content: String(r.excerpt ?? r.snippet ?? r.content ?? ''),
        ...(typeof r.url === 'string' ? { url: r.url } : {}),
      }));
      const sources = sourceRegistry.register(mapped);
      if (!sources) return { resultCount: 0, sources: '' };
      // Lean model-facing shape: the numbered `sources` block is the grounding
      // (the raw content lives in the registry → done.citations). Dropping the
      // heavy `results[]` here keeps `sources` intact under result truncation
      // and halves the tokens the model pays per search.
      return { resultCount: mapped.length, sources };
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

  // Domain tools (loop path only). Mounted BROADLY, not gated on the exact
  // classified intent: the loop's whole point is that the MODEL picks the tool,
  // and the classifier routinely sends Bundestag/politician questions to plain
  // `search` (observed live: "Heizungsgesetz der Grünen Bundestagsfraktion" →
  // intent=search). Intent-gating hid the specialised tool so the model fell
  // back to generic search. The catalog stays small enough for Mistral (~9
  // tools); a per-turn selector is Phase 3n.
  if (loop) {
    const { sse, state } = loop;
    tools.summarize = makeSummaryTool({ sse, state });
    tools.bundestag = makeBundestagTool({ sse, state, sourceRegistry });
    tools.abgeordnetenwatch = makeAbgeordnetenwatchTool({ state, sourceRegistry });

    // Personal-data resource tools: the user's OWN documents, boards, tasks,
    // groups, media and notebooks (read + light management). Always mounted (the
    // model picks them), each gated by enabledTools so an agent can opt out.
    // Mutations reuse the confirm_action flow / write-access checks (see
    // personalDataTools.ts); reads only touch user-scoped services.
    const personalCtx: PersonalToolCtx = { state, sse, threadId: loop.threadId ?? null };
    if (state.enabledTools?.['find_content'] !== false) {
      tools.find_content = makeFindContentTool(personalCtx);
    }
    if (state.enabledTools?.['documents'] !== false) {
      tools.documents = makeDocumentsTool(personalCtx);
    }
    if (state.enabledTools?.['boards_tasks'] !== false) {
      tools.boards_tasks = makeBoardsTasksTool(personalCtx);
    }
    if (state.enabledTools?.['groups'] !== false) {
      tools.groups = makeGroupsTool(personalCtx);
    }
    if (state.enabledTools?.['media'] !== false) {
      tools.media = makeMediaTool(personalCtx);
    }
    if (state.enabledTools?.['notebooks'] !== false) {
      tools.notebooks = makeNotebooksTool(personalCtx);
    }
    // Image is expensive + rate-limited and the classifier routes it reliably,
    // so it stays intent-scoped (and gated). image_edit stays single-pass.
    // 'agentic' (demoted) turns also mount it — image phrasings the confident
    // heuristic misses land there; idempotency + forceFinish cap quota at one
    // image per turn.
    if (
      (state.intent === 'image' || state.intent === 'agentic') &&
      state.enabledTools?.['image'] !== false
    ) {
      tools.generate_image = makeImageTool({ sse, state });
    }
    // Compound generation fat tools (Phase 3n): ONE tool per turn, chosen by the
    // generation KIND the router derived (from intent OR — for a demoted
    // `agentic` turn — the text noun). Pure "mach ein Sharepic" keeps its direct
    // dispatch + fixed text (compoundGenerationKind is null → nothing mounted).
    // The sharepic key is load-bearing (`sharepic` drives card rehydration +
    // follow-up edits); presentation/sheet/document persist via createdDocument;
    // board renders from the `done` event.
    // Editor sidebars (docs/sheets/presentations/boards) EDIT the open document
    // — they must never spawn a NEW artifact. Signalled by an edit-current-*
    // tool being enabled. Gate the create fat tools off entirely there (the
    // frontend not setting create_*:false is not enough — enforce server-side).
    const isEditorSurface =
      state.enabledTools?.['edit_current_doc'] === true ||
      state.enabledTools?.['edit_current_board'] === true;
    if (state.compoundGeneration === true && loop.req && !isEditorSurface) {
      const kind = state.compoundGenerationKind;
      const enabled = (key: string): boolean => state.enabledTools?.[key] !== false;
      if (kind === 'sharepic' && enabled('sharepic')) {
        tools.sharepic = makeCreateSharepicTool({
          sse,
          state,
          req: loop.req,
          threadId: loop.threadId ?? null,
        });
      } else if (kind === 'presentation' && enabled('create_presentation')) {
        tools.create_presentation = makeCreateDocTool({
          kind: 'presentation',
          sse,
          state,
          req: loop.req,
        });
      } else if (kind === 'sheet' && enabled('create_sheet')) {
        tools.create_sheet = makeCreateDocTool({ kind: 'sheet', sse, state, req: loop.req });
      } else if (kind === 'document' && enabled('create_document')) {
        tools.create_document = makeCreateDocTool({ kind: 'document', sse, state, req: loop.req });
      } else if (kind === 'board' && enabled('create_board')) {
        tools.create_board = makeCreateBoardTool({ state, req: loop.req });
      }
    }
  }

  return { tools, toolNames: Object.keys(tools) };
}
