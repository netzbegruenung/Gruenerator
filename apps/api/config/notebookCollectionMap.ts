import { getDisabledNotebookIds } from '@gruenerator/shared/notebooks';

import { COLLECTION_MAP } from './collectionMap.js';
import { getSystemCollectionConfig } from './systemCollectionsConfig.js';

/**
 * Notebook IDs that are configured but currently disabled.
 *
 * Treated as unknown by `isKnownNotebook`, so chat/notebook routes reject queries
 * against them. Keeping the entry in `NOTEBOOK_COLLECTION_MAP` means existing
 * scrape data and admin tooling still resolve collections — only end-user routing
 * is gated.
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
  'kommunalwiki-notebook': ['kommunalwiki'],
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

export function isKnownNotebook(id: string): boolean {
  return id in NOTEBOOK_COLLECTION_MAP && !DISABLED_NOTEBOOK_IDS.has(id);
}

export function isDisabledNotebook(id: string): boolean {
  return DISABLED_NOTEBOOK_IDS.has(id);
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
 * Returns all unique collection IDs across all notebooks.
 * Used by SearchGraph to search every available collection in Suche mode.
 */
export function getAllCollectionIds(): string[] {
  const all = new Set<string>();
  for (const collections of Object.values(NOTEBOOK_COLLECTION_MAP)) {
    for (const c of collections) all.add(c);
  }
  return [...all];
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
