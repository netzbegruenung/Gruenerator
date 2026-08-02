import { getInstance, type InstancePolicyView } from '@gruenerator/shared/instances';
import {
  NOTEBOOK_REGISTRY,
  getDisabledNotebookIds,
  getNotebookDefinition,
  isNotebookOfferedUnder,
  isNotebookResolvableUnder,
} from '@gruenerator/shared/notebooks';

import { COLLECTION_MAP } from './collectionMap.js';
import { CURRENT_INSTANCE } from './instance.js';
import { getSystemCollectionConfig } from './systemCollectionsConfig.js';

/**
 * Notebook IDs that are configured but currently disabled.
 *
 * Treated as unknown by the notebook gate below, so chat/notebook routes reject
 * queries against them. Keeping the entry in `NOTEBOOK_COLLECTION_MAP` means
 * existing scrape data and admin tooling still resolve collections — only
 * end-user routing is gated.
 *
 * Derived from the shared notebook registry (`enabled: false`) so a single switch
 * cascades here automatically — no mirroring needed. Agent-only collections that
 * live outside the registry's `NotebookId` union are listed manually below.
 */
const AGENT_ONLY_DISABLED_IDS = [
  // Reachable only via the specialized `gruenerator-ricarda-lang` agent (by
  // design, not broken). Not a registry notebook, so it can't derive its state.
  'ricarda-lang-notebook',
] as const;

export const DISABLED_NOTEBOOK_IDS: ReadonlySet<string> = new Set<string>([
  ...getDisabledNotebookIds(),
  ...AGENT_ONLY_DISABLED_IDS,
]);

/**
 * Maps notebook IDs to their corresponding search collection keys.
 * Collection keys match the keys in directSearch.ts COLLECTION_MAP.
 */
export const NOTEBOOK_COLLECTION_MAP: Record<string, string[]> = {
  'gruenerator-notebook': [
    'deutschland',
    'bundestagsfraktion',
    'gruene-de',
    'kommunalwiki',
    'gruenblog',
  ],
  'gruene-notebook': ['deutschland'],
  'bundestagsfraktion-notebook': ['bundestagsfraktion'],
  'hamburg-notebook': ['hamburg'],
  'schleswig-holstein-notebook': ['schleswig-holstein'],
  'thueringen-notebook': ['thueringen'],
  'oesterreich-notebook': ['oesterreich'],
  'bayern-notebook': ['bayern'],
  'berlin-notebook': ['berlin'],
  'mecklenburg-vorpommern-notebook': ['mecklenburg-vorpommern'],
  'brandenburg-notebook': ['brandenburg'],
  'sachsen-anhalt-notebook': ['sachsen-anhalt'],
  'hessen-notebook': ['hessen'],
  'saarland-notebook': ['saarland'],
  'kommunalwiki-notebook': ['kommunalwiki'],
  'abgeordnetenwatch-notebook': ['abgeordnetenwatch'],
  'boell-stiftung-notebook': ['boell-stiftung'],
  'gruenblog-notebook': ['gruenblog'],
  'ricarda-lang-notebook': ['ricarda-lang-tweets'],
};

export function resolveNotebookCollections(notebookIds: string[]): string[] {
  const collections = new Set<string>();
  for (const id of notebookIds) {
    const mapped = NOTEBOOK_COLLECTION_MAP[id];
    if (mapped) {
      for (const c of mapped) collections.add(c);
    }
  }
  return [...collections];
}

export function isDisabledNotebook(id: string): boolean {
  return DISABLED_NOTEBOOK_IDS.has(id);
}

