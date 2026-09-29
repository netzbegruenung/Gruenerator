/**
 * The agent's retrieval tools: three into the web, plus `notebook_suche` into
 * the Grünerator's own corpora when anything is in reach (see notebookTool.ts).
 *
 * Thin LangChain wrappers over the services the chat already uses — no second
 * search client, no second crawler, and in particular no second place that pays
 * Linkup. What is new here is the run budget and the failure policy.
 *
 * Three rules run through all of them:
 *
 *  - **A tool never throws.** A thrown error ends the agent's turn; a returned
 *    sentence lets it adapt ("search budget spent, write the report now"). Every
 *    failure is therefore reported as prose in the tool result.
 *  - **Every failure is retried once, then skipped.** A run that lasts a quarter
 *    of an hour must not lose a sub-question to one 503, and must not spend that
 *    quarter hour on it either. So: one more attempt, and if that fails too, a
 *    tool result that names the failure and tells the model to move on — never a
 *    silent empty answer, which a model reads as "nothing on this exists".
 *  - **Linkup's `/v1/research` endpoint is never called** (~3 EUR per prompt),
 *    and neither is `LinkupService.deepResearch` — its `sourcedAnswer` belongs
 *    to the `@deepresearch` fallback turn, which has its own quota. This agent
 *    only ever reaches `POST /v1/search`, where `deep` is capped at two calls.
 */

import { tool } from '@langchain/core/tools';

import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';
import { crawlAndDistill } from '../../search/CrawlingService.js';
import { canWebSearch, webSearch } from '../../search/webSearch.js';

import { createNotebookTool } from './notebookTool.js';
import { budgetSpent, formatHits, remember, type ToolContext } from './toolContext.js';

const log = createLogger('DeepAgentTools');

export { type ToolContext } from './toolContext.js';

/**
 * Tool schemas are JSON Schema rather than zod.
 *
 * `apps/api` runs zod 3 while the LangChain 1.x tool surface types its zod path
 * against zod 4 shapes; under `exactOptionalPropertyTypes` the two do not line
 * up (`_def.description` is optional in zod 3, required in the interop type).
 * JSON Schema is a first-class input to `tool()` and avoids pulling a second zod
 * into the app. The argument cast in each handler is the boundary assertion that
 * comes with it — the schema above it is the contract.
 *
 * The literals are written inline at each `schema:` site on purpose: routed
 * through a helper, TypeScript widens `type: 'object'` to `string` and the
 * overload stops matching.
 */

/** How much of a crawled page the distiller keeps. */
const CRAWL_TARGET_CHARS = 6000;
const CRAWL_TIMEOUT_MS = 12_000;

/**
 * How much of each hit's text survives into the tool result.
 *
 * These were 400 and 600, which is the same mistake the chat path made until
 * #2227: the engine returns far more text than that, we pay for it either way,
 * and throwing it away caps what the agent can learn per search no matter how
 * many hits come back. The chat path settled on 900–1500 for exactly this reason
 * (`snippetChars` in directSearchExecutors).
 *
 * The hit list is still a WEGWEISER, not a source — `seite_lesen` remains the
 * way to actually read something, and the researcher prompt says so. A longer
 * teaser only makes the choice of what to read an informed one.
 *
 * The deep tier gets more because it returns fewer, better hits and is the
 * expensive call: leaving its text on the table is the most wasteful truncation
 * of the three.
 */
const SEARCH_SNIPPET_CHARS = 1200;
const DEEP_SNIPPET_CHARS = 1500;

/**
 * Hits per `web_suche` call.
 *
 * Not a cost decision: `maxResults` is not a Linkup pricing dimension (depth ×
 * outputType is), and an engine that cannot serve the count is skipped by the
 * provider chain rather than asked for fewer.
 */
const MAX_SEARCH_RESULTS = 20;
const DEFAULT_SEARCH_RESULTS = 8;

/** Attempts per external call — the original plus one retry. */
const ATTEMPTS = 2;

