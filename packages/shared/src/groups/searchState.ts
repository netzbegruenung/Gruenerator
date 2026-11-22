import { type ProjectSearchState } from '@gruenerator/contracts';

import { type GroupFeedItem } from './feed.js';

export const PROJECT_SEARCH_STATE_LABELS: Record<ProjectSearchState, string> = {
  ready: 'Durchsuchbar',
  indexing: 'Wird eingelesen',
  failed: 'Einlesen fehlgeschlagen',
  not_searchable: 'Nicht durchsuchbar',
  stale: 'Wird nach Bearbeitung aktualisiert',
  pending: 'Wird bald durchsuchbar',
  over_cap: 'Außerhalb des Suchbereichs (über 200 Dateien)',
};

/** Zustände, in denen sich bald etwas ändert — der Client lädt dann nach. */
export const PROJECT_SEARCH_STATES_IN_PROGRESS: readonly ProjectSearchState[] = [
  'indexing',
  'pending',
];

export function hasSearchStateInProgress(items: GroupFeedItem[]): boolean {
  return items.some(
    (i) => !!i.searchState && PROJECT_SEARCH_STATES_IN_PROGRESS.includes(i.searchState)
  );
}

/** Nur Einträge mit Suchzustand zählen; `searchable` sind die mit `ready`. */
export function searchSummary(items: GroupFeedItem[]): { searchable: number; total: number } {
  let searchable = 0;
  let total = 0;
  for (const i of items) {
    if (!i.searchState) continue;
    total += 1;
    if (i.searchState === 'ready') searchable += 1;
  }
  return { searchable, total };
}
