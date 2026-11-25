import { type MarketplaceItemOf } from '@gruenerator/contracts';
import {
  marketplaceHref,
  useMarketplaceKind,
  useMarketplaceSave,
} from '@gruenerator/shared/marketplace';
import { Button, DropdownMenuItem, SectionHeader, toast } from '@gruenerator/ui';
import { useMemo } from 'react';
import { PiBookmarkSimple, PiBooks, PiPlus, PiStorefront } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { getToolTheme } from '../../../config/toolTheme';
import { notebookFavouriteId } from '../../../stores/sidebarFavouritesStore';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { type NotebookConfigEntry } from '../../notebook/config/notebooksConfig';
import { useSharedNotebookCollections } from '../../notebook/hooks/useSharedNotebookCollections';
import { OwnNotebookActions } from '../../notebook/wissen/OwnNotebookMenu';
import { collectionSlug } from '../../notebook/wissen/useNotebookShelves';

import { FavouriteMenuItem } from './FavouriteMenuItem';
import { TileCard, type TileTone } from './TileCard';

import type { NotebookCollection } from '@/types/notebook';

const FALLBACK_TONE: TileTone = {
  tile: 'bg-grey-50 dark:bg-grey-800/40',
  icon: 'text-secondary-600',
  title: 'text-foreground-heading',
  desc: 'text-muted-foreground',
};

const EMPTY: NotebookCollection[] = [];
const isOwned = (c: NotebookCollection) => c.access_source == null || c.access_source === 'owned';
const byName = (a: NotebookCollection, b: NotebookCollection) => a.name.localeCompare(b.name);

/**
 * Eigene Notebooks und die, die andere in ein gemeinsames Projekt geteilt
 * haben (ohne Doppelte). Die System-Notebooks stehen im Marktplatz.
 */
export function useMyNotebooks() {
  const { query } = useNotebookCollections({ isActive: true });
  const sharedQuery = useSharedNotebookCollections();
  const lists = useMemo(() => {
    const ownList = (query.data ?? EMPTY).filter(isOwned);
    const ownIds = new Set(ownList.map((c) => c.id));
    return {
      own: [...ownList].sort(byName),
      shared: (sharedQuery.data ?? EMPTY).filter((c) => !ownIds.has(c.id)).sort(byName),
    };
  }, [query.data, sharedQuery.data]);
  return { ...lists, loading: query.isLoading, failed: query.isError };
}

type SavedNotebook = MarketplaceItemOf<'notebook'>;

/**
 * Im Marktplatz gemerkte Notebooks (öffentliche und System-Notebooks), ohne
 * die, die schon als eigene oder geteilte dastehen. Nur die erste Seite des
 * Marktplatzes (24), wie früher auf /wissen.
 */
function useSavedNotebooks(shownIds: ReadonlySet<string>) {
  const query = useMarketplaceKind({
    kind: 'notebook',
    scope: 'saved',
    origin: null,
    q: '',
    sort: 'neu',
    platform: 'web',
  });
  const items = useMemo(
    () =>
      query.items.filter(
        (item): item is SavedNotebook =>
          // `saved` fällt beim Entmerken sofort, die Liste lädt erst danach neu.
          item.kind === 'notebook' && item.saved && !shownIds.has(item.ref)
      ),
    [query.items, shownIds]
  );
  return { items, loading: query.isLoading };
}

/** Kachel eines gemerkten Notebooks: „Nicht mehr merken" im Menü, System-Notebooks auch „Zu Favoriten". */
function SavedNotebookTile({ item }: { item: SavedNotebook }) {
  const save = useMarketplaceSave();
  return (
    <TileCard
      href={`/notebooks/${item.notebook.slug}`}
      title={item.title}
      tone={getToolTheme('projekte') ?? FALLBACK_TONE}
      badge={<PiBooks aria-hidden className="size-5" />}
      meta={[item.authorName ? `Gemerkt · von ${item.authorName}` : 'Gemerkt']}
      description={item.description}
      menu={
        <>
          {/* Die Seitenleiste löst nur Registry-Ids und eigene/geteilte Notebooks auf. */}
          {item.origin !== 'oeffentlich' && <FavouriteMenuItem favouriteId={item.ref} />}
          <DropdownMenuItem
            onClick={() =>
              save.mutate(item, {
                onError: () => toast.error('Merken konnte nicht geändert werden.'),
              })
            }
          >
            <PiBookmarkSimple />
            Nicht mehr merken
          </DropdownMenuItem>
        </>
      }
    />
  );
}