/**
 * Tools the lead keeps to itself.
 *
 * `tiefen_suche` is the only genuinely expensive lane in this agent — Linkup
 * `deep`, capped at two calls for the whole run — and the subagents used to get
 * the lead's list verbatim. Since delegation runs concurrently, several workers
 * now compete for those two calls: the cap still holds, but which sub-question
 * gets them becomes a race rather than a decision. The lead keeps the tool and
 * researches gaps itself, which is where the choice belongs.
 *
 * The docs point the same way — "Keep this minimal and include only what's
 * needed" (Deep Agents, *Subagents*).
 */
export const LEAD_ONLY_TOOLS = new Set(['tiefen_suche']);

/**
 * What each subagent gets — the tool half of its specialisation.
 *
 * The prompt half used to carry this alone ("touches green positions? ask
 * `notebook_suche` first"), which is an instruction a model may skip. Splitting
 * by TOOLS makes the same distinction structural: a web researcher cannot reach
 * into the corpora by accident, and a programme researcher cannot answer a
 * question about the party's own resolutions out of a newspaper.
 *
 * `seite_lesen` is in both because both need to read what they found — the
 * corpus hits carry URLs to the resolutions behind them.
 *
 * Allow-lists rather than the exclusion filter this replaces: with more than one
 * subagent there is no single "everything but" to compute. The price is that a
 * NEW tool reaches nobody by default, so `tools.vitest.ts` asserts that every
 * tool is named somewhere — here or in `LEAD_ONLY_TOOLS` — which turns the
 * omission into a failing test instead of a silently unused tool.
 */
export const SUBAGENT_TOOLSETS = {
  'web-recherche': ['web_suche', 'seite_lesen'],
  'programm-recherche': ['notebook_suche', 'seite_lesen'],
} as const;

export type SubagentName = keyof typeof SUBAGENT_TOOLSETS;

/** The named subset, in the order `createResearchTools` built them. */
export function toolsFor<T extends { name: string }>(
  tools: readonly T[],
  subagent: SubagentName
): T[] {
  const wanted = new Set<string>(SUBAGENT_TOOLSETS[subagent]);
  return tools.filter((t) => wanted.has(t.name));
}

/**
 * Runs `attempt` up to `ATTEMPTS` times and returns null when all of them fail.
 *
 * Null rather than a throw, because the caller's job is to turn a dead call into
 * a sentence the model can act on. The last error goes to `onFail` for the log —
 * a swallowed cause is how "the agent found nothing" stays unexplained.
 *
 * There is deliberately no pause between attempts: a second try either works
 * immediately or not at all, and a blanket sleep would only spend the run's
 * clock to look diligent.
 */
async function retrying<T>(
  attempt: (tryNo: number) => Promise<T>,
  onFail: (error: unknown, tryNo: number) => void,
  signal?: AbortSignal
): Promise<T | null> {
  for (let tryNo = 1; tryNo <= ATTEMPTS; tryNo += 1) {
    if (signal?.aborted) return null;
    try {
      return await attempt(tryNo);
    } catch (error) {
      onFail(error, tryNo);
    }
  }
  return null;
}

/**
 * A failed crawl gets its unit back (capped — see RunBudget.crawlRefundsLeft):
 * a run whose top sources all 503 should read the next candidates instead of
 * arriving at the report with its allowance spent on nothing.
 */
function refundCrawl(ctx: ToolContext): void {
  if (ctx.budget.crawlRefundsLeft <= 0) return;
  ctx.budget.crawlRefundsLeft -= 1;
  ctx.budget.crawlsLeft += 1;
}

