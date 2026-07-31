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
 * unit tests) the DOMAIN tools are mounted too — `summary`, `bundestag`,
 * `abgeordnetenwatch`, `umfragen` (see `domainTools.ts`). They mount broadly
 * (not gated on the classified intent) so the model can pick them even when the
 * classifier routed to plain `search`; a general per-turn selector is Phase 3n.
 *
 * Loop-level concerns (guards, SSE cards, timeouts, truncation, step recording)
 * are layered on separately by `wrapToolsForLoop`.
 */
import { isIntentAllowedForLocale } from '@gruenerator/shared/chat-intents';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { lastUserText } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { forbidsNewResearch } from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import {
  buildProductKnowledgeBlock,
  isProductMetaQuestion,
} from '../../../services/chat/productKnowledge.js';
import { selectAndCrawlTopUrls } from '../../../services/search/index.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';
import { isEditorSurface } from '../services/agenticLoop/routing.js';
import { withImageProxy } from '../services/searchImagePayload.js';

import {
  makeAbgeordnetenwatchTool,
  makeBundestagTool,
  makeCreateBoardTool,
  makeCreateDocTool,
  makeCreatePdfTool,
  makeCreateSharepicTool,
  makeDocsSearchTool,
  makeImageTool,
  makeSummaryTool,
  makeUmfragenTool,
} from './domainTools.js';
import { makeEditArtifactTool } from './editorTools.js';
import { makeReadPdfFormTool, makeFillPdfFormTool } from './pdfFormTools.js';
import {
  makeBoardsTasksTool,
  makeDocumentsTool,
  makeFindContentTool,
  makeSearchThreadsTool,
  makeGroupsTool,
  makeMediaTool,
  makeNotebooksTool,
  type PersonalToolCtx,
} from './personalDataTools.js';
import { harvestSearchImages, imageDeliveryNote } from './searchImageHarvest.js';
import { createSearchTools } from './searchTools.js';

import type { AgentConfig } from './types.js';
import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';
import type { Request } from 'express';

const log = createLogger('toolCatalog');

/**
 * Explicit image phrasing gate for demoted `agentic` turns. Without it, ANY
 * "erstelle …"-request whose real tool is missing from the catalog gets funneled
 * into generate_image by the gather prompt's creation push (seen live: a Tally
 * form request rendered as a FLUX image). Confidently classified `image` turns
 * bypass this — the classifier already vetted the phrasing.
 *
 * Diese Liste ist die Zwillingsschwester von `IMAGE_GEN_NOUN_SRC` im
 * Klassifikator, und sie war auseinandergelaufen: `poster` steht dort, hier
 * fehlte es. Folge war kein Fehlverhalten an der sicheren Stelle, sondern genau
 * dort, wo das Gitter gebraucht wird — „Erstell ein Poster" traf die zuversicht-
 * liche Regel und bekam sein Bild, „Gestalte mir ein Poster" wurde demotiert und
 * lief in einen Loop OHNE Bildwerkzeug: Prosa auf einen Bildauftrag. `plakat`
 * kannte keine der beiden Listen; es steht nur hier, weil ein Plakat mit Text
 * ebensogut ein Sharepic sein kann — diese Entscheidung gehört dem Planner, und
 * die trifft er nur, wenn das Werkzeug überhaupt hängt.
 */
const IMAGE_REQUEST_PATTERN =
  /\b(bild(er)?|foto|illustration|grafik|motiv|zeichnung|zeichne|male|visualisier\w*|image|sujet|poster|plakat)\b/i;

/** Tools exposed to the Phase-1 agentic loop. `research` used to be excluded
 *  here as a second, more expensive search door; it no longer exists — the
 *  loop reaches every tier through `web_search`'s `tiefe` parameter. */
const CATALOG_TOOLS = new Set([
  'gruenerator_search',
  'web_search',
  'gruenerator_examples_search',
  'gruenerator_pressemitteilung_examples',
]);

/** Tools whose results feed the citation registry and get the lean `sources` shape. */
const SOURCE_HARVEST_TOOLS = new Set(['gruenerator_search', 'web_search']);

/** Snippet budget for `scrape_url`. A deliberate page read deserves far more
 *  than a search hit's snippet — see the call site. */
const CRAWL_SNIPPET_CHARS = 25_000;

type ExecuteFn = (input: unknown, options: { toolCallId: string }) => Promise<unknown>;

type LoopContext = { sse: SSEWriter; state: ChatGraphState };

