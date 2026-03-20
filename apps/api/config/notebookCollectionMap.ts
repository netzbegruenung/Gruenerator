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
  'kommunalwiki-notebook': ['kommunalwiki'],
  'boell-stiftung-notebook': ['boell-stiftung'],
  'gruenblog-notebook': ['gruenblog'],
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
  return id in NOTEBOOK_COLLECTION_MAP;
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