/**
 * The backend half of the instance content policy.
 *
 * `isKnownNotebook` used to answer two different questions with one boolean:
 * *may this notebook be searched* and *may it be resolved at all*. Once an
 * instance can merely **hide** a notebook, those answers come apart — hiding is
 * curation, not a revocation of access — so the gate has two members:
 *
 *   - {@link NotebookGate.isImplicitlySearchable} — may a turn that did **not**
 *     ask for this notebook end up searching it? A hidden notebook must not:
 *     Qdrant is shared across instances (one `QDRANT_URL`), so without this the
 *     user would never see the notebook yet still get its sources cited.
 *   - {@link NotebookGate.isResolvable} — does a direct link or an explicit
 *     `@mention` still work? For a hidden notebook **yes**, deliberately: a link
 *     shared from another instance must not die, and once it is open, search
 *     *inside* it has to keep working or the link leads to an empty page.
 *
 * Only the `block` tier and the global `enabled: false` switch answer no to both.
 */
export interface NotebookGate {
  isResolvable(id: string): boolean;
  isImplicitlySearchable(id: string): boolean;
  /**
   * Every collection reachable through a notebook this instance offers. The
   * "search everything" surfaces use this instead of the raw union.
   */
  implicitSearchCollectionIds(): string[];
  /**
   * Drop collections that only a non-offered notebook leads to. Applied to the
   * collection lists a turn did not ask for; explicit notebook scoping is left
   * untouched.
   */
  dropHiddenCollections(collectionIds: readonly string[]): string[];
}

/**
 * Build a gate from a policy view. Production uses {@link NOTEBOOK_GATE}, which
 * binds this process's instance; taking the view as an argument is what lets the
 * hidden/blocked tiers be exercised while no registered instance hides anything
 * yet.
 */
export function createNotebookGate(view: InstancePolicyView): NotebookGate {
  const isMapped = (id: string): boolean =>
    id in NOTEBOOK_COLLECTION_MAP && !DISABLED_NOTEBOOK_IDS.has(id);

  // Unknown ids (user notebooks, agent-only collections) carry no registry entry
  // and are therefore not subject to the instance policy — `isMapped` already
  // decided whether they route at all.
  const underPolicy = (id: string, predicate: typeof isNotebookOfferedUnder): boolean => {
    if (!isMapped(id)) return false;
    const nb = getNotebookDefinition(id);
    return nb ? predicate(nb, view) : true;
  };

  /**
   * Collections that no notebook this instance offers leads to.
   *
   * Two exclusions, both deliberate:
   *
   *   - Computed over the registry, not over `NOTEBOOK_COLLECTION_MAP`, so
   *     collections no registry notebook claims — `gruene-at`,
   *     `ricarda-lang-tweets` — are never in here. They are agent territory and
   *     the instance policy, written in notebooks, says nothing about them.
   *   - `enabled: false` notebooks are skipped. That switch is global and
   *     already enforced where notebooks are routed; letting it reach down to
   *     the collection layer as well would strip collections from callers that
   *     legitimately name them (admin tooling, agents pinned to an archived
   *     Landesverband). This set answers only "what does the INSTANCE remove".
   */
  const hidden = ((): ReadonlySet<string> => {
    const claimed = new Set<string>();
    const reachable = new Set<string>();
    for (const nb of NOTEBOOK_REGISTRY) {
      if (nb.enabled === false) continue;
      const keys = NOTEBOOK_COLLECTION_MAP[nb.id] ?? [];
      const offered = isNotebookOfferedUnder(nb, view);
      for (const key of keys) {
        claimed.add(key);
        if (offered) reachable.add(key);
      }
    }
    return new Set([...claimed].filter((key) => !reachable.has(key)));
  })();

  return {
    isResolvable: (id) => underPolicy(id, isNotebookResolvableUnder),
    isImplicitlySearchable: (id) => underPolicy(id, isNotebookOfferedUnder),
    implicitSearchCollectionIds: () => {
      const all = new Set<string>();
      for (const collections of Object.values(NOTEBOOK_COLLECTION_MAP)) {
        for (const c of collections) if (!hidden.has(c)) all.add(c);
      }
      return [...all];
    },
    dropHiddenCollections: (collectionIds) => collectionIds.filter((c) => !hidden.has(c)),
  };
}

