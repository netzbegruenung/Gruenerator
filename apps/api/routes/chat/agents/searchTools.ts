/**
 * Shared AI-SDK search/research tools for grounded generation.
 *
 * Shared between the chat handler and the async board agent so both author
 * with the same grounded tool set. Both run them on-demand
 * (`toolChoice: 'auto'`) — a turn that needs no tool simply answers.
 */
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import { NOTEBOOK_GATE } from '../../../config/notebookCollectionMap.js';
import {
  getCanonicalByKey,
  getMcpExposedCollections,
} from '../../../config/systemCollectionsConfig.js';
import { normalizeDomainList } from '../../../services/search/domainFilters.js';
import { createDeepTierBudget, SEARCH_TIERS } from '../../../services/search/searchDepth.js';
import { createLogger } from '../../../utils/logger.js';

import {
  deduplicateByUrl,
  executeDirectSearch,
  executeDirectExamplesSearch,
  executeDirectPressemitteilungExamples,
  executeDirectWebSearch,
} from './directSearch.js';
import { lvEbeneForMentions, narrowLvScopeToEbene, resolveExamplesLvScope } from './lvScope.js';

import type { DirectSearchResult } from './directSearch.js';
import type { AgentConfig } from './types.js';

const log = createLogger('searchTools');

/**
 * Every system collection the loop may search — derived from the canonical
 * config, not hand-maintained.
 *
 * It used to be eight literals, and the eight were the whole problem: every
 * Landesverband was missing, so an agent BOUND to one ("Öffentlichkeitsarbeit
 * Hessen", `defaultNotebookIds: ['hessen-notebook']` → collection `hessen`)
 * could not reach its own corpus from inside the loop. `searchNode` resolves
 * that binding via `defaultNotebookCollectionIds`; the loop never sees it, and
 * `collection` here is a closed enum with no key to name. Measured live: a
 * "Pressemitteilung im Stil Grüne Hessen" searched `gruene-de` instead — the
 * gruene.de website scrape — and the Hessen documents were only ever consulted
 * as press-release STYLE examples via `gruenerator_pressemitteilung_examples`.
 *
 * The MCP server hit the identical wall and fixed it the same way (see
 * SEARCH_COLLECTIONS in routes/mcp-server/serverFactory.ts: using this list
 * there "silently hid twelve mcpExposed collections, every Landesverband among
 * them"). This is the other half of that finding.
 *
 * `mcpExposed` is the right filter, not `agentOnly`: it already excludes the
 * dormant corpora (`satzungen`, whose scraper is gone) and the deliberately
 * hidden Landesverband (`sachsen`), which a bare "not agent-only" test would
 * have let back in. `dropHiddenCollections` then applies the INSTANCE policy —
 * Qdrant is shared across instances, so a notebook this instance does not offer
 * must not become an ambient source just because the model can name its key
 * (`isNotebookOfferedUnder` is documented as exactly this gate).
 *
 * That gate REMOVES one collection the eight literals used to allow:
 * `boell-stiftung`, whose notebook is `channel: 'internal'` while production
 * serves only `stable`. So on production the loop could cite Böll sources for a
 * notebook the instance does not serve — the literal list had no way to know.
 * Losing it there is the policy being applied, not a regression; on an instance
 * that serves `internal` the collection is present as before.
 *
 * `examples` is excluded outright: the social-media templates are not a
 * research corpus and have their own tools (`gruenerator_examples_search`,
 * `gruenerator_pressemitteilung_examples`) with their own country and
 * Landesverband scoping. The MCP catalog drops it from its search enum for the
 * same reason.
 */
export const ALL_COLLECTIONS: readonly string[] = NOTEBOOK_GATE.dropHiddenCollections(
  getMcpExposedCollections()
    .map((c) => c.key)
    .filter((key) => key !== 'examples')
);

/** Austria is a first-class audience, not a toggle on a German default. */
const LOCALE_DEFAULT_COLLECTION: Record<string, string> = {
  'de-AT': 'oesterreich',
  'de-DE': 'deutschland',
};

