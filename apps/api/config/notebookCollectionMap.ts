/**
 * Notebook IDs that are configured but currently disabled.
 *
 * Treated as unknown by `isKnownNotebook`, so chat/notebook routes reject queries
 * against them. Keeping the entry in `NOTEBOOK_COLLECTION_MAP` means existing
 * scrape data and admin tooling still resolve collections — only end-user routing
 * is gated. Mirror in `apps/web/src/features/notebook/config/notebooksConfig.ts`
 * (`enabled: false`) to also hide from the gallery.
 */
export const DISABLED_NOTEBOOK_IDS: ReadonlySet<string> = new Set<string>([
  'schleswig-holstein-notebook',
  // Agent-only (by design, not broken): reachable only via the specialized
  // `gruenerator-ricarda-lang` agent. End-user routes reject queries against it.
  'ricarda-lang-notebook',
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
