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
import { tool, type Tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { lastUserText } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { looksLikeRecurringOrder } from '../../../agents/langgraph/ChatGraph/nodes/classifierSignals.js';
import { forbidsNewResearch } from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import {
  buildProductKnowledgeBlock,
  isProductMetaQuestion,
} from '../../../services/chat/productKnowledge.js';
import { crawlAndDistill } from '../../../services/search/index.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';
import {
  ATTACHED_DOC_SNIPPET_CHARS,
  ATTACHED_DOCS_TOOL,
  readAttachedDocumentSlice,
  retrievableAttachedSources,
  retrieveAttachedDocuments,
  SLICE_DEFAULT_CHARS,
  SLICE_REGISTER_CHARS,
} from '../services/agenticLoop/attachedDocuments.js';
import { isLoopRerankEnabled } from '../services/agenticLoop/flags.js';
import { isEditorSurface } from '../services/agenticLoop/routing.js';
import {
  mentionsRecipes,
  mentionsRecurringTasks,
  mentionsUserAgents,
} from '../services/agenturaContext.js';
import { artifactKind, type ArtifactKindId } from '../services/artifactKindRegistry.js';
import {
  attachedCloudShareLinks,
  mentionsCloudStorage,
} from '../services/cloudConnectionContext.js';
import { hasReachableForm } from '../services/pdfFormAvailability.js';
import { withImageProxy } from '../services/searchImagePayload.js';

import { makeCloudFilesTool } from './cloudFileTools.js';
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
import { makeGroupsTool } from './groupTools.js';
import { makeMemoryTool } from './memoryTools.js';
import { makeNotebooksTool } from './notebookTools.js';
import { makeReadPdfFormTool, makeFillPdfFormTool } from './pdfFormTools.js';
import {
  makeBoardsTasksTool,
  makeDocumentsTool,
  makeReadArtifactTool,
  makeFindContentTool,
  makeSearchThreadsTool,
  makeMediaTool,
  type PersonalToolCtx,
} from './personalDataTools.js';
import { makeRecurringTasksTool } from './recurringTaskTools.js';
import { harvestSearchImages, imageDeliveryNote } from './searchImageHarvest.js';
import { agentAllowsWebSearch, createSearchTools } from './searchTools.js';
import { makeRecipesTool } from './textFormTools.js';
import { makeUserAgentsTool } from './userAgentTools.js';

import type { AgentConfig } from './types.js';
import type { ChatGraphState, SearchResult } from '../../../agents/langgraph/ChatGraph/types.js';
import type { RecipeRegistry } from '../services/agenticLoop/recipeRegistry.js';
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

/**
 * Snippet budget for `scrape_url`. A deliberate page read deserves far more
 * than a search hit's snippet — see the call site.
 *
 * Was 25k, which was never actually reachable: `renderAll`'s shared shrink
 * collapses it as soon as a second source exists, and in unified mode there is
 * no `renderAll` at all, so the model saw whatever survived
 * `truncateResultForModel`. 8k of a DISTILLED page is text that arrives.
 */
const CRAWL_SNIPPET_CHARS = 8_000;

/** Char budget handed to the distiller for a deliberately named page. */
const CRAWL_DISTILL_TARGET_CHARS = 8_000;

/**
 * Chunk limit for `expand_attachment`'s vectorized-doc path — well above the
 * fan-out's per-source share (searchNode.ts, FANOUT_MIN_CHUNKS_PER_SOURCE),
 * since this is a deliberate "give me more of this one file" call, not an
 * even split across many sources competing for the same budget.
 */
const EXPAND_ATTACHMENT_CHUNK_LIMIT = 20;

/**
 * Registration cap for a full inline attachment text handed back via
 * `expand_attachment`. Same reasoning as `CRAWL_SNIPPET_CHARS`: a deliberate
 * reread of a named file deserves more room than an ordinary search snippet.
 */
const EXPAND_ATTACHMENT_SNIPPET_CHARS = 12_000;

/**
 * Crawl budget for `tiefenrecherche` — the ONE tier that reads pages.
 *
 * Until this existed the loop never crawled: `directSearchExecutors` does not
 * contain the word, so even a turn the user explicitly asked to research deeply
 * was written from Linkup snippets, while the single-pass path handed the same
 * question distilled full pages. That made the dominant path the thinner one on
 * exactly the turns that paid for depth.
 *
 * Only on `tiefenrecherche` because only there is the latency licensed: the tier
 * is reachable solely through `resolveSearchTier`, i.e. from the user's own
 * words (`explicitDeepRequest`), and its progress label already promises
 * 15–20 s. On `standard`/`gruendlich` — every ordinary turn — nothing changes.
 *
 * 3 URLs at 4k each is what fits: the tier returns 20 results, and 3×4k + 17×1500
 * is the number `SOURCE_BLOCK_CHARS` was raised to cover. Crawling more would
 * only trigger the registry's shared shrink and take the extra text back out.
 */
const DEEP_CRAWL_URLS = 3;
const DEEP_CRAWL_TARGET_CHARS = 4_000;
/** How far down the hit list to look for three crawlable URLs. */
const DEEP_CRAWL_SCAN_LIMIT = 8;
/** Below `scrape_url`'s 8 s: there the page IS the request, here it is an
 *  enrichment inside a loop that already has a wall-clock budget. */
const DEEP_CRAWL_TIMEOUT_MS = 5_000;

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

/**
 * Read the top hits of a `tiefenrecherche` search and keep the part that answers
 * the question.
 *
 * Gated on the tier the executor reports having SPENT, never on the `tiefe`
 * argument: that argument is the model's request, and `resolveSearchTier` clamps
 * it against what the user actually consented to. Reading it here instead would
 * put the crawl one hallucinated token away.
 *
 * URLs are SSRF-validated even though they come from the search engine rather
 * than from the model. A page that ranks for a query is still third-party text
 * chosen by a third party, and this is a server-side fetch — the same reason
 * `scrape_url` validates. (The single-pass crawl path does not yet; that is a
 * gap there, not a licence here.)
 *
 * Never throws: a crawl that fails, times out or is blocked returns the snippets
 * untouched, which is exactly the behaviour this replaces.
 */
async function crawlDeepHits(
  mapped: SearchResult[],
  result: unknown
): Promise<{ results: SearchResult[]; crawledCount: number }> {
  const meta = (result ?? {}) as { tier?: unknown; query?: unknown };
  if (meta.tier !== 'tiefenrecherche') return { results: mapped, crawledCount: 0 };

  const query = typeof meta.query === 'string' ? meta.query : '';
  // Seeds carry only what the crawler needs. Deliberately NOT the whole
  // `SearchResult`: the crawl result is merged back field by field below, and
  // spreading it wholesale would drag `fullContent` — the raw page — into the
  // registry and from there into `chat_messages.tool_results`.
  const seeds: Array<{ url: string; title: string; content: string; relevance: number }> = [];
  // Bounded scan: validation is a DNS round trip each, and `tiefenrecherche`
  // hands us 20 hits. Without the bound a run of blocked hosts would turn the
  // search into 20 serial lookups before the first page is even fetched.
  for (const r of mapped.slice(0, DEEP_CRAWL_SCAN_LIMIT)) {
    if (seeds.length >= DEEP_CRAWL_URLS) break;
    if (typeof r.url !== 'string' || !r.url) continue;
    const check = await validateUrlForFetch(r.url);
    if (!check.isValid || !check.url) {
      log.warn(`[toolCatalog] deep crawl skipped ${r.url}: ${check.error ?? 'invalid'}`);
      continue;
    }
    seeds.push({ url: r.url, title: r.title, content: r.content, relevance: r.relevance ?? 0 });
  }
  if (seeds.length === 0) return { results: mapped, crawledCount: 0 };

  try {
    const crawled = await crawlAndDistill(seeds, query, {
      maxUrls: DEEP_CRAWL_URLS,
      timeout: DEEP_CRAWL_TIMEOUT_MS,
      // `query-focused`, unlike `scrape_url`: nobody named these pages, they are
      // search hits standing in for an answer. Selecting against the question is
      // the whole reason to read them rather than trust the snippet.
      mode: 'query-focused',
      targetChars: DEEP_CRAWL_TARGET_CHARS,
      condense: true,
    });
    const byUrl = new Map(crawled.filter((r) => r.crawled && r.content).map((r) => [r.url, r]));
    if (byUrl.size === 0) return { results: mapped, crawledCount: 0 };
    log.info(
      `[toolCatalog] deep crawl: ${byUrl.size}/${seeds.length} Seiten gelesen für "${query.slice(0, 50)}"`
    );
    return {
      results: mapped.map((r) => {
        const hit = typeof r.url === 'string' ? byUrl.get(r.url) : undefined;
        if (!hit?.content) return r;
        return {
          ...r,
          content: hit.content,
          crawled: true,
          ...(hit.distilled != null ? { distilled: hit.distilled } : {}),
          ...(hit.distilledChunks ? { distilledChunks: hit.distilledChunks } : {}),
          ...(hit.sourceChars != null ? { sourceChars: hit.sourceChars } : {}),
        };
      }),
      crawledCount: byUrl.size,
    };
  } catch (err) {
    log.warn(
      `[toolCatalog] deep crawl failed, keeping snippets: ${err instanceof Error ? err.message : String(err)}`
    );
    return { results: mapped, crawledCount: 0 };
  }
}

export interface ChatToolCatalog {
  tools: ToolSet;
  toolNames: string[];
}

export function buildChatToolCatalog(params: {
  agentConfig: AgentConfig;
  sourceRegistry: SourceRegistry;
  /**
   * Die Rezepte, die der Loop in diesem Turn selbst lädt. Nur die PM-Suche
   * liest sie, und nur deren Landesverbands-Ebene: das Rezept entscheidet, ob
   * Partei- oder Fraktionsvorlagen die Erdung stellen. Fehlt sie (Tests, der
   * Board-Agent), bleibt der volle Ausschnitt des Agenten stehen.
   */
  recipeRegistry?: Pick<RecipeRegistry, 'mentions'>;
  /**
   * Live-loop context. Present only on the agentic path; enables the domain
   * tools (summary/bundestag/abgeordnetenwatch) which run existing ChatGraph
   * nodes. Absent in unit tests → search family only.
   */
  loop?: { sse: SSEWriter; state: ChatGraphState; req?: Request; threadId?: string | null };
}): ChatToolCatalog {
  const { agentConfig, sourceRegistry, recipeRegistry, loop } = params;

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
    // Unconditional, not a conditional spread: WHICH collections this turn may
    // search now hangs on the locale, so "no loop state" has to resolve to an
    // explicit `null` (→ the German default) rather than to an absent property.
    userLocale: loop?.state.userLocale ?? null,
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
    // Welche Rezepte diesen Turn gelten — die ausdrücklich gewählte Kennung
    // plus alles, was der Loop selbst nachlädt. Als Thunk, weil das zweite
    // erst nach dem Bau dieses Katalogs passiert.
    activeRecipeMentions: () => [
      loop?.state.activeSkillMention,
      ...(recipeRegistry?.mentions ?? []),
    ],
    // Chunk-Rerank vor der Gruppierung. Nur im Loop — der Einzelpfad rerankt
    // danach in `rerankNode`, der Board-Agent gar nicht — und nur mit
    // gesetztem Schalter: Default AUS bis zum Doppelmesslauf (#3120).
    ...(loop != null && isLoopRerankEnabled() && { rerankSearchChunks: true }),
  });

  // Agents bound to their own corpus (the Landesverband agents and their
  // notebooks) declare no web capability. Their system prompt says so, but a
  // prompt is not a gate: the catalog mounted `web_search` for every agent, so
  // the model could — and did — search the open web anyway. Only the web door
  // closes here; `gruenerator_search` and the example corpora stay mounted.
  const webAllowed = agentAllowsWebSearch(agentConfig);
  if (!webAllowed) {
    delete base.web_search;
    log.info(
      `[toolCatalog] agent ${agentConfig.identifier} has no web capability — web_search/scrape_url not mounted`
    );
  }

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
      const mapped: SearchResult[] = raw.map((r, i) => ({
        source: String(r.source ?? r.domain ?? 'web'),
        title: String(r.title ?? r.source ?? r.url ?? 'Quelle'),
        content: String(r.excerpt ?? r.snippet ?? r.content ?? ''),
        ...(typeof r.url === 'string' ? { url: r.url } : {}),
        // The engine's own ranking, made explicit. `selectAndCrawlTopUrls` picks
        // its crawl targets by `relevance`, and a web hit arrives without a
        // numeric one — so every candidate would tie at 0 and which three pages
        // get read would fall out of sort stability instead of out of the ranking
        // we paid for. (The document search does carry a `relevance`, but as the
        // string 'high'/'medium' — hence the type check rather than a `??`.)
        relevance: typeof r.relevance === 'number' ? r.relevance : 1 - i / raw.length,
        // The web executor normalises `publishedDate` precisely because
        // freshness matters most for web hits — and this mapper used to drop it
        // one hop later, so the writing model saw every source as undated. It
        // then reported a 2023 snippet's "ist Bundesminister" as the current
        // state of affairs. The date is grounding, not just ranking input.
        ...(typeof r.publishedDate === 'string' ? { publishedDate: r.publishedDate } : {}),
      }));
      const enriched = await crawlDeepHits(mapped, result);
      const sources = sourceRegistry.register(
        enriched.results,
        // One cap for the whole batch, sized for the crawled pages. Harmless for
        // the uncrawled hits alongside them: the cap is a ceiling, and a 1500-char
        // snippet does not grow by being allowed to.
        enriched.crawledCount > 0 ? { snippetChars: DEEP_CRAWL_TARGET_CHARS } : undefined
      );
      if (!sources) return { resultCount: 0, sources: '', ...(bilder ? { bilder } : {}) };
      // Lean model-facing shape: the numbered `sources` block is the grounding
      // (the raw content lives in the registry → done.citations). Dropping the
      // heavy `results[]` here keeps `sources` intact under result truncation
      // and halves the tokens the model pays per search.
      return { resultCount: enriched.results.length, sources, ...(bilder ? { bilder } : {}) };
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
  // Same gate as `web_search` above: for an agent without web capability a
  // crawl is the other door to the same open web.
  if (!researchBanned && webAllowed) {
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
        // `faithful`, never query-focused: the page was NAMED, so a relevance
        // filter would drop precisely the parts the user asked about. The
        // distiller only condenses here, it does not select.
        const crawled = await crawlAndDistill(seeds, '', {
          maxUrls: 3,
          timeout: 8000,
          mode: 'faithful',
          targetChars: CRAWL_DISTILL_TARGET_CHARS,
          condense: true,
        });
        const results: SearchResult[] = crawled
          .filter((r) => r.crawled && (r.content || r.fullContent))
          .map((r) => ({
            source: 'web',
            url: r.url,
            title: r.title || r.url || '',
            content: r.content || r.fullContent || '',
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
        // the headline.
        const sources = sourceRegistry.register(results, { snippetChars: CRAWL_SNIPPET_CHARS });
        return { resultCount: results.length, sources };
      },
    });
  }

  // expand_attachment: recovers from the fair-split budget in
  // limitAttachmentContext (respondNode.ts) and the fan-out's per-source chunk
  // cap (executeMultiDocFanout, searchNode.ts) by pulling more content for ONE
  // named attachment on demand — see docs/chat-context-memory-paths.md,
  // "Mehrdokument-Fan-out" (M4).
  //
  // Scope note: only resolves attachments carried over from a PRIOR turn
  // (`state.threadAttachments`, which has a stable id + optional documentId
  // per file). A file uploaded THIS turn has no such stable, name-addressable
  // record once contextEnrichmentService.ts has routed and discarded its
  // local `processedMeta` — closing that gap needs a state-schema addition,
  // out of scope here.
  if (loop && !researchBanned) {
    tools.expand_attachment = tool({
      description: `Lädt mehr Inhalt aus einer Datei nach, die in einem früheren Turn dieses Gesprächs hochgeladen wurde, wenn der bisher gezeigte Auszug für die Aufgabe (z. B. einen Vergleich mehrerer Dateien) nicht ausreicht.

NUTZE WENN:
- Eine Auslassungs-Meldung oder ein "(Ausschnitt, weitere Inhalte über Suche verfügbar)"-Hinweis eine Datei nennt, die du für die Antwort brauchst
- Ein Dateivergleich mit dem bisher gezeigten Auszug erkennbar unvollständig wäre

Übergib den exakten Dateinamen. Funktioniert nur für Anhänge aus früheren Turns dieses Gesprächs — für Dateien aus DIESER Nachricht gibt es ${ATTACHED_DOCS_TOOL}.`,
      inputSchema: z.object({
        attachmentName: z
          .string()
          .describe('Exakter Dateiname des Anhangs aus einem früheren Turn'),
      }),
      execute: async ({ attachmentName }) => {
        const attachment = (loop.state.threadAttachments ?? []).find(
          (a) => a.name.toLowerCase() === attachmentName.toLowerCase()
        );
        if (!attachment) {
          return {
            error:
              `Keine Datei namens "${attachmentName}" aus einem früheren Turn gefunden. ` +
              `Für Dateien, die in DIESER Nachricht hochgeladen wurden, gibt es ${ATTACHED_DOCS_TOOL}.`,
          };
        }

        // Vectorized (large) doc: pull a much bigger sample than the fan-out's
        // per-source share via a fresh, uncapped-relative-to-fanout query.
        if (attachment.documentId) {
          const attachmentDocumentId = attachment.documentId;
          const documentSearchService = (
            await import('../../../services/document-services/DocumentSearchService/index.js')
          ).getQdrantDocumentService();
          const query = loop.state.lastUserTextNoMentions ?? lastUserText(loop.state);
          const response = await documentSearchService.search({
            query,
            userId: agentConfig.userId,
            options: { limit: EXPAND_ATTACHMENT_CHUNK_LIMIT, mode: 'hybrid', threshold: 0.15 },
            filters: { documentIds: [attachmentDocumentId] },
          });
          const results: SearchResult[] = (response.results || []).map((r) => ({
            source: `attachment:${attachment.id}`,
            title: r.title || attachment.name,
            content: r.relevant_content || '',
            ...(r.source_url ? { url: r.source_url } : {}),
            relevance: r.similarity_score ?? 0.5,
            // Derselbe Schlüssel wie im Fan-out (`searchNode.ts:889`). Ohne ihn
            // fällt dieses Werkzeug auf den Inhalts-Schlüssel zurück und legt
            // für die schon mitgeführte Datei einen ZWEITEN Quellenplatz an —
            // also genau die Verdopplung, gegen die der Schlüssel gebaut ist,
            // nur über den Nachlade-Pfad.
            documentId: r.document_id || attachmentDocumentId,
          }));
          if (results.length === 0) {
            return { error: `Konnte keine weiteren Inhalte aus "${attachmentName}" laden.` };
          }
          const sources = sourceRegistry.register(results);
          if (!sources) return { error: `Konnte "${attachmentName}" nicht nachladen.` };
          return { resultCount: results.length, sources };
        }

        // Inline (small) doc: the full text already lives on threadAttachments,
        // untruncated — truncation only happens in the rendered prompt, not here.
        if (attachment.extractedText) {
          const results: SearchResult[] = [
            {
              source: `attachment:${attachment.id}`,
              title: attachment.name,
              content: attachment.extractedText,
            },
          ];
          const sources = sourceRegistry.register(results, {
            snippetChars: EXPAND_ATTACHMENT_SNIPPET_CHARS,
          });
          if (!sources) return { error: `Konnte "${attachmentName}" nicht nachladen.` };
          return { resultCount: 1, sources };
        }

        return { error: `"${attachmentName}" enthält keinen nachladbaren Text.` };
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

    // dokumente_lesen: gezielte Frage an die Dokumente, die an DIESEN Turn
    // hängen. Gegated an den Dokumenten selbst, nicht an einer Konfiguration
    // daneben — LobeHub montiert sein Gegenstück nur, wenn der Agent zufällig
    // eine Wissensdatenbank konfiguriert hat, und dann kann das Modell eine
    // gerade hochgeladene Datei nicht mehr befragen. Genau die Bauform, die uns
    // den Ausfall vom 23.08.2026 eingebracht hat.
    //
    // Der Vorab-Seed (seedAttachedDocuments) hat die Passagen zur häufigsten
    // Frage schon geholt; dieses Werkzeug ist das Nachfassen, wenn er
    // danebengriff.
    const attachedSources = retrievableAttachedSources(state);
    if (attachedSources.length > 0) {
      const mehrere = attachedSources.length > 1;
      tools[ATTACHED_DOCS_TOOL] = tool({
        description: `Durchsucht die Dokumente, die in diesem Gespräch angehängt sind${mehrere ? ` (${attachedSources.map((s) => s.label).join(', ')})` : ` („${attachedSources[0]!.label}")`}, oder liest sie abschnittsweise im Volltext.

NUTZE WENN eine Frage sich auf eine angehängte Datei bezieht und die bereits gezeigten Passagen nicht ausreichen.

- Für eine gezielte Frage: \`query\` mit einem präzisen Suchbegriff.
- Wenn die Frage keinen brauchbaren Suchbegriff hergibt (z. B. „was steht am Anfang", „lies weiter"): \`abschnitt\` mit \`von\` als Zeichenposition — die Antwort sagt dir, wo du weiterlesen kannst.
- Auch wenn die Frage Vollständigkeit verlangt („alle …", „wie viele …", jede Zeile einer Tabelle, eine ganze Liste): \`abschnitt\`, nicht \`query\` — die Passagensuche ordnet nach Relevanz und liefert nur die besten Treffer, nie alle.${mehrere ? '\n- `dateiname` grenzt auf eine der Dateien ein.' : ''}

NICHT für eine Zusammenfassung des ganzen Dokuments — dafür gibt es \`summarize\`, das den vollständigen Text verarbeitet statt einzelner Passagen.`,
        inputSchema: z.object({
          query: z.string().optional().describe('Präziser Suchbegriff für die Passagensuche'),
          dateiname: z
            .string()
            .optional()
            .describe('Exakter Name einer der angehängten Dateien, um darauf einzugrenzen'),
          abschnitt: z
            .object({
              von: z.number().describe('Zeichenposition, ab der gelesen wird (0 = Anfang)'),
              zeichen: z
                .number()
                .optional()
                .describe(`Wie viele Zeichen (Standard ${SLICE_DEFAULT_CHARS})`),
            })
            .optional()
            .describe('Volltext abschnittsweise lesen statt suchen'),
        }),
        execute: async ({ query, dateiname, abschnitt }) => {
          const scoped = dateiname
            ? attachedSources.filter((s) => s.label.toLowerCase() === dateiname.toLowerCase())
            : attachedSources;
          if (scoped.length === 0) {
            return {
              error:
                `Keine angehängte Datei namens "${dateiname}". Verfügbar: ` +
                attachedSources.map((s) => s.label).join(', '),
            };
          }

          // Weder Suchbegriff noch Abschnitt: bei genau einer Datei ist der
          // Anfang die ehrlichere Antwort als eine Ähnlichkeitssuche nach der
          // Frage selbst — die trifft bei „worum geht es hier" nur Zufälliges.
          const readSlice = abschnitt != null || (!query && scoped.length === 1);
          const results = readSlice
            ? await readAttachedDocumentSlice(state, scoped, {
                from: abschnitt?.von ?? 0,
                ...(abschnitt?.zeichen != null && { chars: abschnitt.zeichen }),
              })
            : await retrieveAttachedDocuments(state, query ?? '', { sources: scoped });

          if (results.length === 0) {
            return {
              error: readSlice
                ? 'Kein Text an dieser Stelle — das Dokument ist wohl kürzer.'
                : `Keine passende Passage gefunden. Mit abschnitt.von=0 lässt sich der Text von vorn lesen.`,
            };
          }
          // Eine ausdrückliche Nachlese verdient mehr Platz als ein Suchtreffer
          // — dieselbe Begründung wie an expand_attachment. Der Deckel kommt aus
          // `attachedDocuments`, wo auch die Scheibengrenze davon abgeleitet
          // ist: die beiden Zahlen dürfen nicht auseinanderlaufen, sonst
          // verliert die Scheibe ihr Ende.
          //
          // Auch die Passagensuche liegt über dem Standardmass, und zwar auf
          // demselben Wert wie der Vorab-Abruf: beide fragen dieselben Anhänge
          // mit derselben Bauform ab, und ein Deckel, der sich zwischen Seed und
          // Werkzeug unterscheidet, macht dasselbe Ergebnis je nach Aufrufer
          // unterschiedlich lang.
          const sources = readSlice
            ? sourceRegistry.register(results, { snippetChars: SLICE_REGISTER_CHARS })
            : sourceRegistry.register(results, { snippetChars: ATTACHED_DOC_SNIPPET_CHARS });
          if (!sources) return { error: 'Konnte die angehängten Dokumente nicht lesen.' };
          return { resultCount: results.length, sources };
        },
      });
    }
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
    // Ob `cloud_files` diesen Turn montiert wird — VOR dem product_knowledge-
    // Block berechnet, weil es dort einen zweiten Verbraucher hat: der Wolke-
    // Verweis im Tool-Ergebnis darf nie auf ein Werkzeug zeigen, das dieser
    // Turn gar nicht trägt. Die Tore selbst sind am Mount weiter unten erklärt.
    const wolkeInText = mentionsCloudStorage(state.lastUserTextNoMentions ?? lastUserText(state));
    const cloudFilesMounted =
      state.enabledTools?.['cloud_files'] !== false &&
      ((state.cloudConnectionCount ?? 0) > 0 ||
        (state.wolkeFiles?.length ?? 0) > 0 ||
        attachedCloudShareLinks(state.attachedWebpageUrls).length > 0 ||
        wolkeInText);
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

NUTZE WENN nach Funktionen, Fähigkeiten oder Anbindungen des Grünerators gefragt wird ("was kannst du", "welche MCP-Server kennst du", "wie erstelle ich ein Sharepic"). NICHT für politische Inhalte oder Recherche — und NICHT für die persönlichen Wolke-/Nextcloud-Verbindungen oder -Dateien der Person: welche Wolke-Links verbunden sind, beantwortet 'cloud_files' (list_connections).`,
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
          // Zweites Netz zum Beschreibungs-Steering: greift der Planer trotzdem
          // zuerst hierher (Live-Ausfall 29.08.2026, „welche wolke links sind
          // verbunden“), trägt das Ergebnis den Verweis, und der nächste
          // Schritt kann sich fangen. Nur wenn der Turn die Wolke selbst
          // nennt: ein Konto MIT Verbindung montiert cloud_files auf JEDEM
          // Turn, und eine fachfremde Produktantwort darf keinen
          // Wolke-Fußnotensatz bekommen (Review-Befund auf #3062).
          return {
            knowledge:
              cloudFilesMounted && wolkeInText
                ? `${knowledge}\n\nHinweis: Welche Wolke-/Nextcloud-Freigaben die Person verbunden hat, steht hier nicht — das beantwortet das Werkzeug cloud_files (action "list_connections").`
                : knowledge,
          };
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
      // Gated together with `documents` on purpose: they are the pointer and
      // the content of the same thing. A catalog that can LIST artifacts but
      // never OPEN one is what left "vergleiche das PDF und die Präsentation"
      // answerable only by invention.
      tools.read_artifact = makeReadArtifactTool(personalCtx);
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
    // The person's explicit memory. Only with the profile switch on: with it
    // off the prompt carries no GEDÄCHTNIS block either, and a tool that can
    // save into a store nobody reads would be a lie in the other direction.
    if (state.memoryEnabled && state.enabledTools?.['memory'] !== false) {
      tools.memory = makeMemoryTool(personalCtx);
    }
    // Wiederkehrende Aufgaben (Agentura). Nicht breit montiert — das Schema
    // trägt den ganzen Takt-Block und kostet auf jedem Turn. Drei Tore:
    //
    // 1. Der Pin. Tier 3.4 des Klassifikators erkennt den Dauerauftrag
    //    („erinnere mich jeden Montag …") und setzt `mentionPinnedTool`; der
    //    Pin zwingt den Turn in die Schleife und benennt den ersten Aufruf —
    //    aber `pinnedFirstTool` prüft die Montage, ein Pin auf ein fehlendes
    //    Werkzeug wäre still wirkungslos.
    // 2. Derselbe Detektor noch einmal, für den Fall, dass der Turn auf einem
    //    anderen Weg in die Schleife kam (Erwähnung, Verbund).
    // 3. Das Vokabular fürs Verwalten: „pausier die Erinnerung", „welche
    //    Aufgaben laufen bei mir".
    const agenturaText = state.lastUserTextNoMentions ?? lastUserText(state);
    if (
      state.enabledTools?.['recurring_tasks'] !== false &&
      (state.mentionPinnedTool === 'recurring_tasks' ||
        looksLikeRecurringOrder(agenturaText) ||
        mentionsRecurringTasks(agenturaText))
    ) {
      tools.recurring_tasks = makeRecurringTasksTool(personalCtx);
    }
    // Eigene Grünerator-Agenten (Agentura). Zwei Tore: das Vokabular („bau mir
    // einen Agenten", „meine Agenten", Persona, Systemrolle) — oder der Thread
    // läuft selbst mit einem User-Agent (`agentConfig.isUserAgent`, gesetzt in
    // `agentLoader.getAgentForUser`): dort soll „ändere deine Rolle" ohne
    // Stichwort treffen. Ein Registry-Agent montiert es nicht, er ist hier
    // ohnehin unantastbar.
    if (
      state.enabledTools?.['user_agents'] !== false &&
      (state.agentConfig?.isUserAgent === true || mentionsUserAgents(agenturaText))
    ) {
      tools.user_agents = makeUserAgentsTool(personalCtx);
    }
    // Rezepte und eigene Textformen („Texte anlernen"). Nur das Vokabular:
    // ein aktives Rezept heißt „anwenden", das macht `rezept_laden` (immer
    // montiert, sobald der Katalog nicht leer ist); verwalten will, wer es
    // sagt — „welche Rezepte gibt es", „lern meinen Stil", „lösch die Textform".
    if (state.enabledTools?.['recipes'] !== false && mentionsRecipes(agenturaText)) {
      tools.recipes = makeRecipesTool(personalCtx);
    }

    // Die verbundene Wolke. Zwei Tore, in dieser Reihenfolge:
    //
    // 1. Der Verbindungszähler (`buildStreamContext`, 60-s-Cache). Wer eine
    //    Wolke hat, bekommt das Werkzeug IMMER — „Welche Ordner gibt es?" nennt
    //    die Wolke nicht, und eine erfundene Fehlanzeige („du hast keine
    //    Dateien") ist die teuerste Ausfallform, weil sie wie eine geprüfte
    //    Antwort aussieht.
    // 2. Das Vokabular, nur für Konten OHNE Verbindung — sonst könnte niemand
    //    per Chat eine anlegen. Ein Konto ohne Wolke zahlt für dieses Werkzeug
    //    also nur, wenn es selbst davon anfängt.
    //
    // Ein Wolke-Anhang in diesem Turn zählt wie das Vokabular: die Person hat
    // die Datei über den Picker gewählt, der Text sagt darüber nichts. Aus
    // demselben Grund zählt ein über `@link` angehängter Freigabe-Link —
    // dessen URL steht ebenfalls nur in den Anhangsdaten.
    if (cloudFilesMounted) {
      tools.cloud_files = makeCloudFilesTool(personalCtx);
    }

    // PDF form tools. `hasReachableForm` carries the `isFillablePdf` verdict
    // for BOTH halves — from the DB for earlier turns, via `pdfFormCandidates`
    // (attachmentProcessing, #2835) for this one. The scope note lives at the
    // predicate, not here, so the two cannot drift.
    //
    // `hasFileData` is the load-bearing half. It used to be `mimeType` alone,
    // with the reasoning that threadAttachments carries no bytes and the tool
    // could report honestly if the stored form turned out not to be fillable.
    // That was true while nobody knew better at mount time — but the upload path
    // decides the very same question and records the answer: a PDF that
    // `isFillablePdf` rejects never gets `file_data`
    // (attachmentProcessingService), and `getThreadPdfFiles` filters on exactly
    // that column. Mounting an EARLIER turn's PDF on mimeType therefore offered
    // two tools that COULD NOT succeed — not even the honest report, since
    // `resolvePdf` never got bytes to probe. The failure was not free: forced to
    // open with a tool call (shouldForceFirstToolCall) the planner reached for
    // `read_pdf_form` on a Datenschutzerklärung and spent a step on "Es ist kein
    // PDF-Formular angehängt" — while a PDF plainly was (live 24.08.2026,
    // thread 4517d0d9).
    //
    // Not narrowed to `pdfFormAttachments`: that would take the form away one
    // turn after it was uploaded, which is the regression this comment used to
    // guard against. The predicate itself lives in `hasReachableForm` — the
    // routing stage asks the same question and used to answer it differently.
    if (hasReachableForm(state) && state.enabledTools?.['pdf_form'] !== false) {
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
      // Einmal festgehalten statt sechsmal gecastet: die Verengung aus der
      // Bedingung oben gilt in den Closures unten nicht mehr.
      const req = loop.req;
      const kind = state.compoundGenerationKind;
      // The generation tools stay mounted under a research ban — only their
      // opening line flips from "Recherchiere ZUERST" to "arbeite mit dem, was
      // im Gespräch steht". Telling the model to search with no search tool
      // mounted is how a turn stalls or invents one.
      //
      // One factory per kind, keyed by the registry's union instead of a chain
      // of `else if`. The factories genuinely differ — the PDF tool carries the
      // letterhead/sender/edit inputs, the board tool has no card path — so what
      // is unified is the LOOKUP, not the construction. The `Record<
      // ArtifactKindId, …>` is what buys the check: a new kind in the registry
      // stops compiling here until it has a factory, where the chain would just
      // have fallen through and mounted nothing at all. A turn like that still
      // promised the artifact — `forceCompoundGeneration` then looks for a tool
      // that was never there.
      const mount: Readonly<Record<ArtifactKindId, () => Tool>> = {
        sharepic: () =>
          makeCreateSharepicTool({
            sse,
            state,
            req,
            threadId: loop.threadId ?? null,
            researchBanned,
          }),
        presentation: () =>
          makeCreateDocTool({
            kind: 'presentation',
            sse,
            state,
            req,
            sourceRegistry,
            researchBanned,
          }),
        sheet: () =>
          makeCreateDocTool({
            kind: 'sheet',
            sse,
            state,
            req,
            sourceRegistry,
            researchBanned,
          }),
        document: () =>
          makeCreateDocTool({
            kind: 'document',
            sse,
            state,
            req,
            sourceRegistry,
            researchBanned,
          }),
        board: () => makeCreateBoardTool({ state, req, researchBanned }),
        pdf: () =>
          makeCreatePdfTool({
            sse,
            state,
            req,
            sourceRegistry,
            researchBanned,
          }),
      };
      // The catalog key IS the registry's `loopToolName` — the same string
      // `forceCompoundGeneration` looks the tool up by, so the two cannot drift.
      if (kind != null) {
        const { loopToolName } = artifactKind(kind);
        if (state.enabledTools?.[loopToolName] !== false) {
          tools[loopToolName] = mount[kind]();
        }
      }
    }
  }

  return { tools, toolNames: Object.keys(tools) };
}
