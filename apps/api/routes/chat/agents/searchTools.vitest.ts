import { describe, it, expect } from 'vitest';

import {
  ALL_COLLECTIONS,
  agentAllowsWebSearch,
  collectionsForLocale,
  createSearchTools,
  namedByUser,
} from './searchTools.js';

import type { AgentConfig } from './types.js';

/**
 * Austria is a first-class audience, not a toggle on a German default. Live
 * failure: an AT user asked who the Austrian chancellor is, the planner named
 * no collection, and `gruenerator_search` ran against `deutschland` /
 * `grundsatz_documents` — 0 results, and the turn answered without grounding.
 */
const AGENT = {
  identifier: 'gruenerator-universal',
  provider: 'mistral',
  model: 'mistral-medium-2604',
  params: {},
} as unknown as AgentConfig;

/** The collection the tool falls back to when the model names none. */
function defaultCollection(tools: ReturnType<typeof createSearchTools>): unknown {
  const schema = (tools.gruenerator_search as { inputSchema: { parse: (v: unknown) => unknown } })
    .inputSchema;
  return (schema.parse({ query: 'test' }) as { collection?: unknown }).collection;
}

/**
 * Can the model name this collection at all? Asked through the schema's own
 * validation rather than by reaching into zod's internals — the wrapping of
 * `.optional().default()` around the enum is an implementation detail, "does
 * this argument validate" is the behaviour that matters.
 */
function canName(tools: ReturnType<typeof createSearchTools>, collection: string): boolean {
  const schema = (
    tools.gruenerator_search as {
      inputSchema: { safeParse: (v: unknown) => { success: boolean } };
    }
  ).inputSchema;
  return schema.safeParse({ query: 'test', collection }).success;
}

describe('createSearchTools — locale-aware default collection', () => {
  it('defaults an Austrian user to the Austrian collection', () => {
    expect(defaultCollection(createSearchTools(AGENT, { userLocale: 'de-AT' }))).toBe(
      'oesterreich'
    );
  });

  it('defaults a German user to the German collection', () => {
    expect(defaultCollection(createSearchTools(AGENT, { userLocale: 'de-DE' }))).toBe(
      'deutschland'
    );
  });

  it('keeps the previous behaviour when the caller has no locale', () => {
    // `userLocale` is required but nullable on purpose: a caller without one
    // has to say so. It used to be optional, and it was then forgotten in the
    // board-agent path — invisibly, because an absent property and a
    // deliberate "no locale" looked identical.
    expect(defaultCollection(createSearchTools(AGENT, { userLocale: null }))).toBe('deutschland');
  });

  it('lets an explicit agent restriction win over the locale', () => {
    // A deliberate per-agent decision must not be overridden by who is asking.
    const restricted = {
      ...AGENT,
      toolRestrictions: {
        allowedCollections: ['deutschland', 'oesterreich'],
        defaultCollection: 'deutschland',
      },
    } as unknown as AgentConfig;
    expect(defaultCollection(createSearchTools(restricted, { userLocale: 'de-AT' }))).toBe(
      'deutschland'
    );
  });

  it('falls back when the locale collection is not allowed for this agent', () => {
    const deOnly = {
      ...AGENT,
      toolRestrictions: { allowedCollections: ['deutschland', 'bundestagsfraktion'] },
    } as unknown as AgentConfig;
    expect(defaultCollection(createSearchTools(deOnly, { userLocale: 'de-AT' }))).toBe(
      'deutschland'
    );
  });

  it('ignores an unknown locale', () => {
    expect(defaultCollection(createSearchTools(AGENT, { userLocale: 'en-US' }))).toBe(
      'deutschland'
    );
  });

  it('leaves an Austrian caller able to reach the Austrian corpus', () => {
    // The regression a required `userLocale` now prevents: with the collection
    // list locale-filtered, a caller that omits the locale does not merely get
    // the wrong DEFAULT — `oesterreich` is not in its enum at all, so an
    // Austrian task cannot name it even explicitly.
    expect(canName(createSearchTools(AGENT, { userLocale: 'de-AT' }), 'oesterreich')).toBe(true);
    expect(canName(createSearchTools(AGENT, { userLocale: null }), 'oesterreich')).toBe(false);
    // The mirror image: a German caller keeps the German corpora.
    expect(canName(createSearchTools(AGENT, { userLocale: 'de-DE' }), 'hessen')).toBe(true);
    expect(canName(createSearchTools(AGENT, { userLocale: 'de-AT' }), 'hessen')).toBe(false);
  });
});