/**
 * Move a tool result's image hits onto the turn and out to the client, and give
 * the model back the one thing it may know about them: how many there are.
 *
 * Returns null (and sends nothing) when there is nothing new — including on
 * every non-loop caller, where there is no stream to send on. The turn's list
 * lives on `state.webImageResults`, the same field the single-pass path fills,
 * so everything downstream of the state sees one shape regardless of which path
 * produced it.
 *
 * The proxy handles are minted HERE, at the moment of handing out, because that
 * is what makes the proxy's capability check mean anything (see
 * `searchImagePayload`). The full accumulated list is re-sent on every search
 * rather than a delta: the client then just replaces its list, and no ordering
 * or dedup logic has to exist twice.
 */
function takeSearchImages(result: unknown, loop: LoopContext | undefined): string | null {
  if (!loop) return null;
  const { images, added } = harvestSearchImages(result, loop.state.webImageResults ?? []);
  if (added === 0) return null;
  loop.state.webImageResults = images;
  loop.sse.send('search_images', { images: images.map(withImageProxy) });
  log.info(`[toolCatalog] ${added} Bildtreffer an den Client gesendet (gesamt ${images.length})`);
  return imageDeliveryNote(images.length);
}

export interface ChatToolCatalog {
  tools: ToolSet;
  toolNames: string[];
}

