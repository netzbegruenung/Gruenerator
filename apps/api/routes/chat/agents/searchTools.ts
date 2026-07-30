/**
 * Shared AI-SDK search/research tools for grounded generation.
 *
 * Shared between the chat handler and the async board agent so both author
 * with the same grounded tool set. The chat handler runs these as a router
 * (toolChoice:'required') and needs the `direct_response` escape hatch;
 * document authoring runs them on-demand (toolChoice:'auto') and omits it —
 * hence the `includeDirectResponse` option.
 */
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { normalizeDomainList } from '../../../services/search/domainFilters.js';
import { resolveSearchTier, SEARCH_TIERS } from '../../../services/search/searchDepth.js';
import { createLogger } from '../../../utils/logger.js';

import {
  executeDirectSearch,
  executeDirectExamplesSearch,
  executeDirectPressemitteilungExamples,
  executeDirectWebSearch,
} from './directSearch.js';
import { resolveExamplesLvScope } from './lvScope.js';

import type { AgentConfig } from './types.js';

const log = createLogger('searchTools');

export const ALL_COLLECTIONS = [
  'deutschland',
  'oesterreich',
  'bundestagsfraktion',
  'kommunalwiki',
  'examples',
  'gruene-de',
  'gruene-at',
  'boell-stiftung',
] as const;

/** Austria is a first-class audience, not a toggle on a German default. */
const LOCALE_DEFAULT_COLLECTION: Record<string, string> = {
  'de-AT': 'oesterreich',
  'de-DE': 'deutschland',
};

export interface CreateSearchToolsOptions {
  /**
   * Add the router-style `direct_response` escape hatch. The chat handler needs
   * it (it forces a tool call via toolChoice:'required'); document authoring runs
   * tools on-demand and leaves it out.
   */
  includeDirectResponse?: boolean;
  /**
   * Whose collections to search when the model names none. Without it every
   * turn defaulted to `deutschland` — an AT user asking about Austria searched
   * the German corpus and got 0 hits (observed live). An explicit
   * `toolRestrictions.defaultCollection` still wins: that is a deliberate
   * per-agent decision, this is only the fallback.
   */
  userLocale?: string | null;
  /**
   * When set, restrict the returned search tools to the agent's user-selected
   * capabilities (USER_SELECTABLE_TOOLS keys: `search` → gruenerator_search,
   * `examples` → examples/pressemitteilung, `web`/`research` → web_search).
   * Undefined leaves the full set (chat + board defaults unchanged).
   */
  enabledToolKeys?: readonly string[];
  /**
   * Did the user ask for a thorough research in so many words? Only then may a
   * `tiefe: 'tiefenrecherche'` tool call actually reach Linkup's deep engine;
   * otherwise it is clamped one step down. The tier the model names is a REQUEST,
   * not authority — "nutze sie sparsam" in a tool description is documentation,
   * not enforcement, and a paid engine setting needs enforcement.
   */
  explicitDeepRequest?: boolean;
}

/**
 * Creates search tools dynamically based on agent configuration.
 * This enables per-agent restrictions on collections (e.g., Austrian agent
 * can only search Austrian collections).
 *
 * Note: Returns ToolSet; type safety is maintained through runtime validation in
 * execute functions (Zod version conflicts in the monorepo prevent tighter types).
 */
