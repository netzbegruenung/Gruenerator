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

import { createLogger } from '../../../utils/logger.js';

import {
  executeDirectSearch,
  executeDirectExamplesSearch,
  executeDirectPressemitteilungExamples,
  executeDirectWebSearch,
  executeResearch,
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

export interface CreateSearchToolsOptions {
  /**
   * Add the router-style `direct_response` escape hatch. The chat handler needs
   * it (it forces a tool call via toolChoice:'required'); document authoring runs
   * tools on-demand and leaves it out.
   */
  includeDirectResponse?: boolean;
  /**
   * When set, restrict the returned search tools to the agent's user-selected
   * capabilities (USER_SELECTABLE_TOOLS keys: `search` → gruenerator_search,
   * `examples` → examples/pressemitteilung, `web`/`research` → web_search/research).
   * Undefined leaves the full set (chat + board defaults unchanged).
   */
  enabledToolKeys?: readonly string[];
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

  const defaultCollection = restrictions?.defaultCollection || allowedCollections[0];
  const examplesCountry = restrictions?.examplesCountry;
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
    description: `Suche im Internet nach aktuellen Informationen und Nachrichten.

NUTZE WENN:
- Aktuelle Ereignisse oder Nachrichten gefragt
- Informationen außerhalb der Grünen-Dokumentation
- Allgemeine Fakten aus dem Web
- Externe Quellen benötigt

NICHT FÜR: Grüne Parteiprogramme (nutze gruenerator_search)`,
    inputSchema: z.object({
      query: z.string().describe('Suchanfrage in deutscher Sprache'),
      searchType: z
        .enum(['general', 'news'])
        .optional()
        .default('general')
        .describe('Suchtyp: general (allgemein) oder news (Nachrichten)'),
      maxResults: z.number().optional().default(5).describe('Maximale Anzahl Ergebnisse (1-10)'),
    }),
    execute: async ({ query, searchType, maxResults }) => {
      try {
        const results = await executeDirectWebSearch({ query, searchType, maxResults });
        return results;
      } catch (error) {
        log.error('Direct web search error:', error);
        return { error: 'Websuche fehlgeschlagen', results: [], resultsCount: 0, query };
      }
    },
  });

  // Research tool: Perplexity-style structured research with planning, multi-source search, and synthesis
  tools.research = tool({
    description: `Strukturierte Recherche mit Planung, Suche und Synthese.

NUTZE WENN:
- Der Benutzer "recherchiere", "suche nach", "finde heraus" sagt
- Komplexe Fragen mit mehreren Aspekten
- Vergleiche verschiedener Quellen gewünscht
- Themen die Kontext aus mehreren Bereichen brauchen
- Explizite Recherche-Anfragen ("nutze das recherche tool")

Das Tool plant automatisch, sucht in relevanten Quellen, und synthetisiert mit Inline-Zitaten [1], [2].

NICHT FÜR: Einfache Begrüßungen, Dankeschöns, kreative Aufgaben ohne Faktenbedarf`,
    inputSchema: z.object({
      question: z.string().describe('Die Frage oder das Thema für die Recherche'),
      depth: z
        .enum(['quick', 'thorough'])
        .optional()
        .default('quick')
        .describe(
          'Recherchetiefe: quick (schnell, 1-2 Quellen) oder thorough (gründlich, mehr Quellen)'
        ),
    }),
    execute: async ({ question, depth }) => {
      try {
        log.info(
          `[Research Tool] Starting research: "${question.slice(0, 50)}..." (depth: ${depth})`
        );
        const result = await executeResearch({
          question,
          depth,
          maxSources: depth === 'thorough' ? 10 : 6,
        });
        log.info(
          `[Research Tool] Complete: ${result.citations.length} citations, confidence: ${result.confidence}`
        );
        return result;
      } catch (error) {
        log.error('Research tool error:', error);
        return {
          answer: 'Die Recherche konnte leider nicht durchgeführt werden.',
          citations: [],
          followUpQuestions: [],
          searchSteps: [],
          confidence: 'low' as const,
          error: 'Recherche fehlgeschlagen',
        };
      }
    },
  });

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
    if (!keys.has('web') && !keys.has('research')) {
      delete tools.web_search;
      delete tools.research;
    }
  }

  return tools;
}