/**
 * The list used to be eight hand-written keys, which is how an agent bound to a
 * Landesverband ended up unable to search its own corpus: `hessen` was not in
 * the enum, so a "Pressemitteilung im Stil Grüne Hessen" searched `gruene-de`
 * (the gruene.de website scrape) and cited five web pages.
 */
describe('collection catalogue — derived, not hand-maintained', () => {
  it('offers every Landesverband the instance serves', () => {
    // The concrete failure: an LV key had to exist before the planner could
    // name it at all.
    expect(ALL_COLLECTIONS).toContain('hessen');
    for (const lv of ['hamburg', 'bayern', 'berlin', 'thueringen', 'saarland', 'brandenburg']) {
      expect(ALL_COLLECTIONS).toContain(lv);
    }
  });

  it('keeps the federal corpora the eight literals had', () => {
    for (const key of ['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki']) {
      expect(ALL_COLLECTIONS).toContain(key);
    }
  });

  it('excludes dormant, agent-only and instance-hidden corpora', () => {
    // `satzungen` lost its scraper, `ricarda-lang-tweets` belongs to one agent,
    // `sachsen` is the deliberately hidden Landesverband — all three are
    // `mcpExposed: false` or `agentOnly`.
    expect(ALL_COLLECTIONS).not.toContain('satzungen');
    expect(ALL_COLLECTIONS).not.toContain('ricarda-lang-tweets');
    expect(ALL_COLLECTIONS).not.toContain('sachsen');
    // Böll's notebook is `channel: 'internal'` and production serves only
    // `stable`; an unserved notebook must not be an implicit chat source.
    expect(ALL_COLLECTIONS).not.toContain('boell-stiftung');
  });

  it('leaves the social-media templates to their own tools', () => {
    // `examples` has country and Landesverband scoping of its own
    // (gruenerator_examples_search / _pressemitteilung_examples) and is not a
    // research corpus.
    expect(ALL_COLLECTIONS).not.toContain('examples');
  });
});

describe('collectionsForLocale — Austria is an audience, not a toggle', () => {
  it('gives an Austrian user exactly one collection', () => {
    // One audience, one notebook. The two Austrian corpora (programmes +
    // website) sit behind the single `oesterreich` key and are searched
    // together — see COLLECTION_BUNDLES.
    expect(collectionsForLocale('de-AT')).toEqual(['oesterreich']);
  });

  it('never offers an Austrian user the German Landesverbände', () => {
    const at = collectionsForLocale('de-AT');
    expect(at).not.toContain('hessen');
    expect(at).not.toContain('deutschland');
    expect(at).not.toContain('kommunalwiki');
  });

  it('never offers a German user the Austrian corpora', () => {
    const de = collectionsForLocale('de-DE');
    expect(de).not.toContain('oesterreich');
    expect(de).not.toContain('gruene-at');
  });

  it('treats an absent or unknown locale as German', () => {
    expect(collectionsForLocale(undefined)).toEqual(collectionsForLocale('de-DE'));
    expect(collectionsForLocale('en-US')).toEqual(collectionsForLocale('de-DE'));
  });

  it('hides the bundle member behind its head', () => {
    // `gruene-at` is reachable only through `oesterreich`; offering both would
    // be a distinction the planner has no basis to make, and choosing wrong
    // costs a whole corpus.
    expect(ALL_COLLECTIONS).toContain('gruene-at');
    expect(collectionsForLocale('de-AT')).not.toContain('gruene-at');
  });
});

describe('collection enum description — keys alone mislead', () => {
  function collectionDescription(locale: string): string {
    const schema = (
      createSearchTools(AGENT, { userLocale: locale }).gruenerator_search as {
        inputSchema: { shape: { collection: { description?: string } } };
      }
    ).inputSchema;
    return schema.shape.collection.description ?? '';
  }

  it('says what each collection actually contains', () => {
    const described = collectionDescription('de-DE');
    // The trap this fixes: `gruene-de` reads like "die Grünen (DE)" but is the
    // website scrape, while the programmes live under `deutschland`.
    expect(described).toContain('gruene-de: Inhalte von gruene.de');
    expect(described).toContain('deutschland: Grundsatzprogramm');
    expect(described).toContain('hessen: ');
  });

  it('describes only what this locale may search', () => {
    expect(collectionDescription('de-AT')).not.toContain('hessen:');
  });
});