export function buildChatToolCatalog(params: {
  agentConfig: AgentConfig;
  sourceRegistry: SourceRegistry;
  /**
   * Live-loop context. Present only on the agentic path; enables the domain
   * tools (summary/bundestag/abgeordnetenwatch) which run existing ChatGraph
   * nodes. Absent in unit tests → search family only.
   */
  loop?: { sse: SSEWriter; state: ChatGraphState; req?: Request; threadId?: string | null };
}): ChatToolCatalog {
  const { agentConfig, sourceRegistry, loop } = params;

  // "Ohne neue Recherche" is enforced by ABSENCE, not by asking nicely: the
  // search family is simply not built for this turn. Everything else — the
  // artifact tools, the personal-data reads, MCP — stays, because a ban on
  // looking things UP is not a ban on doing the work. See `forbidsNewResearch`.
  const researchBanned = loop
    ? forbidsNewResearch(loop.state.lastUserTextNoMentions ?? lastUserText(loop.state))
    : false;
  if (researchBanned) {
    log.info('[toolCatalog] user forbade new research — search tools not mounted this turn');
  }

  // No `direct_response` — the loop simply answers without a tool call when no
  // tool is needed (toolChoice stays 'auto').
  const base = createSearchTools(agentConfig, {
    ...(loop?.state.userLocale != null && { userLocale: loop.state.userLocale }),
    // Whether the model may actually spend the deep engine when it asks for
    // `tiefe: 'tiefenrecherche'`. Comes from the user's own words, not from the
    // model's judgement — see resolveSearchTier.
    ...(loop?.state.explicitDeepRequest === true && { explicitDeepRequest: true }),
    // Whether this turn's searches bring image hits back. Decided by the
    // classifier — from the user's own words or from its judgement of the
    // subject — and merely carried here. The same signal the single-pass path
    // reads in `searchNode`, so both paths show pictures on the same turns.
    ...(loop?.state.webWantsImages === true && { wantsImages: true }),
    // What a narrowing `seiten` argument is checked against. The mention-free
    // form, for the same reason the sharepic licence reads it: a mention LABEL
    // ("@[Recherche](tool:web_search)") is not something the user typed about a
    // site. Absent outside the loop → the check is skipped, not inverted.
    ...(loop != null && {
      userText: loop.state.lastUserTextNoMentions ?? lastUserText(loop.state),
    }),
  });

  const tools: ToolSet = {};
  for (const [name, def] of Object.entries(base)) {
    if (!CATALOG_TOOLS.has(name) || researchBanned) continue;

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
      // Before the lean shape below discards everything but `sources`: image hits
      // leave the tool result here, travel to the client as their own event, and
      // reach the model only as a count (see searchImageHarvest).
      const bilder = takeSearchImages(result, loop);
      const raw =
        result &&
        typeof result === 'object' &&
        Array.isArray((result as { results?: unknown }).results)
          ? ((result as { results: Record<string, unknown>[] }).results ?? [])
          : [];
      // A search that found ONLY images is the "zeig mir Fotos" turn — the one
      // case where an empty `results` is a success. Returning the raw result here
      // would hand the model the image URLs it must not have, so it gets the note
      // and nothing else.
      if (raw.length === 0) {
        return bilder ? { resultCount: 0, sources: '', bilder } : result;
      }
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
        // The web executor normalises `publishedDate` precisely because
        // freshness matters most for web hits — and this mapper used to drop it
        // one hop later, so the writing model saw every source as undated. It
        // then reported a 2023 snippet's "ist Bundesminister" as the current
        // state of affairs. The date is grounding, not just ranking input.
        ...(typeof r.publishedDate === 'string' ? { publishedDate: r.publishedDate } : {}),
      }));
      const sources = sourceRegistry.register(mapped);
      if (!sources) return { resultCount: 0, sources: '', ...(bilder ? { bilder } : {}) };
      // Lean model-facing shape: the numbered `sources` block is the grounding
      // (the raw content lives in the registry → done.citations). Dropping the
      // heavy `results[]` here keeps `sources` intact under result truncation
      // and halves the tokens the model pays per search.
      return { resultCount: mapped.length, sources, ...(bilder ? { bilder } : {}) };
    };
    tools[name] = { ...def, execute: decorated } as ToolSet[string];
  }

  // scrape_url is defined here (not from createSearchTools): a capability the
  // loop model can call to read a page it found or the user named, feeding the
  // content into the source registry like any other search result. URLs are
  // SSRF-validated (CLAUDE.md) before crawling.
  //
  // It belongs to the search family for the ban: reading a page the model picked
  // is new research by any honest reading, and leaving this one door open is
  // exactly how a blocked search reappears as a crawl.
  if (!researchBanned) {
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
        // A crawl is an explicit "read THIS page" — the user named it or the model
        // picked it out of search hits. Registering it at the ordinary snippet cap
        // meant fetching a 20-80k-char article and showing the model its first few
        // hundred characters, so "fass diesen Artikel zusammen" was answered from
        // the headline. 25k matches LobeChat's crawl budget.
        const sources = sourceRegistry.register(results, { snippetChars: CRAWL_SNIPPET_CHARS });
        return { resultCount: results.length, sources };
      },
    });
  }

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
    // Broad mounting stops at the border. The classifier already degrades
    // `bundestag`/`abgeordnetenwatch` to `web` for de-AT users — but that only
    // rewrote `state.intent`, while this catalog handed the model the tools
    // anyway. So an Austrian turn still cost a tool call that ended in the
    // executor's "nur für Deutschland" decline. Gating here is what makes the
    // downgrade actually take effect on the loop path.
    if (isIntentAllowedForLocale('bundestag', state.userLocale)) {
      tools.bundestag = makeBundestagTool({ state, sourceRegistry });
    }
    if (isIntentAllowedForLocale('abgeordnetenwatch', state.userLocale)) {
      tools.abgeordnetenwatch = makeAbgeordnetenwatchTool({ state, sourceRegistry });
    }
    // `umfragen` is NOT gated: PolitPro covers the Austrian parliaments, and the
    // tool resolves them from `state.userLocale`.
    tools.umfragen = makeUmfragenTool({ sourceRegistry, state });
    // Documentation search (`hilfe`). Mounted broadly like the other domain
    // tools — the classifier routinely labels an operating question `direct` or
    // `search`, and gating on intent would hide the tool exactly then. In-process
    // BM25, so an unnecessary mount costs nothing but a description.
    if (state.enabledTools?.['hilfe'] !== false) {
      tools.gruenerator_docs_search = makeDocsSearchTool({ sourceRegistry });
    }
    // Product self-knowledge: what Grünerator itself offers (Grüneratoren,
    // Werkzeuge, MCP-Server, Wissenssammlungen). Same builder respondNode
    // injects when the meta regex matches — the loop inherits that system
    // prompt, so the tool is only mounted for turns the regex MISSED (the
    // model decides); otherwise the block would land in context twice and the
    // connected-servers DB read would run twice per turn.
    if (
      state.enabledTools?.['product_knowledge'] !== false &&
      !isProductMetaQuestion(state.lastUserTextNoMentions ?? lastUserText(state))
    ) {
      tools.product_knowledge = tool({
        description: `Beantwortet Fragen über den Grünerator selbst: verfügbare Grüneratoren (Assistenten), Werkzeuge, MCP-Server/Anbindungen und durchsuchbare Wissenssammlungen.

NUTZE WENN nach Funktionen, Fähigkeiten oder Anbindungen des Grünerators gefragt wird ("was kannst du", "welche MCP-Server kennst du", "wie erstelle ich ein Sharepic"). NICHT für politische Inhalte oder Recherche.`,
        inputSchema: z.object({
          topic: z
            .string()
            .describe('Fokus der Frage, z.B. "mcp", "sharepic"; leer für den Überblick')
            .default(''),
        }),
        execute: async ({ topic }) => {
          const knowledge = await buildProductKnowledgeBlock({
            locale: state.userLocale,
            userId: state.agentConfig?.userId ?? null,
            question: `${topic} ${lastUserText(state)}`.trim(),
          });
          return { knowledge };
        },
      });
    }
    // Editor sidebars (docs/sheets/presentations/boards) EDIT the open document
    // — they must never spawn a NEW artifact (image OR create fat tool). Gated
    // server-side (the frontend not setting the tools:false is not enough).
    const editorSurface = isEditorSurface(state.enabledTools);

    // Tool-based editor edit: the loop edits the OPEN artifact in place via
    // `edit_document` instead of the client round-trip to the bespoke
    // /api/{sheets,…}/:id/ai endpoint. Mounted only when the router resolved a
    // surface with a tool path (state.editToolSurface set); otherwise the legacy
    // trigger_doc_edit path stays in force. appliedOpsLog is per-turn.
    if (state.editToolSurface) {
      const editTool = makeEditArtifactTool({ sse, state, sourceRegistry, appliedOpsLog: [] });
      if (editTool) tools.edit_document = editTool;
    }

    // Personal-data resource tools: the user's OWN documents, boards, tasks,
    // groups, media and notebooks (read + light management). Always mounted (the
    // model picks them), each gated by enabledTools so an agent can opt out.
    // Mutations reuse the confirm_action flow / write-access checks (see
    // personalDataTools.ts); reads only touch user-scoped services.
    const personalCtx: PersonalToolCtx = {
      state,
      sse,
      threadId: loop.threadId ?? null,
      sourceRegistry,
    };
    if (state.enabledTools?.['find_content'] !== false) {
      tools.find_content = makeFindContentTool(personalCtx);
    }
    if (state.enabledTools?.['search_threads'] !== false) {
      tools.search_threads = makeSearchThreadsTool(personalCtx);
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

    // PDF form tools, mounted only when a PDF is actually in play: this turn's
    // attachments, or one from an earlier turn (threadAttachments carries no
    // bytes, but tells us a PDF exists — the tool resolves the bytes and reports
    // honestly if the stored form turned out not to be fillable).
    const hasPdfInThread =
      (state.pdfFormAttachments?.length ?? 0) > 0 ||
      (state.threadAttachments ?? []).some((a) => a.mimeType === 'application/pdf');
    if (hasPdfInThread && state.enabledTools?.['pdf_form'] !== false) {
      const pdfCtx = { state, sse, threadId: loop.threadId ?? null };
      tools.read_pdf_form = makeReadPdfFormTool(pdfCtx);
      tools.fill_pdf_form = makeFillPdfFormTool(pdfCtx);
    }
    // Image is expensive + rate-limited and the classifier routes it reliably,
    // so it stays intent-scoped (and gated). image_edit stays single-pass.
    // 'agentic' (demoted) turns mount it ONLY on explicit image phrasing
    // (IMAGE_REQUEST_PATTERN) — image phrasings the confident heuristic misses
    // land there; idempotency + forceFinish cap quota at one image per turn.
    // Never in an editor surface (that would create a new image).
    if (
      !editorSurface &&
      (state.intent === 'image' ||
        (state.intent === 'agentic' &&
          IMAGE_REQUEST_PATTERN.test(state.lastUserTextNoMentions ?? lastUserText(state)))) &&
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
    if (state.compoundGeneration === true && loop.req && !editorSurface) {
      const kind = state.compoundGenerationKind;
      const enabled = (key: string): boolean => state.enabledTools?.[key] !== false;
      // The generation tools stay mounted under a research ban — only their
      // opening line flips from "Recherchiere ZUERST" to "arbeite mit dem, was
      // im Gespräch steht". Telling the model to search with no search tool
      // mounted is how a turn stalls or invents one.
      if (kind === 'sharepic' && enabled('sharepic')) {
        tools.sharepic = makeCreateSharepicTool({
          sse,
          state,
          req: loop.req,
          threadId: loop.threadId ?? null,
          researchBanned,
        });
      } else if (kind === 'presentation' && enabled('create_presentation')) {
        tools.create_presentation = makeCreateDocTool({
          kind: 'presentation',
          sse,
          state,
          req: loop.req,
          sourceRegistry,
          researchBanned,
        });
      } else if (kind === 'sheet' && enabled('create_sheet')) {
        tools.create_sheet = makeCreateDocTool({
          kind: 'sheet',
          sse,
          state,
          req: loop.req,
          sourceRegistry,
          researchBanned,
        });
      } else if (kind === 'document' && enabled('create_document')) {
        tools.create_document = makeCreateDocTool({
          kind: 'document',
          sse,
          state,
          req: loop.req,
          sourceRegistry,
          researchBanned,
        });
      } else if (kind === 'board' && enabled('create_board')) {
        tools.create_board = makeCreateBoardTool({ state, req: loop.req, researchBanned });
      } else if (kind === 'pdf' && enabled('create_pdf')) {
        tools.create_pdf = makeCreatePdfTool({
          sse,
          state,
          req: loop.req,
          sourceRegistry,
          researchBanned,
        });
      }
    }
  }

  return { tools, toolNames: Object.keys(tools) };
}