const LOCALE_COUNTRY: Record<string, 'DE' | 'AT'> = {
  'de-AT': 'AT',
  'de-DE': 'DE',
};

/**
 * Collection keys that stand for MORE than one corpus.
 *
 * Austria is one audience with two scrapes behind it — `oesterreich`
 * (`oesterreich_gruene_documents`: the programmes) and `gruene-at`
 * (`gruene_at_documents`: the website). The single-pass path has always
 * searched both together (`getSupplementaryCollectionsForLocale` in searchNode
 * returns `['gruene-at']` next to the `oesterreich` locale default), and an AT
 * user has exactly ONE notebook. Making the model choose between the two would
 * be a distinction it has no basis to make — and choosing wrong costs the whole
 * corpus. So AT is a single key here, and the fan-out happens on execution.
 *
 * Members other than the head are hidden from the enum: `gruene-at` is reached
 * only through `oesterreich`.
 */
const COLLECTION_BUNDLES: Record<string, readonly string[]> = {
  oesterreich: ['oesterreich', 'gruene-at'],
};

const BUNDLED_MEMBERS: ReadonlySet<string> = new Set(
  Object.entries(COLLECTION_BUNDLES).flatMap(([head, members]) => members.filter((m) => m !== head))
);

/**
 * The collections a turn may search, narrowed to the user's country.
 *
 * Austria is a first-class audience, not a toggle: an AT user has no business
 * being offered twelve German Landesverbände, and a DE user none of the
 * Austrian corpora. This is the rule the single-pass path has always applied
 * (`getSupplementaryCollectionsForLocale`); the loop simply never had it,
 * because its list was eight hard-coded keys with both countries mixed in.
 *
 * A collection with NO declared `country` shows in both locales. That is the
 * deliberate direction to be wrong in: an over-offered collection costs one
 * irrelevant search, while a silently dropped one is unnameable and therefore
 * invisible — which is the exact failure this whole change is undoing.
 */
export function collectionsForLocale(locale: string | null | undefined): readonly string[] {
  const country = LOCALE_COUNTRY[locale ?? 'de-DE'] ?? 'DE';
  return ALL_COLLECTIONS.filter((key) => {
    if (BUNDLED_MEMBERS.has(key)) return false;
    const declared = getCanonicalByKey(key)?.country;
    return declared === undefined || declared === country;
  });
}

/**
 * One `key: what is in it` line per collection, for the `collection` enum's
 * description. The texts are the canonical ones from SYSTEM_COLLECTIONS — the
 * same strings the notebook UI and the MCP catalog show — so there is exactly
 * one place to fix a wrong one.
 *
 * A key with no canonical entry cannot occur through ALL_COLLECTIONS (it is
 * derived from that very config), only through a hand-written per-agent
 * `allowedCollections`. Such a key degrades to its bare name rather than
 * disappearing: it is still a valid enum value, and hiding it from the
 * description would make it unreachable in practice.
 */
function describeCollections(keys: readonly string[]): string {
  return keys
    .map((key) => {
      const description = getCanonicalByKey(key)?.description;
      return description ? `- ${key}: ${description}` : `- ${key}`;
    })
    .join('\n');
}