/**
 * The site scope the model passes on is a REQUEST, and `namedByUser` is what
 * keeps it from becoming an invented narrowing. It also has to let the user's
 * OWN narrowing through, which is where it failed live on 02.08.2026: "nutze
 * ausschließlich Primärquellen von EU-Kommission, Rat der EU und Europäischem
 * Parlament" names no hostname, so the correct scope was dropped three times and
 * the answer came off the open web.
 */
describe('namedByUser — user narrowing vs. invented narrowing', () => {
  const EU_ASK =
    'Nutze ausschließlich Primärquellen von EU-Kommission, Rat der EU und Europäischem Parlament.';

  it('lets an institution the user named authorise its own hosts', () => {
    expect(namedByUser('ec.europa.eu', EU_ASK)).toBe(true);
    expect(namedByUser('consilium.europa.eu', EU_ASK)).toBe(true);
    expect(namedByUser('europarl.europa.eu', EU_ASK)).toBe(true);
    expect(namedByUser('europa.eu', EU_ASK)).toBe(true);
  });

  it('still drops a host the user never named', () => {
    // The failure this guard exists for: the planner narrowing "the web" to a
    // handful of outlets nobody asked for.
    expect(namedByUser('euractiv.com', EU_ASK)).toBe(false);
    expect(namedByUser('spiegel.de', EU_ASK)).toBe(false);
    expect(namedByUser('wikipedia.de', 'recherchiere im netz: wer war Marilyn Monroe')).toBe(false);
  });

  it('does not let one institution authorise another', () => {
    expect(namedByUser('europarl.europa.eu', 'Nur Quellen der EU-Kommission bitte.')).toBe(false);
    expect(namedByUser('consilium.europa.eu', 'Nur Quellen der EU-Kommission bitte.')).toBe(false);
  });

  it('keeps matching a bare host and its label', () => {
    expect(namedByUser('zeit.de', 'schau mal auf zeit.de nach')).toBe(true);
    expect(namedByUser('zeit.de', 'was schreibt die Zeit dazu?')).toBe(true);
    expect(namedByUser('orf.at', 'gibt es dazu einen Vorfall im Betrieb?')).toBe(false);
  });

  it('reads the German names that share no word with their domain', () => {
    expect(namedByUser('destatis.de', 'Zahlen vom Statistischen Bundesamt bitte')).toBe(true);
    expect(namedByUser('parlament.gv.at', 'was sagt der Nationalrat dazu?')).toBe(true);
  });
});

/**
 * The web gate for corpus-bound agents. Two vocabularies share `enabledTools`:
 * the picker's abstract keys (`web`, legacy `research`) and the editor agents'
 * raw tool names (`web_search`). Reading only the first set would cut the
 * editor agents off the web — that is what these pin.
 */
describe('agentAllowsWebSearch — corpus-bound agents keep off the open web', () => {
  const withTools = (enabledTools?: string[]): Pick<AgentConfig, 'enabledTools'> =>
    ({ enabledTools }) as Pick<AgentConfig, 'enabledTools'>;

  it('keeps the web when the agent declares nothing at all', () => {
    expect(agentAllowsWebSearch(withTools())).toBe(true);
  });

  it('honours the picker key', () => {
    expect(agentAllowsWebSearch(withTools(['search', 'web']))).toBe(true);
  });

  it('honours the persisted legacy "research" key', () => {
    expect(agentAllowsWebSearch(withTools(['research']))).toBe(true);
  });

  it('honours the editor agents’ raw tool name', () => {
    expect(agentAllowsWebSearch(withTools(['gruenerator_search', 'web_search']))).toBe(true);
  });

  it('closes the web for an agent that declares tools but no web capability', () => {
    expect(agentAllowsWebSearch(withTools(['search', 'memory', 'self_review']))).toBe(false);
  });

  it('treats an empty declaration as "nothing allowed", not as "unconfigured"', () => {
    expect(agentAllowsWebSearch(withTools([]))).toBe(false);
  });
});
