/**
 * Shared AI-SDK search/research tools for grounded generation.
 *
 * Shared between the chat handler and the async board agent so both author
 * with the same grounded tool set. Both run them on-demand
 * (`toolChoice: 'auto'`) — a turn that needs no tool simply answers.
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
  /**
   * Does this turn get image hits? The CLASSIFIER decides, not the planner —
   * either because the user asked for pictures in so many words, or because it
   * judged the subject to be something you can look at (`bilder` in its JSON).
   *
   * The model has no argument for this any more. It used to (`bilder: true`), and
   * that made an explicit image request depend on the planner remembering a flag
   * one node after the question had already been answered. Briefly it was
   * unconditional instead, which put stock photos under every question about a
   * paragraph of law.
   */
  wantsImages?: boolean;
  /**
   * The user's own last message, mention tokens removed. Same role as
   * `explicitDeepRequest`: it is what a narrowing tool argument is checked
   * against. Only `seiten` uses it today — the model invents domains, and an
   * invented site scope is invisible in the answer (see `namedByUser`). Callers
   * without a user turn (board agent, document authoring) leave it unset and the
   * check is skipped.
   */
  userText?: string | null;
}

/**
 * Did the user actually name this site?
 *
 * A model-supplied `seiten` is a REQUEST like the tier is, and it is the most
 * damaging one to get wrong: it silently reduces "the web" to three hosts, and
 * the answer looks perfectly normal afterwards. Observed live on "recherchiere
 * im netz: wer war Marilyn Monroe" — the planner sent
 * `seiten: ["wikipedia.de","spiegel.de","faz.net"]`, which the user had not
 * mentioned, and every source came back from Spiegel and FAZ.
 *
 * Matched on the bare host or on its registrable label, because people write
 * "auf zeit.de", "bei der Zeit" and "Zeit Online" for the same wish. Label
 * matching is word-bounded so "orf" does not match inside another word.
 *
 * Naming an INSTITUTION counts as naming its sites — see `INSTITUTION_HOSTS`.
 */
