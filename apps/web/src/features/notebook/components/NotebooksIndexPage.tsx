import { deriveIndexingState, type MarketplaceItemOf } from '@gruenerator/contracts';
import { LANDESVERBAENDE } from '@gruenerator/shared/agents';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { canShareIntoGroup } from '@gruenerator/shared/groups';
import {
  LANDESVERBAND_COVERS,
  marketplaceHref,
  useMarketplaceKind,
} from '@gruenerator/shared/marketplace';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import {
  ConfirmDialogProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SectionHeader,
  ShowcasePhotoCard,
  Skeleton,
  cn,
  useConfirm,
} from '@gruenerator/ui';
import {
  BarChart3,
  Bookmark,
  Eye,
  Flame,
  Landmark,
  Map as MapIcon,
  Plus,
  Rss,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  HiBookOpen,
  HiDotsVertical,
  HiExclamation,
  HiOutlineTrash,
  HiPencil,
  HiShare,
  HiUserGroup,
} from 'react-icons/hi';
import { Link, useNavigate } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { NotebookIcon } from '../../../config/icons';
import { sortToolsByFavourites } from '../../../config/workplaceToolsConfig';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarFavouritesStore, { useIsFavourite } from '../../../stores/sidebarFavouritesStore';
import { getPublicAppOrigin } from '../../../utils/platform';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups } from '../../groups/hooks/useGroups';
import { lvCardImage } from '../../marketplace/landesverbandCovers';
import { useMonitorSnapshot, usePolls, useWhatHappened } from '../../monitor/hooks/useMonitor';
import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';
import { useTrashUndoToast } from '../../trash/trashUndoToast';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import {
  getAustrianNotebooks,
  getListedNotebookById,
  getNotebooksByCategory,
  isNotebookVisibleForLocale,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';
import { useSharedNotebookCollections } from '../hooks/useSharedNotebookCollections';
import { useNotebookPrefetch } from '../preload';
import { loadNotebookPage } from '../routeChunks';

import NotebookCoverArt from './NotebookCoverArt';
import NotebookCreateCard from './NotebookCreateCard';
import NotebookGalleryCard from './NotebookGalleryCard';
import { NotebookPageContent } from './NotebookPage';

import type { NotebookCollection } from '../../../types/notebook';
import type { IconType } from 'react-icons';

// Responsive grid of the notebook cards — used by the "Eigene" section. Capped
// at 5 per row.
const NOTEBOOK_GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-md';

// System notebooks live in a single horizontal strip. Fractional tile widths keep
// the next card half-visible at the edge so the scroll affordance is obvious; the
// pt/pb leave room for the hover lift + shadow inside the clipping container.
const NOTEBOOK_SCROLL_ROW = 'flex gap-3 overflow-x-auto pt-1 pb-3 sm:gap-4';
// Tile width = (row − its gaps) ÷ an .5 count, so the next card stays ~half visible
// (a deliberate scroll tease) at any width. Mirrors the Arbeiten tool strip.
const NOTEBOOK_SCROLL_ITEM =
  'min-w-0 shrink-0 basis-[calc((100%_-_1.5rem)_*_0.4)] sm:basis-[calc((100%_-_3rem)_*_0.2857)] md:basis-[calc((100%_-_4rem)_*_0.2222)] lg:basis-[calc((100%_-_5rem)_*_0.1818)]';

const EMPTY_COLLECTIONS: NotebookCollection[] = [];

const HIDDEN_NOTEBOOK_IDS = [
  'gruenerator-notebook',
  'gruenblog-notebook',
  'boell-stiftung-notebook',
];

// Landesverband-Notebooks zeigen dasselbe Foto wie ihre Karte im Marktplatz.
const LV_COVER_BY_NOTEBOOK = new Map(
  LANDESVERBAENDE.map((lv) => [lv.notebookId as string, LANDESVERBAND_COVERS[lv.id]])
);

const NotebookCard = memo(({ notebook }: { notebook: NotebookConfigEntry }) => {
  const navigate = useNavigate();
  const prefetch = useNotebookPrefetch();
  const starred = useIsFavourite(notebook.id);
  const open = () => void navigate(notebook.path, { state: { freshConversation: true } });
  const lvCover = LV_COVER_BY_NOTEBOOK.get(notebook.id);
  const star = <FavouriteStar id={notebook.id} size={16} tone="notebook" />;
  if (lvCover) {
    return (
      <div className="group relative" onPointerEnter={() => prefetch()}>
        <ShowcasePhotoCard
          title={notebook.title}
          href={notebook.path}
          onActivate={(event) => {
            event.preventDefault();
            open();
          }}
          {...lvCardImage(lvCover)}
          className="aspect-square"
        />
        {/* The star's own grey sits unreadable on a photo; an unstarred one is hover-revealed, so its pill is too. */}
        <div
          className={cn(
            'absolute right-2 top-2 z-20 rounded-full transition-colors duration-200',
            starred
              ? 'bg-white/85 backdrop-blur-sm dark:bg-black/50'
              : 'group-hover:bg-white/85 group-hover:backdrop-blur-sm group-focus-within:bg-white/85 dark:group-hover:bg-black/50 dark:group-focus-within:bg-black/50'
          )}
        >
          {star}
        </div>
      </div>
    );
  }
  return (
    <WissenTile
      Icon={notebook.icon}
      title={notebook.title}
      description={notebook.meta}
      palette={WISSEN_TILE}
      onActivate={open}
      onIntent={() => prefetch()}
      action={star}
    />
  );
});
NotebookCard.displayName = 'NotebookCard';

interface NotebookSearchHit {
  key: string;
  title: string;
  meta?: string;
  icon: IconType;
  /** System notebooks render as their own tile (or Landesverband photo). */
  notebook?: NotebookConfigEntry;
  coverNode?: ReactNode;
  onActivate: () => void;
}

const COLLAPSE_THRESHOLD = 3;

const isOwnedCollection = (c: NotebookCollection): boolean =>
  c.access_source == null || c.access_source === 'owned';

// Canonical URL for a community notebook: plural `/notebooks/` with the
// Notion-style slug, falling back to the raw UUID for legacy pre-backfill rows
// (NotebookResolver accepts either form).
const publicNotebookSlug = (c: NotebookCollection): string =>
  c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id;
const publicNotebookHref = (c: NotebookCollection): string => `/notebooks/${publicNotebookSlug(c)}`;

// Author attribution is what distinguishes a public notebook; fall back to its
// description when the creator has no display name.
const savedNotebookMeta = (item: MarketplaceItemOf<'notebook'>): string | undefined =>
  item.authorName ? `von ${item.authorName}` : (item.description ?? undefined);

/**
 * „Gemerkt" — public notebooks the person bookmarked in the Marktplatz. The
 * public notebooks themselves are listed there now; this is the way back.
 */
const SavedNotebooks = memo(({ items }: { items: MarketplaceItemOf<'notebook'>[] }) => {
  const navigate = useNavigate();
  const prefetch = useNotebookPrefetch();
  return (
    <section className="mt-md">
      <SectionHeader title="Gemerkt" />
      <div className={NOTEBOOK_SCROLL_ROW}>
        {items.map((item) => (
          <div key={item.ref} className={NOTEBOOK_SCROLL_ITEM}>
            <NotebookGalleryCard
              title={item.title}
              coverNode={<NotebookCoverArt title={item.title} subtitle={savedNotebookMeta(item)} />}
              accent="pink"
              onActivate={() => void navigate(`/notebooks/${item.notebook.slug}`)}
              onIntent={() => prefetch(item.notebook.slug)}
            />
          </div>
        ))}
      </div>
    </section>
  );
});
SavedNotebooks.displayName = 'SavedNotebooks';

// Which Projekt a notebook reached the viewer through — the one thing that
// tells two same-named shared notebooks apart.
const sharedNotebookMeta = (c: NotebookCollection): string | undefined =>
  c.shared_via_groups?.length
    ? `via ${c.shared_via_groups.join(', ')}`
    : (c.description ?? undefined);

/**
 * „Mit dir geteilt" — notebooks others shared into a Projekt the user belongs
 * to, so they no longer have to open each Projekt to find them.
 */
const SharedNotebooks = memo(({ collections }: { collections: NotebookCollection[] }) => {
  const navigate = useNavigate();
  const prefetch = useNotebookPrefetch();
  return (
    <section className="mt-md">
      <SectionHeader title="Mit dir geteilt" />
      <div className={NOTEBOOK_SCROLL_ROW}>
        {collections.map((c) => (
          <div key={c.id} className={NOTEBOOK_SCROLL_ITEM}>
            <NotebookGalleryCard
              title={c.name}
              coverNode={<NotebookCoverArt title={c.name} subtitle={sharedNotebookMeta(c)} />}
              accent="pink"
              onActivate={() =>
                void navigate(publicNotebookHref(c), { state: { freshConversation: true } })
              }
              onIntent={() => prefetch(publicNotebookSlug(c))}
            />
          </div>
        ))}
      </div>
    </section>
  );
});
SharedNotebooks.displayName = 'SharedNotebooks';

interface EigeneNotebooksProps {
  qaCollections: NotebookCollection[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onShare: (id: string) => void;
  onCreate: () => void;
  loading: boolean;
  copiedId?: string | null;
}

const EigeneNotebooks = memo(
  ({
    qaCollections,
    onView,
    onEdit,
    onDelete,
    onShare,
    onCreate,
    loading,
    copiedId,
  }: EigeneNotebooksProps) => {
    const [expanded, setExpanded] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [sharedInfo, setSharedInfo] = useState<string | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const confirm = useConfirm();
    const showTrashUndo = useTrashUndoToast();

    const { userGroups: allGroups = [] } = useGroups({ isActive: qaCollections.length > 0 });
    const userGroups = allGroups.filter(canShareIntoGroup);

    const handleDelete = async (id: string, name: string) => {
      const ok = await confirm({
        title: 'Notebook löschen?',
        description: `„${name}“ wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.`,
      });
      if (!ok) return;
      setDeletingId(id);
      setDeleteError(null);
      try {
        await onDelete(id);
        showTrashUndo({ kind: 'notebook', id, title: name });
      } catch {
        setDeleteError(id);
        setTimeout(() => setDeleteError(null), 2000);
      } finally {
        setDeletingId(null);
      }
    };

    const handleShareToGroup = async (collectionId: string, groupId: string) => {
      try {
        const res = await getContractsClient().groups.shareContent({
          params: { groupId },
          body: {
            contentType: 'notebook_collections',
            contentId: collectionId,
            permissions: { read: true, write: false, collaborative: false },
          },
        });
        if (res.status !== 200) throw new ApiError(res.status, 'share failed');
        setSharedInfo(collectionId);
        setTimeout(() => setSharedInfo(null), 2000);
      } catch {
        setShareError(collectionId);
        setTimeout(() => setShareError(null), 2000);
      }
    };

    const visible =
      !expanded && qaCollections.length > COLLAPSE_THRESHOLD
        ? qaCollections.slice(0, COLLAPSE_THRESHOLD)
        : qaCollections;
    const shouldCollapse = qaCollections.length > COLLAPSE_THRESHOLD;

    return (
      <div className="mt-xl">
        <SectionHeader title="Eigene" onCreate={onCreate} createLabel="Notebook erstellen" />
        {loading ? (
          <div className={NOTEBOOK_GRID_CLASS}>
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-xl border border-grey-200/80 dark:border-grey-700/60"
              >
                <Skeleton className="aspect-square rounded-none" />
              </div>
            ))}
          </div>
        ) : qaCollections.length === 0 ? (
          <div className={NOTEBOOK_GRID_CLASS}>
            <NotebookCreateCard onClick={onCreate} />
          </div>
        ) : (
          <>
            <div className={NOTEBOOK_GRID_CLASS}>
              {visible.map((c) => (
                <NotebookGalleryCard
                  key={c.id}
                  title={c.name}
                  coverNode={
                    // Das Aktionsmenü ist auf schmalen Bildschirmen dauerhaft
                    // sichtbar (max-sm:opacity-100), nicht nur beim Hover.
                    <NotebookCoverArt
                      title={c.name}
                      subtitle={c.description || undefined}
                      reserveTopRight
                    />
                  }
                  accent="pink"
                  // Server-derived; the local derivation is the fallback for a
                  // backend that predates the field (and for cached responses).
                  indexingState={c.indexing_state ?? deriveIndexingState(c.documents ?? [])}
                  onActivate={() => onView(c.id)}
                  onIntent={() => void loadNotebookPage()}
                  menu={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-center size-7 rounded-full text-grey-400 hover:text-foreground transition-colors cursor-pointer"
                          aria-label="Aktionen"
                        >
                          <HiDotsVertical size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(c.id)}>
                          <HiPencil />
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <HiShare />
                            {sharedInfo === c.id
                              ? 'Geteilt!'
                              : shareError === c.id
                                ? 'Fehler!'
                                : 'Teilen'}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => onShare(c.id)}>
                              <HiShare />
                              {copiedId === c.id ? 'Link kopiert!' : 'Link kopieren'}
                            </DropdownMenuItem>
                            {isOwnedCollection(c) && userGroups.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                {(userGroups as { id: string; name: string }[]).map((group) => (
                                  <DropdownMenuItem
                                    key={group.id}
                                    onClick={() => handleShareToGroup(c.id, group.id)}
                                  >
                                    <HiUserGroup />
                                    {group.name}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        {isOwnedCollection(c) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleDelete(c.id, c.name)}
                            >
                              <HiOutlineTrash />
                              {deleteError === c.id
                                ? 'Fehler!'
                                : deletingId === c.id
                                  ? 'Wird gelöscht…'
                                  : 'Löschen'}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              ))}
              <NotebookCreateCard onClick={onCreate} />
            </div>
            {shouldCollapse && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-sm text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 cursor-pointer transition-colors"
              >
                {expanded
                  ? 'Weniger anzeigen'
                  : `+${qaCollections.length - COLLAPSE_THRESHOLD} weitere anzeigen`}
              </button>
            )}
          </>
        )}
      </div>
    );
  }
);
EigeneNotebooks.displayName = 'EigeneNotebooks';

// Farbige Kacheln (Look wie das Arbeiten-Tool-Grid) für Tools und Notebooks:
// ein Pink mit eigenem Dunkel-Paar.
// Klassen literal, damit Tailwind-JIT sie behält.
interface WissenTilePalette {
  tile: string;
  icon: string;
  titleColor: string;
  descColor: string;
}

const WISSEN_TILE: WissenTilePalette = {
  tile: 'bg-[#FCDDE4] hover:shadow-[0_14px_30px_rgba(214,0,74,0.18)] dark:bg-[#2C121A]',
  icon: 'text-[#C80050] dark:text-[#EE6090]',
  titleColor: 'text-[#A00044] dark:text-[#F2A6C0]',
  descColor: 'text-[#8C5666] dark:text-[#BA7892]',
};

const WISSEN_TILE_CLASS =
  'group relative flex aspect-square w-full flex-col justify-between gap-2 rounded-2xl p-4 text-left no-underline transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600';

const WissenTileBody = ({
  Icon,
  title,
  description,
  palette,
}: {
  Icon: LucideIcon | IconType;
  title: string;
  description?: string | null;
  palette: WissenTilePalette;
}) => (
  <>
    <span className={cn('flex text-[24px] sm:text-[28px] lg:text-[30px]', palette.icon)}>
      <Icon />
    </span>
    <span className="min-w-0">
      <span
        className={cn(
          'block text-[14px] font-bold leading-tight line-clamp-3 break-words hyphens-auto sm:text-[16px] lg:text-[17px] lg:hyphens-manual',
          palette.titleColor
        )}
      >
        {title}
      </span>
      {description && (
        <span
          className={cn(
            'mt-0.5 block min-h-[2.75em] text-[12px] leading-snug line-clamp-3 break-words hyphens-auto sm:mt-1 sm:text-[13px] lg:text-[14px]',
            palette.descColor
          )}
        >
          {description}
        </span>
      )}
    </span>
  </>
);

type WissenTileProps = {
  Icon: LucideIcon | IconType;
  title: string;
  description?: string | null;
  palette: WissenTilePalette;
  onIntent?: () => void;
  /** Top-right control (e.g. the favourite star), outside the link/button. */
  action?: ReactNode;
} & ({ to: string; onActivate?: never } | { to?: never; onActivate: () => void });

/** One coloured Wissen tile — a link for tools, a button for notebooks and categories. */
const WissenTile = ({ to, onActivate, onIntent, action, palette, ...body }: WissenTileProps) => (
  <div className="group relative">
    {to ? (
      <Link to={to} className={cn(WISSEN_TILE_CLASS, palette.tile)}>
        <WissenTileBody palette={palette} {...body} />
      </Link>
    ) : (
      <button
        type="button"
        onClick={onActivate}
        onPointerEnter={onIntent}
        onFocus={onIntent}
        className={cn(WISSEN_TILE_CLASS, palette.tile)}
      >
        <WissenTileBody palette={palette} {...body} />
      </button>
    )}
    {action && <div className="absolute right-2 top-2">{action}</div>}
  </div>
);

interface WissenToolTile {
  id: string;
  title: string;
  description: string;
  path: string;
  Icon: LucideIcon;
}

// Die Monitor-Bereiche; ein neues Notebook legt die Notebook-Reihe an.
const WISSEN_TOOL_TILES: WissenToolTile[] = [
  {
    id: 'monitor-themen',
    title: 'Themen & Trends',
    description: 'Meistdiskutierte Themen und X-Trends der letzten 24 Stunden.',
    path: '/themen',
    Icon: Flame,
  },
  {
    id: 'monitor-feed',
    title: 'Feed',
    description: 'Bluesky und neue Beiträge der Landesverbände.',
    path: '/feed',
    Icon: Rss,
  },
  {
    id: 'monitor-watcher',
    title: 'Watcher',
    description: 'Berichterstattung über die Grünen.',
    path: '/watcher',
    Icon: Eye,
  },
  {
    id: 'monitor-umfragen',
    title: 'Umfragen',
    description: 'Sonntagsfrage, Ländertrends und Meinungsbild.',
    path: '/umfragen',
    Icon: BarChart3,
  },
];

/** Extract the Grüne polling average from a poll's party map, if present. */
function pickGrueneValue(average: Record<string, number> | undefined): number | null {
  if (!average) return null;
  for (const [k, v] of Object.entries(average)) {
    if (k === 'GRÜNE' || k.toLowerCase().includes('grüne')) return v;
  }
  return null;
}

/**
 * Live "intelligence" subtext for the Monitor tiles: the top keywords
 * (Themen & Trends), the newest Landesverband article (Feed)
 * and the Grüne polling value (Umfragen). Falls back to the tile's static
 * description while loading.
 */
function useWissenTileIntel(locale: 'de' | 'at') {
  const { data: snapshot } = useMonitorSnapshot(locale);
  const { data: polls } = usePolls(locale === 'at' ? 'oesterreich' : 'deutschland');
  // Same query key as the non-expert /feed view, so both share one cache entry.
  const { data: feed } = useWhatHappened(locale, { days: 7 });

  return useCallback(
    (id: string): string | null => {
      // Durchgängig optional: `snapshot?.topics[0]` warf eine TypeError, sobald
      // der Snapshot da war, `topics` aber fehlte — die ganze Wissen-Seite fiel
      // dann in die Fehlergrenze. Aufgefallen an der Lane mit leerem Datenstand.
      if (id === 'monitor-themen') {
        const top = (snapshot?.keywords ?? []).slice(0, 3).map((k) => k.keyword);
        return top.length > 0 ? top.join(' · ') : null;
      }
      if (id === 'monitor-feed') {
        // Der Feed-Strom ist rein deutsch (getWhatHappened engt per locale
        // nichts ein) — unter `at` zeigt /feed ihn gar nicht, also darf die
        // Kachel auch keine deutsche LV-Schlagzeile als AT-Untertext führen.
        if (locale === 'at') return null;
        const newest = feed?.days?.[0]?.articles?.[0]?.title;
        return newest ?? null;
      }
      if (id === 'monitor-umfragen') {
        const g = pickGrueneValue(polls?.average);
        return g != null
          ? `Grüne aktuell bei ${g.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
          : null;
      }
      return null;
    },
    [snapshot, polls, feed, locale]
  );
}

const WissenToolsRow = memo(() => {
  const { locale, withLocale } = useMonitorLocaleParam();
  const intel = useWissenTileIntel(locale);

  return (
    <section className="mt-xl">
      <SectionHeader title="Tools" />
      <div className={NOTEBOOK_SCROLL_ROW}>
        {WISSEN_TOOL_TILES.map((tile) => (
          <div key={tile.id} className={NOTEBOOK_SCROLL_ITEM}>
            <WissenTile
              to={withLocale(tile.path)}
              Icon={tile.Icon}
              title={tile.title}
              description={intel(tile.id) ?? tile.description}
              palette={WISSEN_TILE}
            />
          </div>
        ))}
      </div>
    </section>
  );
});
WissenToolsRow.displayName = 'WissenToolsRow';

/**
 * The /wissen gallery below the chat surface: notebook row with the expandable
 * category tiles (Landesverbände, Parlamente, Eigene, Gemerkt, Geteilt), the unified search and
 * the tool tiles. Exported so it can be rendered on its own in tests — the page
 * itself drags the whole chat surface in.
 */
export function NotebooksIndexFooter() {
  const navigate = useNavigate();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const allNotebooks = useMemo(
    () =>
      (isAustrian
        ? getAustrianNotebooks()
        : [
            ...getNotebooksByCategory('bundesebene'),
            ...getNotebooksByCategory('landesebene'),
            ...getNotebooksByCategory('parlamente'),
            ...getNotebooksByCategory('weitere'),
          ]
      ).filter((nb) => isNotebookVisibleForLocale(nb, locale)),
    [isAustrian, locale]
  );

  // Erste Reihe: Direkt-Notebooks + aufklappbare Sammel-Kategorien. Für AT ist
  // es nur das eine Österreich-Notebook (+ Eigene, falls vorhanden) — deshalb
  // muss auch die Landesverbände-Kachel audience-gefiltert sein, sonst sehen
  // AT-User die deutschen LV-Notebooks.
  const laenderNotebooks = useMemo(
    () =>
      getNotebooksByCategory('landesebene').filter((nb) => isNotebookVisibleForLocale(nb, locale)),
    [locale]
  );
  // Deutsche Parlamente: `audience: 'de-DE'` hält sie von AT fern.
  const parlamenteNotebooks = useMemo(
    () =>
      getNotebooksByCategory('parlamente').filter((nb) => isNotebookVisibleForLocale(nb, locale)),
    [locale]
  );
  const directBefore = useMemo(
    () =>
      isAustrian
        ? getAustrianNotebooks()
        : [getListedNotebookById('gruene-notebook')].filter((nb): nb is NotebookConfigEntry =>
            Boolean(nb)
          ),
    [isAustrian]
  );
  const directAfter = useMemo(
    () =>
      isAustrian
        ? []
        : [getListedNotebookById('kommunalwiki-notebook')].filter((nb): nb is NotebookConfigEntry =>
            Boolean(nb)
          ),
    [isAustrian]
  );
  const [openCategory, setOpenCategory] = useState<
    'laender' | 'parlamente' | 'eigene' | 'gemerkt' | 'geteilt' | null
  >(null);

  const { query: collectionsQuery, deleteQACollection } = useNotebookCollections({
    isActive: true,
  });
  // "Eigene" must only ever show notebooks the user owns. The backend already
  // returns owned-only, but filter defensively so a non-owned notebook can
  // never render here even if another path repopulates the query cache.
  const qaCollections = useMemo(
    () => (collectionsQuery.data ?? EMPTY_COLLECTIONS).filter(isOwnedCollection),
    [collectionsQuery.data]
  );
  const collectionsLoading = collectionsQuery.isLoading;
  const vectorStoreDown =
    collectionsQuery.error instanceof ApiError &&
    collectionsQuery.error.code === 'vector_store_unavailable';

  const handleCreate = useCallback(() => {
    void navigate('/notebooks/neu');
  }, [navigate]);

  // Resolve a collectionId to the Notion-style URL fragment when the row has
  // a slug_suffix, falling back to the raw UUID for legacy pre-backfill rows.
  // The bearbeiten/view routes both accept either form via NotebookResolver,
  // so a fallback simply gives a less-pretty URL — never a 404.
  const buildSlugFragment = useCallback(
    (collectionId: string): string => {
      const c = qaCollections.find((x) => x.id === collectionId);
      if (c?.slug_suffix) return buildNotebookSlug(c.name, c.slug_suffix);
      return collectionId;
    },
    [qaCollections]
  );

  const handleEdit = useCallback(
    (collectionId: string) => {
      void navigate(`/notebooks/${buildSlugFragment(collectionId)}/bearbeiten`);
    },
    [navigate, buildSlugFragment]
  );

  const handleView = useCallback(
    (collectionId: string) => {
      void navigate(`/notebooks/${buildSlugFragment(collectionId)}`, {
        state: { freshConversation: true },
      });
    },
    [navigate, buildSlugFragment]
  );

  const handleDelete = useCallback(
    async (collectionId: string) => {
      await deleteQACollection(collectionId);
    },
    [deleteQACollection]
  );

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleShare = useCallback(
    (collectionId: string) => {
      // Canonical URL: plural `/notebooks/...` with the Notion-style slug. The
      // legacy singular `/notebook/:id` route still redirects, but copying the
      // canonical form means the redirect never fires for share recipients.
      const url = `${getPublicAppOrigin()}/notebooks/${buildSlugFragment(collectionId)}`;
      void navigator.clipboard.writeText(url);
      setCopiedId(collectionId);
      setTimeout(() => setCopiedId(null), 2000);
    },
    [buildSlugFragment]
  );

  const [search, setSearch] = useState('');
  const trimmed = search.trim().toLowerCase();

  const favouriteIds = useSidebarFavouritesStore((s) => s.favouriteIds);
  // Favourited notebooks float to the front (same store as the sidebar/tool
  // favourites); the rest keep their curated order.
  const orderedSystem = useMemo(
    () =>
      sortToolsByFavourites(
        allNotebooks.filter((nb) => !HIDDEN_NOTEBOOK_IDS.includes(nb.id)),
        favouriteIds
      ),
    [allNotebooks, favouriteIds]
  );

  // Öffentliche Notebooks anderer stehen im Marktplatz. Was die Person dort
  // gemerkt hat, steht hier unter „Gemerkt" und in der vereinten Suche.
  const savedQuery = useMarketplaceKind({
    kind: 'notebook',
    scope: 'saved',
    origin: null,
    q: '',
    sort: 'neu',
    platform: 'web',
  });
  const savedNotebooks = useMemo(
    () =>
      savedQuery.items.filter(
        (item): item is MarketplaceItemOf<'notebook'> => item.kind === 'notebook'
      ),
    [savedQuery.items]
  );
  const ownIds = useMemo(() => new Set(qaCollections.map((c) => c.id)), [qaCollections]);

  // „Mit dir geteilt": über Projekte geteilte Notebooks anderer. Ein Notebook,
  // das zugleich öffentlich ist, steht nur hier — die Projekt-Freigabe ist die
  // persönlichere Antwort auf „wo finde ich das?".
  const { data: sharedData } = useSharedNotebookCollections({ enabled: true });
  const sharedCollections = useMemo(
    () => (sharedData ?? EMPTY_COLLECTIONS).filter((c) => !ownIds.has(c.id)),
    [sharedData, ownIds]
  );

  const searchHits = useMemo<NotebookSearchHit[]>(() => {
    if (!trimmed) return [];
    const hit = (a?: string | null, b?: string | null) =>
      (a ?? '').toLowerCase().includes(trimmed) || (b ?? '').toLowerCase().includes(trimmed);
    const hits: NotebookSearchHit[] = [];
    for (const nb of orderedSystem) {
      if (hit(nb.title, nb.meta)) {
        hits.push({
          key: `sys-${nb.id}`,
          title: nb.title,
          meta: nb.meta,
          icon: nb.icon,
          notebook: nb,
          onActivate: () => void navigate(nb.path, { state: { freshConversation: true } }),
        });
      }
    }
    for (const c of qaCollections) {
      if (hit(c.name, c.description)) {
        hits.push({
          key: `own-${c.id}`,
          title: c.name,
          icon: NotebookIcon,
          coverNode: <NotebookCoverArt title={c.name} subtitle={c.description || undefined} />,
          onActivate: () => handleView(c.id),
        });
      }
    }
    for (const c of sharedCollections) {
      if (!hit(c.name, c.description)) continue;
      hits.push({
        key: `shared-${c.id}`,
        title: c.name,
        icon: HiUserGroup,
        coverNode: <NotebookCoverArt title={c.name} subtitle={sharedNotebookMeta(c)} />,
        onActivate: () =>
          void navigate(publicNotebookHref(c), { state: { freshConversation: true } }),
      });
    }
    for (const item of savedNotebooks) {
      if (!hit(item.title, item.description)) continue;
      hits.push({
        key: `saved-${item.ref}`,
        title: item.title,
        icon: HiBookOpen,
        coverNode: <NotebookCoverArt title={item.title} subtitle={savedNotebookMeta(item)} />,
        onActivate: () => void navigate(`/notebooks/${item.notebook.slug}`),
      });
    }
    return hits;
  }, [
    trimmed,
    orderedSystem,
    qaCollections,
    sharedCollections,
    savedNotebooks,
    navigate,
    handleView,
  ]);

  return (
    <>
      <section className="mt-xl">
        <SectionHeader
          title="Notebooks"
          searchQuery={search}
          onSearchChange={setSearch}
          searchPlaceholder="Alle Notebooks durchsuchen…"
        />
        {vectorStoreDown && (
          <div
            role="status"
            className="mb-md flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <HiExclamation size={18} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              Die Wissensdatenbank ist gerade nicht erreichbar. Eigene Notebooks können
              vorübergehend nicht geladen oder befragt werden – bitte versuche es später erneut.
            </span>
          </div>
        )}
        {trimmed ? (
          searchHits.length > 0 ? (
            <div className={NOTEBOOK_GRID_CLASS}>
              {searchHits.map((h) =>
                h.notebook ? (
                  <NotebookCard key={h.key} notebook={h.notebook} />
                ) : (
                  <NotebookGalleryCard
                    key={h.key}
                    title={h.title}
                    meta={h.meta}
                    icon={h.icon}
                    coverNode={h.coverNode}
                    accent="pink"
                    onActivate={h.onActivate}
                  />
                )
              )}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-grey-300 px-md py-lg text-center text-sm text-grey-500 dark:border-grey-700 dark:text-grey-400">
              Keine Notebooks für „{search}“.
            </p>
          )
        ) : (
          <div className={NOTEBOOK_SCROLL_ROW}>
            {directBefore.map((nb) => (
              <div key={nb.id} className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookCard notebook={nb} />
              </div>
            ))}
            {laenderNotebooks.length > 0 && (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <WissenTile
                  Icon={MapIcon}
                  title="Landesverbände"
                  description={`${laenderNotebooks.length} Landesverbände`}
                  palette={WISSEN_TILE}
                  onActivate={() => setOpenCategory((c) => (c === 'laender' ? null : 'laender'))}
                />
              </div>
            )}
            {parlamenteNotebooks.length > 0 && (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <WissenTile
                  Icon={Landmark}
                  title="Parlamente"
                  description={`${parlamenteNotebooks.length} ${parlamenteNotebooks.length === 1 ? 'Parlament' : 'Parlamente'}`}
                  palette={WISSEN_TILE}
                  onActivate={() =>
                    setOpenCategory((c) => (c === 'parlamente' ? null : 'parlamente'))
                  }
                />
              </div>
            )}
            {qaCollections.length > 0 && (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <WissenTile
                  Icon={NotebookIcon}
                  title="Eigene Notebooks"
                  description={`${qaCollections.length} ${qaCollections.length === 1 ? 'Notebook' : 'Notebooks'}`}
                  palette={WISSEN_TILE}
                  onActivate={() => setOpenCategory((c) => (c === 'eigene' ? null : 'eigene'))}
                />
              </div>
            )}
            {savedNotebooks.length > 0 && (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <WissenTile
                  Icon={Bookmark}
                  title="Gemerkt"
                  description={`${savedNotebooks.length} ${savedNotebooks.length === 1 ? 'gemerktes Notebook' : 'gemerkte Notebooks'}`}
                  palette={WISSEN_TILE}
                  onActivate={() => setOpenCategory((c) => (c === 'gemerkt' ? null : 'gemerkt'))}
                />
              </div>
            )}
            {sharedCollections.length > 0 && (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <WissenTile
                  Icon={Users}
                  title="Mit dir geteilt"
                  description={`${sharedCollections.length} ${sharedCollections.length === 1 ? 'geteiltes Notebook' : 'geteilte Notebooks'}`}
                  palette={WISSEN_TILE}
                  onActivate={() => setOpenCategory((c) => (c === 'geteilt' ? null : 'geteilt'))}
                />
              </div>
            )}
            {directAfter.map((nb) => (
              <div key={nb.id} className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookCard notebook={nb} />
              </div>
            ))}
            <div className={NOTEBOOK_SCROLL_ITEM}>
              <WissenTile
                to={marketplaceHref({ category: 'notebooks' })}
                Icon={Store}
                title="Zum Marktplatz"
                description="Öffentliche Notebooks entdecken."
                palette={WISSEN_TILE}
              />
            </div>
            <div className={NOTEBOOK_SCROLL_ITEM}>
              <WissenTile
                Icon={Plus}
                title="Neues erstellen"
                description="Eigene Quellen sammeln und befragen."
                palette={WISSEN_TILE}
                onActivate={handleCreate}
              />
            </div>
          </div>
        )}
      </section>

      {!trimmed && openCategory === 'laender' && (
        <section className="mt-md">
          <SectionHeader title="Landesverbände" />
          <div className={NOTEBOOK_SCROLL_ROW}>
            {laenderNotebooks.map((nb) => (
              <div key={nb.id} className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookCard notebook={nb} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!trimmed && openCategory === 'parlamente' && (
        <section className="mt-md">
          <SectionHeader title="Parlamente" />
          <div className={NOTEBOOK_SCROLL_ROW}>
            {parlamenteNotebooks.map((nb) => (
              <div key={nb.id} className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookCard notebook={nb} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!trimmed && openCategory === 'gemerkt' && savedNotebooks.length > 0 && (
        <SavedNotebooks items={savedNotebooks} />
      )}

      {!trimmed && openCategory === 'geteilt' && sharedCollections.length > 0 && (
        <SharedNotebooks collections={sharedCollections} />
      )}

      {!trimmed && openCategory === 'eigene' && qaCollections.length > 0 && (
        <ConfirmDialogProvider>
          <EigeneNotebooks
            qaCollections={qaCollections}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onShare={handleShare}
            onCreate={handleCreate}
            loading={collectionsLoading}
            copiedId={copiedId}
          />
        </ConfirmDialogProvider>
      )}

      {!trimmed && <WissenToolsRow />}
    </>
  );
}

function NotebooksIndexPage() {
  const config = useMemo(() => getNotebookConfig('gruenerator'), []);
  return (
    <NotebookPageContent
      config={config}
      startpageFooter={<NotebooksIndexFooter />}
      showExamples={false}
      hideGlobalChat
      omniComposer
      pageGradient={false}
    />
  );
}

/** Unwrapped variant for embedding (workplace "Wissen" tab — auth-gated route). */
export { NotebooksIndexPage as NotebooksIndexContent };

export default withAuthRequired(NotebooksIndexPage, {
  title: 'Notebooks',
});
