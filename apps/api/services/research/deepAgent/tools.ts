/**
 * The agent's retrieval tools: three into the web, plus `notizbuch_suche` into
 * the Grünerator's own corpora when anything is in reach (see notebookTool.ts).
 *
 * Thin LangChain wrappers over the services the chat already uses — no second
 * search client, no second crawler, and in particular no second place that pays
 * Linkup. What is new here is the run budget and the failure policy.
 *
 * Two rules run through all of them:
 *
 *  - **A tool never throws.** A thrown error ends the agent's turn; a returned
 *    sentence lets it adapt ("search budget spent, write the report now"). Every
 *    failure is therefore reported as prose in the tool result.
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

export function createResearchTools(ctx: ToolContext) {
  /**
   * The workhorse. GreenPT first because it is cheaper, greener and faster;
   * Linkup `standard` catches everything GreenPT declines.
   *
   * GreenPT signals throttling by returning an EMPTY result set with HTTP 200,
   * which its service turns into `GreenPTEmptyError`, and it refuses rather than
   * queues a call inside its 5 s gate. Both are ordinary fallbacks here, not
   * errors: during a fan-out we will hit that gate constantly and simply pay
   * Linkup instead.
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
        try {
          const results = await greenpt.webSearch({
            query,
            maxResults: limit,
            language: hint.greenpt,
          });
          const hits = results.map((r) => ({
            url: r.url,
            title: r.title,
            snippet: r.description ?? '',
          }));
          hits.forEach((h) => remember(ctx, h.url, h.title));
          ctx.onStep(`Suche: ${query}`, 'done');
          return formatHits(hits);
        } catch (error) {
          // Throttled, rate-gated, circuit open or genuinely empty — all four
          // mean the same thing to us: ask the other engine.
          log.debug(`[web_suche] GreenPT fiel aus, weiche auf Linkup aus: ${String(error)}`);
        }
      }

      const linkup = getLinkupService();
      if (!linkup) {
        ctx.onStep(`Suche: ${query}`, 'failed');
        return 'Keine Suchmaschine verfügbar. Schreibe den Bericht aus dem vorhandenen Material.';
      }
      try {
        const res = await linkup.webSearch({
          query: `${query}${hint.queryNote}`,
          depth: 'standard',
          maxResults: limit,
        });
        const hits = res.results
          .filter((r) => r.type !== 'image' && r.content)
          .map((r) => ({ url: r.url, title: r.name, snippet: r.content.slice(0, 400) }));
        hits.forEach((h) => remember(ctx, h.url, h.title));
        ctx.onStep(`Suche: ${query}`, 'done');
        return formatHits(hits);
      } catch (error) {
        ctx.onStep(`Suche: ${query}`, 'failed');
        log.warn(`[web_suche] Linkup fehlgeschlagen: ${String(error)}`);
        return 'Die Suche ist fehlgeschlagen. Versuche eine andere Formulierung oder arbeite mit dem vorhandenen Material weiter.';
      }
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
      try {
        const res = await linkup.webSearch({
          query: `${frage}${localeHint(ctx.locale).queryNote}`,
          depth: 'deep',
          maxResults: 15,
        });
        const hits = res.results
          .filter((r) => r.type !== 'image' && r.content)
          .map((r) => ({ url: r.url, title: r.name, snippet: r.content.slice(0, 600) }));
        hits.forEach((h) => remember(ctx, h.url, h.title));
        ctx.onStep(`Tiefensuche: ${frage}`, 'done');
        return formatHits(hits);
      } catch (error) {
        ctx.onStep(`Tiefensuche: ${frage}`, 'failed');
        log.warn(`[tiefen_suche] fehlgeschlagen: ${String(error)}`);
        return 'Die Tiefensuche ist fehlgeschlagen. Arbeite mit web_suche weiter.';
      }
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
      try {
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
        const text = page?.content || page?.fullContent || '';
        if (!page?.crawled || !text) {
          ctx.onStep(`Lese Quelle: ${host}`, 'failed');
          return `Die Seite ${host} konnte nicht gelesen werden. Nutze den Suchtreffer-Auszug oder eine andere Quelle.`;
        }
        remember(ctx, target, page.title || host);
        ctx.onStep(`Lese Quelle: ${host}`, 'done');
        return `Inhalt von ${target}:\n\n${text}`;
      } catch (error) {
        ctx.onStep(`Lese Quelle: ${host}`, 'failed');
        log.warn(`[seite_lesen] fehlgeschlagen: ${String(error)}`);
        return `Die Seite ${host} konnte nicht gelesen werden. Wähle eine andere Quelle.`;
      }
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
