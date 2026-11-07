import { type MarketplaceItemOf } from '@gruenerator/contracts';
import { ApiError } from '@gruenerator/shared/api';
import { useMarketplaceKind } from '@gruenerator/shared/marketplace';
import {
  SHELF_HIDDEN_NOTEBOOK_IDS,
  buildNotebookShelves,
  type Shelf as SharedShelf,
  type ShelfEntry as SharedShelfEntry,
} from '@gruenerator/shared/notebooks';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { useMemo } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import {
  getAustrianNotebooks,
  getListedNotebookById,
  getNotebooksByCategory,
  isNotebookVisibleForLocale,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';
import { useSharedNotebookCollections } from '../hooks/useSharedNotebookCollections';

import type { NotebookCollection } from '../../../types/notebook';

/** Ein Eintrag in der aufgeklappten Liste einer Kachel. */
export type ShelfEntry = SharedShelfEntry<
  NotebookConfigEntry,
  NotebookCollection,
  MarketplaceItemOf<'notebook'>
>;

/**
 * Eine Kachel unter „Deine Notebooks": klappt eine Liste auf (`entries`) oder
 * öffnet direkt ein Notebook (`notebook`). `meta` ist `null`, solange die
 * Zählung noch lädt.
 */
export type Shelf = SharedShelf<
  NotebookConfigEntry,
  NotebookCollection,
  MarketplaceItemOf<'notebook'>
>;

const EMPTY: NotebookCollection[] = [];

/** URL-Fragment eines Nutzer-Notebooks: Notion-Slug, für Altzeilen ohne Suffix die UUID. */
export const collectionSlug = (c: NotebookCollection): string =>
  c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id;

// Das Backend liefert unter „eigene" nur eigene; der Filter hält Fremdes fern,
// falls ein anderer Pfad denselben Cache befüllt.
const isOwned = (c: NotebookCollection) => c.access_source == null || c.access_source === 'owned';

// `getListedNotebookById` blendet aus, was die Instanz versteckt (der
// Bundesverband steht nur auf bgst).
const listed = (id: string) => getListedNotebookById(id) ?? null;

/**
 * Das Modell hinter „Deine Notebooks": welche Kacheln es gibt, was sie
 * aufklappen, was sie zählen. Deutschland: Landesverbände (mit dem
 * Bundesverband vorn, wo die Instanz ihn zeigt), Parlamente, Meine Notebooks,
 * KommunalWiki. Österreich:
 * die AT-Notebooks und Meine Notebooks.
 */
export function useNotebookShelves() {
  const locale = useAuthStore((s) => s.locale);
  const isAustrian = locale === 'de-AT';

  const { query } = useNotebookCollections({ isActive: true });
  const own = useMemo(() => (query.data ?? EMPTY).filter(isOwned), [query.data]);
  const ownIds = useMemo(() => new Set(own.map((c) => c.id)), [own]);

  // Über Projekte geteilte Notebooks anderer; was zugleich eigen ist, steht nur einmal.
  const sharedQuery = useSharedNotebookCollections({ enabled: true });
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
    platform: 'web',
  });
  const saved = useMemo(
    () =>
      savedQuery.items.filter(
        (item): item is MarketplaceItemOf<'notebook'> => item.kind === 'notebook'
      ),
    [savedQuery.items]
  );

  const mineLoading = query.isLoading;
  const vectorStoreDown =
    query.error instanceof ApiError && query.error.code === 'vector_store_unavailable';

  const shelves = useMemo<Shelf[]>(() => {
    const visible = (nbs: NotebookConfigEntry[]) =>
      nbs.filter(
        (nb) => isNotebookVisibleForLocale(nb, locale) && !SHELF_HIDDEN_NOTEBOOK_IDS.includes(nb.id)
      );
    return buildNotebookShelves({
      austrian: isAustrian,
      austrianNotebooks: visible(getAustrianNotebooks()),
      laender: visible(getNotebooksByCategory('landesebene')),
      bundesverband: listed('gruene-notebook'),
      parlamente: visible(getNotebooksByCategory('parlamente')),
      wiki: listed('kommunalwiki-notebook'),
      own,
      shared,
      saved,
      mineLoading,
    });
  }, [isAustrian, locale, own, shared, saved, mineLoading]);

  return { shelves, vectorStoreDown };
}