export interface CreateSearchToolsOptions {
  /**
   * Whose collections these tools may search, and which one they default to.
   * An explicit `toolRestrictions.defaultCollection` still wins: that is a
   * deliberate per-agent decision, this is only the fallback.
   *
   * REQUIRED, though it accepts `null` — a caller with genuinely no locale has
   * to write `userLocale: null` and mean it. Optional, it was forgotten exactly
   * once and the omission was invisible: the board agent never passed one, and
   * while the collection list mixed both countries that only cost an AT board
   * task the right DEFAULT. The moment the list became locale-filtered, the
   * same omission would have removed the Austrian corpora from it altogether.
   * "Forgotten" and "deliberately absent" must not look the same.
   */
  userLocale: string | null;
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
  /**
   * Die Rezepte, die in diesem Turn gelten — als Thunk, nicht als Wert: der
   * Werkzeugsatz wird einmal zu Turn-Beginn gebaut, das Rezept wählt der Loop
   * aber erst mitten im Turn über `rezept_laden`. Ein Wert wäre zum
   * Bauzeitpunkt immer leer.
   *
   * Gelesen wird nur die Landesverbands-Ebene daraus, und nur von der
   * PM-Beispielsuche. Ohne den Thunk bliebe der Ebenen-Zuschnitt auf den
   * einstufigen Pfad beschränkt.
   */
  activeRecipeMentions?: () => readonly (string | null | undefined)[];
  /**
   * Sollen die Dokumentsuchen dieses Turns ihre Chunks VOR der Gruppierung vom
   * Cross-Encoder bewerten lassen? Gesetzt ausschliesslich vom Werkzeugkatalog
   * des agentischen Loops und nur bei LOOP_RERANK_ENABLED=true. Der zweite
   * Aufrufer dieser Fabrik — der Board-Agent
   * (`services/boards/agentFlow/generate.ts:167`) — setzt es nicht und bleibt
   * unberührt.
   *
   * Der Name weicht bewusst vom durchgereichten `rerankChunks` ab: hier ist es
   * eine Aussage über den TURN, eine Ebene tiefer über den AUFRUF.
   */
  rerankSearchChunks?: boolean;
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
 * Run one search, fanning a bundle key out over its members.
 *
 * For an ordinary key this is `executeDirectSearch` verbatim. For a bundle
 * (`oesterreich`) the members are searched in parallel and merged by score, so
 * the model sees one collection and one ranked list — the fact that Austria's
 * material sits in two Qdrant collections is ours to know, not the planner's.
 *
 * The merge deliberately re-ranks across members rather than interleaving: the
 * scores come from the same embedding model and the same hybrid weights, so
 * they are comparable, and a fixed interleave would hand half the budget to
 * whichever corpus happens to be thinner on the topic.
 */
async function searchCollectionOrBundle(params: {
  query: string;
  collection: string;
  limit: number;
  rerankChunks?: boolean;
}): Promise<DirectSearchResult> {
  const { query, collection, limit, rerankChunks } = params;
  // Einmal gebaut, in BEIDE Zweige gespreizt: ein Bündel, das den Reranker
  // verliert, sieht im Ergebnis genauso aus wie eines, das ihn hat.
  const rerank = rerankChunks === true ? { rerankChunks: true as const } : {};
  const members = COLLECTION_BUNDLES[collection];
  if (!members) return executeDirectSearch({ query, collection, limit, ...rerank });

  // Each member is asked for the full limit; the merge below is what narrows.
  const parts = await Promise.all(
    members.map((member) => executeDirectSearch({ query, collection: member, limit, ...rerank }))
  );
  const merged = deduplicateByUrl(
    parts.flatMap((p) => p.results),
    (r) => r.url
  )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    collection,
    query,
    searchMode: parts[0]?.searchMode ?? 'hybrid',
    resultsCount: merged.length,
    results: merged,
    // Umgekehrter Quantor zur Zeile darunter, mit Absicht: ein Bündel ist
    // degradiert, sobald EIN Mitglied es war (dann ist die halbe Liste
    // kosinus-sortiert) — es ist aber erst gescheitert, wenn ALLE scheiterten.
    ...(parts.some((p) => p.rerankDegraded) ? { rerankDegraded: true } : {}),
    // A bundle fails only when EVERY member failed; one dead corpus next to a
    // live one is a partial result, not an error.
    ...(parts.every((p) => p.error) ? { error: true } : {}),
  };
}

/**
 * Creates search tools dynamically based on agent configuration.
 * This enables per-agent restrictions on collections (e.g., Austrian agent
 * can only search Austrian collections).
 *
 * Note: Returns ToolSet; type safety is maintained through runtime validation in
 * execute functions (Zod version conflicts in the monorepo prevent tighter types).
 */