export function createResearchTools(ctx: ToolContext) {
  /**
   * The workhorse. Which engine answers is `WEB_SEARCH_CHAIN`'s decision
   * (webSearch.ts); a failed call is retried once as a whole, so a blip on the
   * second engine does not lose the sub-question either.
   */
  const webSuche = tool(
    async (input: unknown): Promise<string> => {
      const { query, maxResults } = input as { query: string; maxResults?: number };
      const stop = budgetSpent(ctx);
      if (stop) return stop;
      if (ctx.budget.searchesLeft <= 0) {
        return 'Suchbudget aufgebraucht. Nutze die vorhandenen Ergebnisse und schreibe den Bericht.';
      }
      const limit = Math.min(Math.max(maxResults ?? DEFAULT_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS);
      const request = { query, maxResults: limit, locale: ctx.locale };
      // Nothing asked of anyone, so nothing charged to the run.
      if (!canWebSearch(request)) {
        return 'Keine Suchmaschine verfügbar. Schreibe den Bericht aus dem vorhandenen Material.';
      }
      ctx.budget.searchesLeft -= 1;
      ctx.onStep(`Suche: ${query}`, 'running');

      const res = await retrying(
        () => webSearch(request),
        (error, tryNo) =>
          log.warn(`[web_suche] Versuch ${tryNo}/${ATTEMPTS} fehlgeschlagen: ${String(error)}`),
        // Without the signal the second attempt would still run after the deadline.
        ctx.signal
      );
      if (!res) {
        ctx.onStep(`Suche: ${query}`, 'failed');
        return 'Die Suche ist zweimal fehlgeschlagen. Überspringe diese Teilfrage oder formuliere sie anders — und arbeite sonst mit dem vorhandenen Material weiter.';
      }
      const hits = res.hits.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content.slice(0, SEARCH_SNIPPET_CHARS),
      }));
      hits.forEach((h) => remember(ctx, h.url, h.title));
      ctx.onStep(`Suche: ${query}`, 'done');
      return formatHits(hits);
    },
    {
      name: 'web_suche',
      description:
        'Sucht im Web und gibt eine nummerierte Trefferliste mit Titel, URL und Kurztext zurück. Das Standardwerkzeug für jede Teilfrage.',
      schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Die Suchanfrage, als vollständige Frage oder Stichwortkette',
          },
          maxResults: { type: 'number', description: 'Anzahl Treffer, 1–20 (Standard 8)' },
        },
        required: ['query'],
      },
    }
  );

  /**
   * Linkup's `deep` depth: multi-iteration search-and-scrape. Slow (5–30 s) and
   * the only genuinely expensive call here, hence two per run — enough for the
   * one or two sub-questions that actually need chained retrieval.
   */
  const tiefenSuche = tool(
    async (input: unknown): Promise<string> => {
      const { frage } = input as { frage: string };
      const stop = budgetSpent(ctx);
      if (stop) return stop;
      if (ctx.budget.deepSearchesLeft <= 0) {
        return 'Budget für Tiefensuchen aufgebraucht. Nutze web_suche oder schreibe den Bericht.';
      }
      const request = {
        query: frage,
        depth: 'deep' as const,
        maxResults: 15,
        locale: ctx.locale,
      };
      if (!canWebSearch(request)) return 'Tiefensuche nicht verfügbar. Nutze web_suche.';
      ctx.budget.deepSearchesLeft -= 1;
      ctx.onStep(`Tiefensuche: ${frage}`, 'running');
      const res = await retrying(
        () => webSearch(request),
        (error, tryNo) =>
          log.warn(`[tiefen_suche] Versuch ${tryNo}/${ATTEMPTS} fehlgeschlagen: ${String(error)}`),
        ctx.signal
      );
      if (!res) {
        ctx.onStep(`Tiefensuche: ${frage}`, 'failed');
        // The unit is NOT refunded: a `deep` call that reached the engine may well
        // have been billed, and the budget's job is to bound the bill.
        return 'Die Tiefensuche ist zweimal fehlgeschlagen. Überspringe sie und arbeite mit web_suche weiter.';
      }
      const hits = res.hits.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content.slice(0, DEEP_SNIPPET_CHARS),
      }));
      hits.forEach((h) => remember(ctx, h.url, h.title));
      ctx.onStep(`Tiefensuche: ${frage}`, 'done');
      return formatHits(hits);
    },
    {
      name: 'tiefen_suche',
      description:
        'Gründliche, langsame Recherche für EINE schwierige Teilfrage (mehrstufige Suche mit Seitenauswertung). Höchstens zweimal pro Auftrag — nutze sonst web_suche.',
      schema: {
        type: 'object',
        properties: {
          frage: { type: 'string', description: 'Die Teilfrage, ausformuliert' },
        },
        required: ['frage'],
      },
    }
  );

  /**
   * Read one page in full. SSRF-validated before the crawler ever sees the URL
   * (CLAUDE.md); an address that fails validation is reported back as prose so
   * the model picks a different source instead of retrying the same one.
   */
  const seiteLesen = tool(
    async (input: unknown): Promise<string> => {
      const { url, fokus } = input as { url: string; fokus?: string };
      const stop = budgetSpent(ctx);
      if (stop) return stop;
      if (ctx.budget.crawlsLeft <= 0) {
        return 'Lesebudget aufgebraucht. Nutze die vorhandenen Auszüge.';
      }
      const check = await validateUrlForFetch(url);
      if (!check.isValid || !check.url) {
        return `Diese Adresse ist nicht erlaubt oder ungültig (${check.error ?? 'ungültig'}). Wähle eine andere Quelle.`;
      }
      ctx.budget.crawlsLeft -= 1;
      const target = check.url.toString();
      let host = target;
      try {
        host = new URL(target).host;
      } catch {
        /* target is already validated; the label is cosmetic */
      }
      ctx.onStep(`Lese Quelle: ${host}`, 'running');
      // An empty result counts as a failure so the retry covers it too: a page
      // that answers with nothing on the first attempt (slow render, a 503 the
      // crawler swallowed) is the ordinary case a second try fixes.
      const text = await retrying(
        async () => {
          const crawled = await crawlAndDistill(
            [{ url: target, title: target, content: '', relevance: 1 }],
            fokus ?? '',
            {
              maxUrls: 1,
              timeout: CRAWL_TIMEOUT_MS,
              // query-focused when the caller named a focus, faithful otherwise:
              // without a question a relevance filter would drop the very passage
              // the agent went looking for.
              mode: fokus ? 'query-focused' : 'faithful',
              targetChars: CRAWL_TARGET_CHARS,
            }
          );
          const page = crawled[0];
          const content = page?.content || page?.fullContent || '';
          if (!page?.crawled || !content) throw new Error('kein Inhalt extrahiert');
          remember(ctx, target, page.title || host);
          return content;
        },
        (error, tryNo) =>
          log.warn(`[seite_lesen] ${host} Versuch ${tryNo}/${ATTEMPTS}: ${String(error)}`),
        ctx.signal
      );

      if (!text) {
        ctx.onStep(`Lese Quelle: ${host}`, 'failed');
        refundCrawl(ctx);
        return `Die Seite ${host} war auch im zweiten Versuch nicht lesbar. Überspringe sie: nimm den Suchtreffer-Auszug oder eine andere Quelle.`;
      }
      ctx.onStep(`Lese Quelle: ${host}`, 'done');
      return `Inhalt von ${target}:\n\n${text}`;
    },
    {
      name: 'seite_lesen',
      description:
        'Liest eine Webseite im Volltext. Nutze es für die besten zwei bis drei Treffer einer Suche, wenn der Kurztext nicht reicht.',
      schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Vollständige URL inklusive https://' },
          fokus: {
            type: 'string',
            description: 'Worauf es auf der Seite ankommt — schärft die Auswertung',
          },
        },
        required: ['url'],
      },
    }
  );

  // The notebook tool only exists when something is actually in reach — see
  // buildNotebookScope. Offering it otherwise would spend a turn on an empty room.
  const notebookTool = ctx.notebooks ? createNotebookTool(ctx, ctx.notebooks) : null;

  return notebookTool
    ? [webSuche, tiefenSuche, seiteLesen, notebookTool]
    : [webSuche, tiefenSuche, seiteLesen];
}
