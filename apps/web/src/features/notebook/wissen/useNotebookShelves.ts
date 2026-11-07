import { type MarketplaceItemOf } from '@gruenerator/contracts';
import { ApiError } from '@gruenerator/shared/api';
import { useMarketplaceKind } from '@gruenerator/shared/marketplace';
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
export type ShelfEntry =
  | { kind: 'system'; key: string; notebook: NotebookConfigEntry }
  | { kind: 'own'; key: string; collection: NotebookCollection }
  | { kind: 'shared'; key: string; collection: NotebookCollection }
  | { kind: 'saved'; key: string; item: MarketplaceItemOf<'notebook'> };

/**
 * Eine Kachel unter „Deine Notebooks": klappt eine Liste auf (`entries`) oder
 * öffnet direkt ein Notebook (`notebook`). `meta` ist `null`, solange die
 * Zählung noch lädt.
 */
export type Shelf =
  | {
      id: string;
      kind: 'group';
      title: string;
      meta: string | null;
      entries: ShelfEntry[];
      /** `photos`: Fotokarten in einer Scroll-Reihe (Landesverbände), sonst Textkarten. */
      layout: 'photos' | 'cards';
    }
  | { id: string; kind: 'notebook'; title: string; meta: string; notebook: NotebookConfigEntry }
  | { id: string; kind: 'create'; title: string; meta: string };

// Notebooks, die auf /wissen keine eigene Kachel bekommen.
const HIDDEN_NOTEBOOK_IDS: readonly string[] = [
  'gruenerator-notebook',
  'gruenblog-notebook',
  'boell-stiftung-notebook',
  'abgeordnetenwatch-notebook',
];

const EMPTY: NotebookCollection[] = [];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
        (nb) => isNotebookVisibleForLocale(nb, locale) && !HIDDEN_NOTEBOOK_IDS.includes(nb.id)
      );
    const system = (nb: NotebookConfigEntry): ShelfEntry => ({
      kind: 'system',
      key: nb.id,
      notebook: nb,
    });

    const mineEntries: ShelfEntry[] = [
      ...own.map((c): ShelfEntry => ({ kind: 'own', key: `own-${c.id}`, collection: c })),
      ...shared.map((c): ShelfEntry => ({ kind: 'shared', key: `shared-${c.id}`, collection: c })),
      ...saved.map((item): ShelfEntry => ({ kind: 'saved', key: `saved-${item.ref}`, item })),
    ];
    const mine: Shelf =
      mineLoading || mineEntries.length > 0
        ? {
            id: 'meine',
            kind: 'group',
            title: 'Meine Notebooks',
            meta: mineLoading ? null : plural(mineEntries.length, 'Notebook', 'Notebooks'),
            entries: mineEntries,
            layout: 'cards',
          }
        : {
            id: 'meine',
            kind: 'create',
            title: 'Meine Notebooks',
            meta: 'Erstes Notebook anlegen',
          };

    const direct = (nb: NotebookConfigEntry): Shelf => ({
      id: nb.id,
      kind: 'notebook',
      title: nb.title,
      meta: nb.meta,
      notebook: nb,
    });

    if (isAustrian) return [...visible(getAustrianNotebooks()).map(direct), mine];

    const laender = visible(getNotebooksByCategory('landesebene'));
    const bundesverband = listed('gruene-notebook');
    const parlamente = visible(getNotebooksByCategory('parlamente'));
    const wiki = listed('kommunalwiki-notebook');

    const out: Shelf[] = [];
    if (laender.length > 0) {
      out.push({
        id: 'laender',
        kind: 'group',
        title: 'Landesverbände',
        meta: plural(laender.length, 'Landesverband', 'Landesverbände'),
        entries: [...(bundesverband ? [system(bundesverband)] : []), ...laender.map(system)],
        layout: 'photos',
      });
    } else if (bundesverband) {
      // bgst blendet die Landesverbände aus und ist zugleich die einzige
      // Instanz mit dem Bundesverband — dort steht er als eigene Kachel.
      out.push(direct(bundesverband));
    }
    if (parlamente.length > 0) {
      out.push({
        id: 'parlamente',
        kind: 'group',
        title: 'Parlamente',
        meta: plural(parlamente.length, 'Parlament', 'Parlamente'),
        entries: parlamente.map(system),
        layout: 'cards',
      });
    }
    out.push(mine);
    if (wiki) out.push(direct(wiki));
    return out;
  }, [isAustrian, locale, own, shared, saved, mineLoading]);

  return { shelves, vectorStoreDown };
}
