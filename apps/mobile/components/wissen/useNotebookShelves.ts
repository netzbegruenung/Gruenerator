import { type MarketplaceItemOf } from '@gruenerator/contracts';
import { useAuth } from '@gruenerator/shared/hooks';
import { useMarketplaceKind } from '@gruenerator/shared/marketplace';
import {
  SHELF_HIDDEN_NOTEBOOK_IDS,
  buildNotebookShelves,
  type Shelf as SharedShelf,
  type ShelfEntry as SharedShelfEntry,
} from '@gruenerator/shared/notebooks';
import { useMemo } from 'react';

import {
  getMobileNotebooksByCategory,
  getVisibleNotebooks,
  type MobileNotebookEntry,
} from '../../config/notebooksConfig';
import { useSharedNotebookCollections } from '../../hooks/notebook/useSharedNotebookCollections';
import { useNotebookCollections } from '../../hooks/useNotebookCollections';

/** Was die Kacheln von einem Notebook einer Person brauchen — eigene und geteilte passen beide. */
export interface ShelfCollection {
  id: string;
  name: string;
  document_count: number;
  shared_via_groups?: string[] | null;
}

type SavedNotebook = MarketplaceItemOf<'notebook'>;

export type ShelfEntry = SharedShelfEntry<MobileNotebookEntry, ShelfCollection, SavedNotebook>;
export type Shelf = SharedShelf<MobileNotebookEntry, ShelfCollection, SavedNotebook>;

const EMPTY: ShelfCollection[] = [];
const EMPTY_SAVED: SavedNotebook[] = [];

/**
 * Das Modell hinter „Deine Notebooks“: welche Kacheln es gibt, was sie aufklappen, was
 * sie zählen. Die Regeln stehen in `buildNotebookShelves` (geteilt mit dem Web); hier
 * werden nur die Eingaben der App gesammelt. Deutschland: Landesverbände (mit dem
 * Bundesverband vorn, wo die Instanz ihn zeigt), Parlamente, Meine Notebooks,
 * KommunalWiki. Österreich: die AT-Notebooks und Meine Notebooks.
 */
export function useNotebookShelves(): { shelves: Shelf[]; mineLoading: boolean } {
  const { locale: authLocale, isAuthenticated } = useAuth();
  const locale: 'de-DE' | 'de-AT' = authLocale === 'de-AT' ? 'de-AT' : 'de-DE';

  const { collections, isLoading: mineLoading } = useNotebookCollections();
  const own = collections;
  const ownIds = useMemo(() => new Set(own.map((c) => c.id)), [own]);

  // Über Projekte geteilte Notebooks anderer; was zugleich eigen ist, steht nur einmal.
  const sharedQuery = useSharedNotebookCollections({ enabled: isAuthenticated });
  const shared = useMemo(
    () => (sharedQuery.data ?? EMPTY).filter((c) => !ownIds.has(c.id)),
    [sharedQuery.data, ownIds]
  );

  // Im Marktplatz gemerkte öffentliche Notebooks.
  const savedQuery = useMarketplaceKind({
    kind: 'notebook',
    scope: 'saved',
    origin: null,
    q: '',
    sort: 'neu',
    platform: 'mobile',
    enabled: isAuthenticated,
  });
  const saved = useMemo(
    () =>
      savedQuery.items.length === 0
        ? EMPTY_SAVED
        : savedQuery.items.filter((item): item is SavedNotebook => item.kind === 'notebook'),
    [savedQuery.items]
  );

  const shelves = useMemo<Shelf[]>(() => {
    const visible = (nbs: MobileNotebookEntry[]) =>
      nbs.filter((nb) => !SHELF_HIDDEN_NOTEBOOK_IDS.includes(nb.id));
    const all = getVisibleNotebooks(locale);
    const byId = (id: string) => all.find((nb) => nb.id === id) ?? null;
    return buildNotebookShelves<MobileNotebookEntry, ShelfCollection, SavedNotebook>({
      austrian: locale === 'de-AT',
      austrianNotebooks: visible(getMobileNotebooksByCategory('oesterreich', locale)),
      laender: visible(getMobileNotebooksByCategory('landesebene', locale)),
      bundesverband: byId('gruene-notebook'),
      parlamente: visible(getMobileNotebooksByCategory('parlamente', locale)),
      wiki: byId('kommunalwiki-notebook'),
      own,
      shared,
      saved,
      mineLoading,
    });
  }, [locale, own, shared, saved, mineLoading]);

  return { shelves, mineLoading };
}