/** The gate for the instance this process serves. */
export const NOTEBOOK_GATE: NotebookGate = createNotebookGate(getInstance(CURRENT_INSTANCE));

/** See {@link NotebookGate.isResolvable} — for explicit mentions and direct links. */
export function isNotebookResolvable(id: string): boolean {
  return NOTEBOOK_GATE.isResolvable(id);
}

/** See {@link NotebookGate.isImplicitlySearchable} — for defaults and catch-alls. */
export function isNotebookImplicitlySearchable(id: string): boolean {
  return NOTEBOOK_GATE.isImplicitlySearchable(id);
}

/**
 * Landesverband `shortName` codes (e.g. `HH`, `TH`, `TH-F`) belonging to a
 * disabled notebook, resolved through the existing collection chain:
 *   notebook id → NOTEBOOK_COLLECTION_MAP → collection key → COLLECTION_MAP
 *   → systemId → SYSTEM_COLLECTIONS.defaultFilter (`landesverband` value).
 *
 * Lets the scheduled scraper skip a disabled Landesverband from the SAME switch
 * (`enabled: false`) instead of a separate manual `dormant` flag. Manual
 * `scrapeSource(id)` calls are unaffected, so the data can still be re-scraped.
 */
export function getDisabledLandesverbandShortNames(): ReadonlySet<string> {
  const codes = new Set<string>();
  for (const notebookId of DISABLED_NOTEBOOK_IDS) {
    for (const key of NOTEBOOK_COLLECTION_MAP[notebookId] ?? []) {
      const systemId = COLLECTION_MAP[key]?.systemId;
      if (!systemId) continue;
      const filter = getSystemCollectionConfig(systemId)?.defaultFilter;
      if (filter?.field !== 'landesverband') continue;
      for (const value of Array.isArray(filter.value) ? filter.value : [filter.value]) {
        codes.add(value);
      }
    }
  }
  return codes;
}

/**
 * Collection IDs for the "search everything" surfaces (SearchGraph's Suche
 * mode), narrowed to what this instance actually offers.
 *
 * Was `getAllCollectionIds`; the name had to go once the answer stopped being
 * "all". Searching every collection is the broadest implicit search there is —
 * nobody named a notebook — so it is exactly where a hidden one must not appear.
 */
export function getImplicitSearchCollectionIds(): string[] {
  return NOTEBOOK_GATE.implicitSearchCollectionIds();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Heuristic to distinguish user-notebook IDs (UUIDs from `notebook_collections`)
 * from system-notebook slugs (e.g. `hamburg-notebook`). Used by chat routing to
 * split mentioned notebook IDs onto the right resolution path.
 */
export function isUserNotebookId(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Resolve user-mentioned notebook UUIDs into the document IDs that scope chat
 * search. Ownership is enforced here — UUIDs not owned by `userId` are
 * silently dropped so a forged or stale ID returns no documents.
 *
 * Imported lazily inside the function body to avoid a Qdrant-helper boot
 * dependency at module load time (the helper initialises its Qdrant client).
 */
export async function resolveUserNotebookDocumentIds(
  userId: string,
  notebookIds: string[]
): Promise<{ documentIds: string[]; resolvedUserNotebookIds: string[] }> {
  const uuids = notebookIds.filter(isUserNotebookId);
  if (uuids.length === 0 || !userId) {
    return { documentIds: [], resolvedUserNotebookIds: [] };
  }
  const { NotebookQdrantHelper } = await import('../database/services/NotebookQdrantHelper.js');
  const helper = new NotebookQdrantHelper();
  const documentIds = new Set<string>();
  const resolved: string[] = [];
  for (const uuid of uuids) {
    const collection = await helper.getNotebookCollection(uuid);
    if (!collection || collection.user_id !== userId) continue;
    resolved.push(uuid);
    const docs = await helper.getCollectionDocuments(uuid);
    for (const d of docs) {
      if (d.document_id) documentIds.add(d.document_id);
    }
  }
  return { documentIds: [...documentIds], resolvedUserNotebookIds: resolved };
}