export function namedByUser(host: string, userText: string): boolean {
  const haystack = userText.toLowerCase();
  const needle = host.toLowerCase();
  if (haystack.includes(needle)) return true;
  const label = needle.split('.')[0];
  if (label != null && label.length >= 3) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`).test(haystack)) return true;
  }
  return institutionNamed(needle, haystack);
}

/**
 * Institutions people name instead of hosts, and the hosts that ARE them.
 *
 * "Nutze ausschließlich Primärquellen von EU-Kommission, Rat der EU und
 * Europäischem Parlament" contains no hostname, so the check above dropped
 * exactly the scope the planner had got right — three times in one live turn on
 * 02.08.2026 (`site scope dropped (not named by the user): ec.europa.eu,
 * eur-lex.europa.eu, europa.eu`). The search then ran the open web and the
 * answer was built from euractiv and a blog, under an instruction that had said
 * primary sources only. That is the opposite failure to the invented scope this
 * guard was built for, and it is the worse one: the user's own narrowing was
 * silently discarded.
 *
 * Deliberately not a general "which body owns this domain?" resolver. Every
 * entry is an institution whose OWN publications are the primary source people
 * ask for, and the mapping only ever widens what the user demonstrably named —
 * the planner still cannot invent a scope out of nothing.
 *
 * Additive by design: an institution that turns up in a real request gets a
 * line here. A missing entry costs a dropped scope (today's behaviour), never a
 * wrong one.
 */
const INSTITUTION_HOSTS: ReadonlyArray<{ hosts: readonly string[]; phrases: readonly RegExp[] }> = [
  {
    hosts: ['ec.europa.eu', 'europa.eu', 'eur-lex.europa.eu'],
    phrases: [/\beu[- ]kommission\b/u, /\beurop(?:ä|ae)ische\w*\s+kommission\b/u],
  },
  {
    hosts: ['consilium.europa.eu', 'europa.eu'],
    phrases: [/\brat der eu\b/u, /\beu[- ]rat\b/u, /\beurop(?:ä|ae)ische\w*\s+rat\b/u],
  },
  {
    hosts: ['europarl.europa.eu', 'europa.eu'],
    phrases: [/\beu[- ]parlament\b/u, /\beurop(?:ä|ae)ische\w*\s+parlament\b/u],
  },
  { hosts: ['eur-lex.europa.eu'], phrases: [/\bamtsblatt der eu\b/u] },
  // Only where the common German name shares no word with the domain label —
  // "Bundestag", "Umweltbundesamt" and the like are already matched by the
  // label rule above, and a second entry for them would be dead code.
  { hosts: ['destatis.de'], phrases: [/\bstatistische[sn]? bundesamt\b/u] },
  { hosts: ['parlament.gv.at'], phrases: [/\bnationalrat(?:s|es)?\b/u] },
];

/** Did the user name an institution that owns this host? */
function institutionNamed(host: string, haystack: string): boolean {
  return INSTITUTION_HOSTS.some(
    (entry) => entry.hosts.includes(host) && entry.phrases.some((p) => p.test(haystack))
  );
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
- gruendlich: DER NORMALFALL, lass tiefe einfach weg. 10 Quellen.
- tiefenrecherche: nur wenn der Benutzer ausdrücklich eine gründliche Recherche verlangt hat. Dauert 15–30 Sekunden.

EINE SUCHE ZUR ZEIT: Starte eine Suche, lies das Ergebnis, und suche erst dann weiter, wenn wirklich etwas fehlt. Höchstens zwei Suchen gleichzeitig. War ein Ergebnis schwach, formuliere die Anfrage EINMAL anders (notfalls englisch) — schicke keine Varianten auf Vorrat los.

SCOPE GEHÖRT IN DIE PARAMETER, NICHT IN DIE ANFRAGE: Nennt der Benutzer Seiten ("such auf zeit.de und orf.at"), setze seiten; nennt er einen Zeitraum ("seit Januar", "letzte Woche"), setze zeitraum. Schreibe beides NICHT in query — dort werden es bloß Suchwörter, und die Suchmaschine filtert nichts.

BILDER: Ob eine Suche Bild-Treffer mitliefert, ist vorher entschieden — du hast dafür kein Argument. Kommen welche, sieht der Benutzer sie über deiner Antwort. Es ist Recherchematerial zum Anschauen, KEIN verwendbares Bildmaterial: verwende es nie für Sharepics oder Social-Posts, und behaupte nicht, es sei frei nutzbar. Will der Benutzer ein NEUES Bild erstellt haben, ist die Websuche das falsche Tool.

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
      // Default `gruendlich`, not `standard`. Both use Linkup's SAME engine depth
      // and the SAME single paid call — `gruendlich` only raises maxResults 5→10
      // and asks for the adjacent-keyword fan-out inside that call. Measured on
      // three queries: 1978ms → 2986ms, i.e. one second for twice the material.
      // `standard` as the default meant an open question ("wer war X") was
      // answered from five snippets, which is not enough for a complete answer
      // and read to users as the product being thin.
      // The enum keeps all three tiers even though only two are offered above:
      // `standard` is F0 — it sits in persisted tool-call arguments that later
      // turns replay, so dropping it from the schema would fail validation on
      // stored calls. `resolveSearchTier` raises it back to `gruendlich`.
      tiefe: z
        .enum(SEARCH_TIERS)
        .optional()
        .default('gruendlich')
        .describe(
          'Rechercheaufwand: gruendlich (Normalfall, 10 Quellen) oder tiefenrecherche (nur auf ausdrücklichen Wunsch, langsam)'
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
      // No `bilder`: the classifier decides (see `wantsImages` in the options).
      // As a tool argument it made an explicit image request depend on the
      // planner remembering a flag — one node after the classifier had already
      // read the question and answered exactly that.
      // No `maxResults`: the tier owns the source count. Offered to the model it
      // became a second, unlabelled way to under-buy — measured live, a
      // `tiefe: gruendlich` call arrived with `maxResults: 5` and undid the tier.
      // Unknown keys are stripped by the schema, so a replayed stored call that
      // still carries one is simply ignored rather than rejected.
    }),
    execute: async ({ query, searchType, tiefe, zeitraum, seiten, seitenAusschliessen }) => {
      try {
        // The model's tier is a request in both directions; `resolveSearchTier`
        // clamps it up to the normal case and down to what the user actually
        // consented to. Without this the deep engine is one hallucinated
        // argument away, and a five-snippet answer one skipped instruction away.
        const tier = resolveSearchTier({
          intent: 'web',
          requestedTier: tiefe,
          explicitDeep: options.explicitDeepRequest ?? false,
        });
        if (tier !== tiefe) {
          log.info(`[Tools] web_search tier clamped: ${tiefe} → ${tier}`);
        }
        // Hostnames are normalised here rather than trusted: the model reliably
        // writes "https://zeit.de/" or "www.zeit.de" when the user did, and the
        // API wants a bare host. A scheme left in place matches nothing, and the
        // failure looks like "the site had no results".
        const normalizedSites = normalizeDomainList(seiten);
        // Same rule as the tier: the model may pass a site scope on, it may not
        // invent one. An exclusion is left alone — it widens the loss to one
        // host, where an invented inclusion throws the rest of the web away.
        const userText = options.userText;
        const includeDomains =
          userText != null && userText.length > 0
            ? normalizedSites.filter((host) => namedByUser(host, userText))
            : normalizedSites;
        const invented = normalizedSites.filter((host) => !includeDomains.includes(host));
        if (invented.length > 0) {
          log.info(
            `[Tools] web_search site scope dropped (not named by the user): ${invented.join(', ')}`
          );
        }
        const excludeDomains = normalizeDomainList(seitenAusschliessen);
        return await executeDirectWebSearch({
          query,
          searchType,
          tier,
          ...(zeitraum && zeitraum !== 'anytime' ? { timeRange: zeitraum } : {}),
          ...(includeDomains.length > 0 ? { includeDomains } : {}),
          ...(excludeDomains.length > 0 ? { excludeDomains } : {}),
          // The classifier's verdict, passed through — see `wantsImages`. The
          // `maxResults` headroom keeps the images from eating the text hits, and
          // the client shows three of them, so the proxy serves three files.
          ...(options.wantsImages === true ? { includeImages: true } : {}),
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

  // `direct_response` used to be mounted here behind an `includeDirectResponse`
  // flag: a router escape hatch from the days of `toolChoice: 'required'`, where
  // a turn that needed no search still had to call SOMETHING. The loop uses
  // `toolChoice: 'auto'` and simply answers without a tool call, so neither of
  // the two callers of this factory (`toolCatalog.ts`, the board agent) ever set
  // the flag — the tool and its 400-character description were unreachable.

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