export function createSearchTools(
  agentConfig: AgentConfig,
  options: CreateSearchToolsOptions = {}
): ToolSet {
  const restrictions = agentConfig.toolRestrictions;

  const allowedCollections: readonly string[] = restrictions?.allowedCollections?.length
    ? restrictions.allowedCollections
    : ALL_COLLECTIONS;

  const localeDefault = options.userLocale
    ? LOCALE_DEFAULT_COLLECTION[options.userLocale]
    : undefined;
  const defaultCollection =
    restrictions?.defaultCollection ||
    (localeDefault && allowedCollections.includes(localeDefault)
      ? localeDefault
      : allowedCollections[0]);
  // Same locale fallback the deterministic search node applies (searchNode's
  // examples branch): an explicit per-agent `examplesCountry` wins, otherwise an
  // AT user grounds in Austrian examples. Without this an AT user on a generic
  // agent got German social/press posts as style templates on the loop path
  // while the single-pass path got it right — `gruene_at_documents` exists.
  // Callers that pass no locale (e.g. the board agent) keep `undefined`.
  const examplesCountry =
    restrictions?.examplesCountry ?? (options.userLocale === 'de-AT' ? 'AT' : undefined);
  // Landesverband scope for example searches — derived from the agent so an LV
  // agent only grounds in its own LV's social/press examples. Without this the
  // press tool pulls PMs from all LVs and mimics the wrong one (e.g. a
  // Brandenburg agent producing a Hessen press release).
  const examplesLvScope = resolveExamplesLvScope(agentConfig);

  log.debug(
    `[Tools] Creating tools for ${agentConfig.identifier}: collections=${allowedCollections.join(',')}, default=${defaultCollection}, personSearch=disabled, examplesCountry=${examplesCountry || 'all'}`
  );

  const tools: ToolSet = {};

  tools.gruenerator_search = tool({
    description: `Durchsuche grüne Parteiprogramme, Positionen und Beschlüsse.

NUTZE WENN:
- Fragen zu grünen Positionen ("Was sagen die Grünen zu...")
- Politische Standpunkte oder Beschlüsse benötigt
- Zitate aus Parteiprogrammen gewünscht
- Grüne Politik/Programmatik gefragt

NICHT FÜR: Aktuelle Nachrichten, Personen-Infos, allgemeine Web-Suche`,
    inputSchema: z.object({
      query: z.string().describe('Suchanfrage in deutscher Sprache'),
      collection: z
        .enum(allowedCollections as [string, ...string[]])
        .optional()
        .default(defaultCollection)
        .describe(`Sammlung: ${allowedCollections.join(', ')}`),
      limit: z.number().optional().default(5).describe('Maximale Anzahl Ergebnisse'),
    }),
    execute: async ({ query, collection, limit }) => {
      try {
        if (!allowedCollections.includes(collection)) {
          log.warn(`[Tools] Collection "${collection}" not allowed for ${agentConfig.identifier}`);
          return {
            error: 'Sammlung nicht verfügbar',
            results: [],
            collection,
            query,
          };
        }
        const results = await executeDirectSearch({ query, collection, limit });
        return results;
      } catch (error) {
        log.error('Direct search error:', error);
        return { error: 'Suche fehlgeschlagen', results: [], collection, query };
      }
    },
  });

  tools.gruenerator_examples_search = tool({
    description: `Suche nach Social-Media-Beispielen und Vorlagen.

NUTZE WENN:
- Beispiele für Social-Media-Posts gesucht
- Vorlagen für Instagram oder Facebook benötigt
- Inspiration für grüne Social-Media-Kommunikation

NICHT FÜR: Allgemeine Informationssuche, Fakten, Nachrichten`,
    inputSchema: z.object({
      query: z.string().describe('Thema oder Stichwort'),
      platform: z.enum(['instagram', 'facebook']).optional().describe('Plattform filtern'),
    }),
    execute: async ({ query, platform }) => {
      try {
        const results = await executeDirectExamplesSearch({
          query,
          ...(platform && { platform }),
          ...(examplesCountry && { country: examplesCountry }),
          ...(examplesLvScope !== undefined && { lvScope: examplesLvScope }),
        });
        return results;
      } catch (error) {
        log.error('Direct examples search error:', error);
        return { error: 'Beispielsuche fehlgeschlagen', examples: [], resultsCount: 0 };
      }
    },
  });

  tools.gruenerator_pressemitteilung_examples = tool({
    description: `Suche nach echten Pressemitteilungen aus Landesverbänden als Inspiration und Vorlage.

NUTZE WENN:
- Eine Pressemitteilung verfasst werden soll
- Beispiele für journalistische PM-Sprache und Aufbau gebraucht werden
- Du sehen willst, wie andere Landesverbände PMs zu ähnlichen Themen formulieren

NICHT FÜR: Social-Media-Posts (nutze gruenerator_examples_search), allgemeine Recherche (nutze gruenerator_search), Anträge oder Reden.`,
    inputSchema: z.object({
      query: z.string().describe('Thema der Pressemitteilung'),
    }),
    execute: async ({ query }) => {
      try {
        const results = await executeDirectPressemitteilungExamples({
          query,
          ...(examplesLvScope !== undefined && { lvScope: examplesLvScope }),
          ...(examplesCountry && { country: examplesCountry }),
        });
        return results;
      } catch (error) {
        log.error('Direct pressemitteilung examples error:', error);
        return {
          error: 'Pressemitteilung-Suche fehlgeschlagen',
          examples: [],
          resultsCount: 0,
        };
      }
    },
  });

  tools.web_search = tool({
    description: `Suche im Internet nach aktuellen Informationen, Fakten und Nachrichten — in drei Stufen.

NUTZE WENN:
- Aktuelle Ereignisse oder Nachrichten gefragt
- Informationen außerhalb der Grünen-Dokumentation
- Allgemeine Fakten aus dem Web
- Externe Quellen benötigt
- Der Benutzer "recherchiere", "finde heraus" oder "belege für" sagt → höhere Stufe

WÄHLE DIE STUFE NACH AUFWAND, NICHT NACH WORTLAUT:
- standard: eine klare Faktenfrage, ein Datum, eine Zahl, eine Nachricht. Der Normalfall.
- gruendlich: mehrere Aspekte oder ein Vergleich. Deckt das Thema breiter ab, dauert kaum länger.
- tiefenrecherche: nur wenn der Benutzer ausdrücklich eine gründliche Recherche verlangt hat. Dauert 15–30 Sekunden.

EINE SUCHE ZUR ZEIT: Starte eine Suche, lies das Ergebnis, und suche erst dann weiter, wenn wirklich etwas fehlt. Höchstens zwei Suchen gleichzeitig. War ein Ergebnis schwach, formuliere die Anfrage EINMAL anders (notfalls englisch) — schicke keine Varianten auf Vorrat los.

SCOPE GEHÖRT IN DIE PARAMETER, NICHT IN DIE ANFRAGE: Nennt der Benutzer Seiten ("such auf zeit.de und orf.at"), setze seiten; nennt er einen Zeitraum ("seit Januar", "letzte Woche"), setze zeitraum. Schreibe beides NICHT in query — dort werden es bloß Suchwörter, und die Suchmaschine filtert nichts.

NICHT FÜR: Grüne Parteiprogramme (nutze gruenerator_search)`,
    inputSchema: z.object({
      query: z.string().describe('Suchanfrage in deutscher Sprache'),
      searchType: z
        .enum(['general', 'news'])
        .optional()
        .default('general')
        // F0: persisted in tool-call arguments, so the name stays. Its function
        // moved to `zeitraum` — on the Linkup path it only ever set a SearXNG
        // category, i.e. nothing at all. It now buys a 30-day window.
        .describe('Suchtyp: general (allgemein) oder news (nur die letzten 30 Tage)'),
      tiefe: z
        .enum(SEARCH_TIERS)
        .optional()
        .default('standard')
        .describe(
          'Rechercheaufwand: standard (schnell), gruendlich (mehrere Quellen), tiefenrecherche (nur auf ausdrücklichen Wunsch, langsam)'
        ),
      zeitraum: z
        .enum(['anytime', 'day', 'week', 'month', 'year'])
        .optional()
        .describe(
          'Nur Treffer aus diesem Zeitfenster. Setze es, wenn der Benutzer einen Zeitbezug nennt — nicht vorsorglich, ein zu enges Fenster liefert nichts.'
        ),
      seiten: z
        .array(z.string())
        .optional()
        .describe(
          'Nur auf diesen Domains suchen, z.B. ["zeit.de","orf.at"] — reine Hostnamen ohne https://. Nur wenn der Benutzer Seiten genannt hat.'
        ),
      seitenAusschliessen: z
        .array(z.string())
        .optional()
        .describe('Diese Domains überspringen, z.B. ["reddit.com"]. Reine Hostnamen.'),
      maxResults: z
        .number()
        .optional()
        .describe('Optional: Anzahl Ergebnisse überschreiben (sonst aus der Stufe)'),
    }),
    execute: async ({
      query,
      searchType,
      tiefe,
      zeitraum,
      seiten,
      seitenAusschliessen,
      maxResults,
    }) => {
      try {
        // The model's tier is a request; `resolveSearchTier` clamps it to what the
        // user actually consented to. Without this the deep engine is one
        // hallucinated argument away, on every turn.
        const tier = resolveSearchTier({
          intent: 'web',
          requestedTier: tiefe,
          explicitDeep: options.explicitDeepRequest ?? false,
        });
        if (tier !== tiefe) {
          log.info(
            `[Tools] web_search tier clamped: ${tiefe} → ${tier} (no explicit deep request)`
          );
        }
        // Hostnames are normalised here rather than trusted: the model reliably
        // writes "https://zeit.de/" or "www.zeit.de" when the user did, and the
        // API wants a bare host. A scheme left in place matches nothing, and the
        // failure looks like "the site had no results".
        const includeDomains = normalizeDomainList(seiten);
        const excludeDomains = normalizeDomainList(seitenAusschliessen);
        return await executeDirectWebSearch({
          query,
          searchType,
          tier,
          ...(zeitraum && zeitraum !== 'anytime' ? { timeRange: zeitraum } : {}),
          ...(includeDomains.length > 0 ? { includeDomains } : {}),
          ...(excludeDomains.length > 0 ? { excludeDomains } : {}),
          ...(maxResults != null ? { maxResults } : {}),
        });
      } catch (error) {
        log.error('Direct web search error:', error);
        return { error: 'Websuche fehlgeschlagen', results: [], resultsCount: 0, query };
      }
    },
  });

  // The separate `research` tool is gone: it was a second door into a different
  // engine (Linkup depth=deep + sourcedAnswer, i.e. LINKUP wrote the answer)
  // reachable by the word "recherchiere" alone, and it exposed a `depth` choice
  // that `executeResearch` discarded before Linkup ever saw it. Recherche is now
  // the upper two tiers of `web_search`, so the answer — and every [N] in it —
  // stays ours. `executeResearch` itself lives on for the Monitor's daily
  // briefing (HotTopicPipeline), which genuinely wants a ready-made report.

  // Direct response tool: router escape hatch for non-search cases (chat handler only)
  if (options.includeDirectResponse) {
    tools.direct_response = tool({
      description: `Antworte direkt ohne externe Suche.

NUTZE DIESES TOOL WENN:
- Begrüßungen/Verabschiedungen ("Hallo", "Danke", "Tschüss")
- Allgemeine Konversation ohne Informationsbedarf
- Kreative Aufgaben mit bereits gegebenen Infos (z.B. Instagram-Posts, Texte schreiben)
- Klarstellende Nachfragen
- Der Benutzer explizit KEINE Suche möchte
- Einfache Folgefragen zu bereits besprochenen Themen

NICHT NUTZEN wenn Fakten, aktuelle Infos oder Belege gefragt sind.`,
      inputSchema: z.object({
        content: z.string().describe('Die vollständige Antwort an den Benutzer'),
        reason: z.string().optional().describe('Optional: Warum keine Suche nötig war'),
      }),
      execute: async ({ content, reason }) => {
        log.debug(`[Direct Response] Content length: ${content?.length}, Reason: ${reason}`);
        return { type: 'direct', content, reason };
      },
    });
  }

  // Optional per-agent gating: recurring agents honor their picker selection.
  // Undefined → keep everything (board/chat behavior unchanged).
  if (options.enabledToolKeys) {
    const keys = new Set(options.enabledToolKeys);
    if (!keys.has('search')) delete tools.gruenerator_search;
    if (!keys.has('examples')) {
      delete tools.gruenerator_examples_search;
      delete tools.gruenerator_pressemitteilung_examples;
    }
    // `research` is still accepted as a key: it is persisted in agent configs
    // (F0), and an agent that was given "Recherche" must keep its web access
    // now that recherche IS the web tool at a deeper tier.
    if (!keys.has('web') && !keys.has('research')) {
      delete tools.web_search;
    }
  }

  return tools;
}