/** Notebook-Kachel: dieselbe wie Projekte und Rezepte; das Menü nur am eigenen. */
export function NotebookTile({
  collection: c,
  isOwn,
  extraMeta = [],
}: {
  collection: NotebookCollection;
  isOwn: boolean;
  /** Steht vor der eigenen Meta-Zeile, z. B. „Notebook · vor 2 Std." in „Zuletzt". */
  extraMeta?: string[];
}) {
  const tone = getToolTheme('projekte') ?? FALLBACK_TONE;
  return (
    <TileCard
      href={`/notebooks/${collectionSlug(c)}`}
      title={c.name}
      tone={tone}
      badge={<PiBooks aria-hidden className="size-5" />}
      meta={[
        ...extraMeta,
        ...(!isOwn && c.shared_via_groups?.length
          ? [`Geteilt in ${c.shared_via_groups.join(', ')}`]
          : []),
      ]}
      description={c.description}
      // Favoriten an jedem; Bearbeiten, Teilen und Löschen nur am eigenen.
      menu={
        <>
          <FavouriteMenuItem favouriteId={notebookFavouriteId(c.id)} />
          {isOwn && <OwnNotebookActions collection={c} />}
        </>
      }
    />
  );
}

/** System-Notebook-Kachel (z. B. in „Zuletzt"): dieselbe Kachel, im Menü nur „Zu Favoriten" — es gehört niemandem. */
export function SystemNotebookTile({
  entry,
  extraMeta = [],
}: {
  entry: NotebookConfigEntry;
  extraMeta?: string[];
}) {
  const Icon = entry.icon;
  return (
    <TileCard
      href={entry.path}
      title={entry.title}
      tone={getToolTheme('projekte') ?? FALLBACK_TONE}
      badge={<Icon aria-hidden className="size-5" />}
      meta={extraMeta}
      description={entry.description}
      // Die Registry-Id, wie früher der Stern auf /wissen: die Seitenleiste löst sie schon auf.
      menu={<FavouriteMenuItem favouriteId={entry.id} />}
    />
  );
}

/**
 * „Deine Notebooks" auf `/projekte`: eigene Notebooks, die, die andere in
 * ein gemeinsames Projekt geteilt haben, und die im Marktplatz gemerkten —
 * dieselbe Kachel wie Projekte und Rezepte.
 */
export function ProjekteNotebooksSection() {
  const { own, shared, loading, failed } = useMyNotebooks();
  const shownIds = useMemo(() => new Set([...own, ...shared].map((c) => c.id)), [own, shared]);
  const saved = useSavedNotebooks(shownIds);

  const actions = (
    <>
      <Button asChild variant="ghost" size="icon" title="Marktplatz">
        <Link to={marketplaceHref({ tab: 'notebooks' })} aria-label="Notebooks im Marktplatz">
          <PiStorefront aria-hidden className="size-[18px]" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" title="Neues Notebook">
        <Link to="/notebooks/neu" aria-label="Neues Notebook">
          <PiPlus aria-hidden className="size-[18px]" />
        </Link>
      </Button>
    </>
  );

  return (
    <section aria-label="Deine Notebooks" className="mt-xl">
      <SectionHeader title="Deine Notebooks" actions={actions} />
      {own.length + shared.length + saved.items.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
          {own.map((c) => (
            <NotebookTile key={c.id} collection={c} isOwn />
          ))}
          {shared.map((c) => (
            <NotebookTile key={c.id} collection={c} isOwn={false} />
          ))}
          {saved.items.map((item) => (
            <SavedNotebookTile key={item.key} item={item} />
          ))}
        </div>
      ) : (
        // „Noch keine" nur aus einer bestätigt leeren Liste.
        <p className="m-0 py-md text-sm text-grey-500 dark:text-grey-400">
          {failed
            ? 'Deine Notebooks konnten nicht geladen werden.'
            : loading || saved.loading
              ? 'Notebooks werden geladen…'
              : 'Noch keine Notebooks. Ein Notebook beantwortet Fragen aus deinen eigenen Dokumenten.'}
        </p>
      )}
    </section>
  );
}