/**
 * May this agent reach the open web at all?
 *
 * Two vocabularies share the `enabledTools` array and both have to be honoured:
 * the USER_SELECTABLE_TOOLS keys (`web`, plus the persisted legacy `research`)
 * that the agent picker writes, and the raw TOOL NAMES (`web_search`) that the
 * editor agents declare in their frontmatter. Reading only the first set would
 * silently cut the editor agents off the web.
 *
 * An agent that declares no `enabledTools` at all keeps everything — absence is
 * "not configured", not "nothing allowed"; user-created agents and the universal
 * agent rely on that.
 *
 * Unlike {@link SearchToolOptions.enabledToolKeys} (which gates the whole search
 * family for recurring/board runs) this answers the single web question, so the
 * chat catalog can drop `web_search`/`scrape_url` while keeping
 * `gruenerator_search` and the example corpora mounted.
 */
export function agentAllowsWebSearch(agentConfig: Pick<AgentConfig, 'enabledTools'>): boolean {
  const declared = agentConfig.enabledTools;
  if (!declared) return true;
  return declared.some((key) => key === 'web' || key === 'research' || key === 'web_search');
}

export function createSearchTools(
  agentConfig: AgentConfig,
  options: CreateSearchToolsOptions
): ToolSet {
  const restrictions = agentConfig.toolRestrictions;

  // One allowance per factory call, and the factory runs once per turn
  // (`buildChatToolCatalog`). Holding it here rather than inside `execute` is
  // what makes it a per-TURN budget: a per-call counter would reset on every
  // search and grant the deep engine unboundedly.
  const deepBudget = createDeepTierBudget();

  // An explicit per-agent list is a deliberate decision and is taken verbatim;
  // otherwise the turn gets what its LOCALE can use. Not `ALL_COLLECTIONS`,
  // which mixes both countries: offering an AT user twelve German
  // Landesverbände is noise, and offering a DE user the Austrian corpora is the
  // mirror image of the AT-as-a-toggle bug `LOCALE_DEFAULT_COLLECTION` exists
  // to prevent.
  const allowedCollections: readonly string[] = restrictions?.allowedCollections?.length
    ? restrictions.allowedCollections
    : collectionsForLocale(options.userLocale);

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
  // A caller that passes no locale keeps `undefined`. Both real callers now do
  // pass one — the board agent was the exception until the collection list
  // became locale-filtered and its omission stopped being survivable.
  const examplesCountry =
    restrictions?.examplesCountry ?? (options.userLocale === 'de-AT' ? 'AT' : undefined);
  // Landesverband scope for example searches — derived from the agent so an LV
  // agent only grounds in its own LV's social/press examples. Without this the
  // press tool pulls PMs from all LVs and mimics the wrong one (e.g. a
  // Brandenburg agent producing a Hessen press release).
  const examplesLvScope = resolveExamplesLvScope(agentConfig);
  /**
   * Derselbe Ausschnitt, zugeschnitten auf die Ebene des aktiven Rezepts —
   * erst beim Aufruf ausgewertet, weil das Rezept mitten im Turn dazukommen
   * kann. Nur die PM-Suche nutzt ihn: Social-Beispiele liegen in einer
   * Sammlung ohne `landesverband`-Feld.
   */
  const pressLvScope = (): string | readonly string[] | undefined =>
    narrowLvScopeToEbene(
      examplesLvScope,
      lvEbeneForMentions(options.activeRecipeMentions?.() ?? [])
    );

  log.debug(
    `[Tools] Creating tools for ${agentConfig.identifier}: collections=${allowedCollections.join(',')}, default=${defaultCollection}, personSearch=disabled, examplesCountry=${examplesCountry || 'all'}`
  );

  const tools: ToolSet = {};

  tools.gruenerator_search = tool({
    description: `Durchsuche grüne Parteiprogramme, Positionen und Beschlüsse — bundesweit sowie je Landesverband.

NUTZE WENN:
- Fragen zu grünen Positionen ("Was sagen die Grünen zu...")
- Politische Standpunkte oder Beschlüsse benötigt
- Zitate aus Parteiprogrammen gewünscht
- Grüne Politik/Programmatik gefragt
- Inhalte eines bestimmten Landesverbands gebraucht werden (eigene Sammlung je LV)
- Es um Kommunalpolitik geht — Gemeinderat, Stadtrat, Kreistag, kommunaler Haushalt, Gemeindeordnung: dafür ist \`kommunalwiki\` die einschlägige Sammlung

Geht es um einen konkreten Landesverband, durchsuche dessen Sammlung UND die bundesweite Programmatik (\`deutschland\`).

NICHT FÜR: Aktuelle Nachrichten, Personen-Infos, allgemeine Web-Suche`,
    inputSchema: z.object({
      query: z.string().describe('Suchanfrage in deutscher Sprache'),
      collection: z
        .enum(allowedCollections as [string, ...string[]])
        .optional()
        .default(defaultCollection)
        // The bare key list this used to be ("Sammlung: deutschland, …,
        // gruene-de, …") carried no semantics, and the keys mislead on their
        // own: `gruene-de` reads like "die Grünen (DE)" but is the gruene.de
        // WEBSITE scrape, while the programmes live under `deutschland`. A
        // planner asked for "Grüne Hessen" duly picked `gruene-de` and cited
        // five web pages. The descriptions already exist in SYSTEM_COLLECTIONS.
        .describe(`Sammlung — wähle nach Inhalt:\n${describeCollections(allowedCollections)}`),
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
        return await searchCollectionOrBundle({
          query,
          collection,
          limit,
          ...(options.rerankSearchChunks === true && { rerankChunks: true }),
        });
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
        const lvScope = pressLvScope();
        const results = await executeDirectPressemitteilungExamples({
          query,
          ...(lvScope !== undefined && { lvScope }),
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
- tiefenrecherche: 20 Quellen, die Top-Treffer werden im Volltext gelesen. Dauert 15–30 Sekunden. Nimm sie, wenn der Benutzer ausdrücklich gründlich recherchiert haben will ODER wenn die Frage sie sachlich braucht (viele Teilaspekte, strittige Faktenlage, eine gründliche Suche kam eben dünn zurück). Du hast dafür EINEN Aufruf pro Antwort, den der Benutzer nicht verlangt haben muss — gib ihn der Frage, die ihn am nötigsten hat, nicht der ersten.

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
          'Rechercheaufwand: gruendlich (Normalfall, 10 Quellen) oder tiefenrecherche (20 Quellen + Volltext, langsam, einmal pro Antwort ohne ausdrücklichen Wunsch)'
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
        // The model's tier is a request in both directions: clamped UP to the
        // normal case (a five-snippet answer must not be one skipped instruction
        // away) and, upward, metered rather than forbidden.
        //
        // The deep engine used to be reachable only through
        // `isExplicitDeepRequest`, a regex over the user's phrasing. That guard
        // cannot see what a search returned, so a model staring at ten thin hits
        // had no way to escalate and no way to say so. `deepBudget` gives it one
        // deep call per turn on its own judgement — the budget lives on the
        // factory, which runs once per turn, so it is a per-turn allowance and
        // not a per-call permission.
        const explicitDeep = options.explicitDeepRequest ?? false;
        const before = deepBudget.remaining;
        const tier = deepBudget.resolve({ intent: 'web', requestedTier: tiefe, explicitDeep });
        if (tier !== tiefe) {
          log.info(`[Tools] web_search tier clamped: ${tiefe} → ${tier}`);
        } else if (deepBudget.remaining < before) {
          log.info(
            `[Tools] web_search: modellinitiierte Tiefenrecherche gewährt (Rest ${deepBudget.remaining})`
          );
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
  // reachable by the word "recherchiere" alone. Recherche is now the upper two
  // tiers of `web_search`, so the answer — and every [N] in it — stays ours.

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
