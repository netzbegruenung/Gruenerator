/**
 * The agent's retrieval tools: three into the web, plus `notizbuch_suche` into
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
import { getGreenPTSearchService } from '../../search/GreenPTSearchService.js';
import { getLinkupService } from '../../search/LinkupService.js';

import { createNotebookTool } from './notebookTool.js';
import { budgetSpent, formatHits, localeHint, remember, type ToolContext } from './toolContext.js';

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

/** Attempts per external call — the original plus one retry. */
const ATTEMPTS = 2;

/**
 * Runs `attempt` up to `ATTEMPTS` times and returns null when all of them fail.
 *
 * Null rather than a throw, because the caller's job is to turn a dead call into
 * a sentence the model can act on. The last error goes to `onFail` for the log —
 * a swallowed cause is how "the agent found nothing" stays unexplained.
 *
 * There is deliberately no pause between attempts. The one wait that helps is
 * GreenPT's 5 s spacing, and that already sits inside its own gate (`wait`
 * mode); everything else here fails on a network or parse error, where a second
 * try either works immediately or not at all. A blanket sleep would only spend
 * the run's clock to look diligent.
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
   * The workhorse — and the one place where this agent's provider policy differs
   * from the chat's.
   *
   * GreenPT is not merely tried first here, it is WAITED for: `gate: 'wait'`
   * queues behind the 5 s spacing instead of refusing, and a throttled call
   * (`GreenPTEmptyError`, its only tell) is retried rather than handed to
   * Linkup. In the chat the opposite is right — a person is watching a spinner.
   * In a run measured in minutes, dropping to the paid engine to save five
   * seconds is the wrong trade, and it is how a "GreenPT first" lane quietly
   * became a Linkup lane in practice.
   *
   * Linkup stays as the floor under it: circuit open, no key, both attempts
   * dead. It is a fallback now, not a co-equal.
   */
  const webSuche = tool(
    async (input: unknown): Promise<string> => {
      const { query, maxResults } = input as { query: string; maxResults?: number };
      const stop = budgetSpent(ctx);
      if (stop) return stop;
      if (ctx.budget.searchesLeft <= 0) {
        return 'Suchbudget aufgebraucht. Nutze die vorhandenen Ergebnisse und schreibe den Bericht.';
      }
      ctx.budget.searchesLeft -= 1;
      const limit = Math.min(Math.max(maxResults ?? 6, 1), 10);
      const hint = localeHint(ctx.locale);
      ctx.onStep(`Suche: ${query}`, 'running');

      const greenpt = getGreenPTSearchService();
      if (greenpt) {
        const results = await retrying(
          () =>
            greenpt.webSearch({
              query,
              maxResults: limit,
              language: hint.greenpt,
              gate: 'wait',
              ...(ctx.signal ? { signal: ctx.signal } : {}),
            }),
          (error, tryNo) =>
            log.debug(
              `[web_suche] GreenPT Versuch ${tryNo}/${ATTEMPTS} fehlgeschlagen: ${String(error)}`
            ),
          ctx.signal
        );
        if (results) {
          const hits = results.map((r) => ({
            url: r.url,
            title: r.title,
            snippet: r.description ?? '',
          }));
          hits.forEach((h) => remember(ctx, h.url, h.title));
          ctx.onStep(`Suche: ${query}`, 'done');
          return formatHits(hits);
        }
        log.info(`[web_suche] GreenPT nach ${ATTEMPTS} Versuchen ohne Treffer — Linkup übernimmt`);
      }

      const linkup = getLinkupService();
      if (!linkup) {
        ctx.onStep(`Suche: ${query}`, 'failed');
        // The search budget is refunded: nothing was asked of any provider, so
        // charging the run for it would shorten a report for no reason.
        ctx.budget.searchesLeft += 1;
        return 'Keine Suchmaschine verfügbar. Schreibe den Bericht aus dem vorhandenen Material.';
      }
      const res = await retrying(
        () =>
          linkup.webSearch({
            query: `${query}${hint.queryNote}`,
            depth: 'standard',
            maxResults: limit,
          }),
        (error, tryNo) =>
          log.warn(
            `[web_suche] Linkup Versuch ${tryNo}/${ATTEMPTS} fehlgeschlagen: ${String(error)}`
          )
      );
      if (!res) {
        ctx.onStep(`Suche: ${query}`, 'failed');
        return 'Die Suche ist zweimal fehlgeschlagen. Überspringe diese Teilfrage oder formuliere sie anders — und arbeite sonst mit dem vorhandenen Material weiter.';
      }
      const hits = res.results
        .filter((r) => r.type !== 'image' && r.content)
        .map((r) => ({ url: r.url, title: r.name, snippet: r.content.slice(0, 400) }));
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
          maxResults: { type: 'number', description: 'Anzahl Treffer, 1–10 (Standard 6)' },
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
      const linkup = getLinkupService();
      if (!linkup) return 'Tiefensuche nicht verfügbar. Nutze web_suche.';
      ctx.budget.deepSearchesLeft -= 1;
      ctx.onStep(`Tiefensuche: ${frage}`, 'running');
      const res = await retrying(
        () =>
          linkup.webSearch({
            query: `${frage}${localeHint(ctx.locale).queryNote}`,
            depth: 'deep',
            maxResults: 15,
          }),
        (error, tryNo) =>
          log.warn(`[tiefen_suche] Versuch ${tryNo}/${ATTEMPTS} fehlgeschlagen: ${String(error)}`),
        ctx.signal
      );
      if (!res) {
        ctx.onStep(`Tiefensuche: ${frage}`, 'failed');
        // The unit is NOT refunded: a `deep` call that reached Linkup may well
        // have been billed, and the budget's job is to bound the bill.
        return 'Die Tiefensuche ist zweimal fehlgeschlagen. Überspringe sie und arbeite mit web_suche weiter.';
      }
      const hits = res.results
        .filter((r) => r.type !== 'image' && r.content)
        .map((r) => ({ url: r.url, title: r.name, snippet: r.content.slice(0, 600) }));
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
              ...(ctx.aiWorkerPool ? { aiWorkerPool: ctx.aiWorkerPool as never } : {}),
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
