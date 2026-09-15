import { deriveIndexingState } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import coverEigene from '@gruenerator/shared/assets/notebook-covers/eigene.webp';
import coverLaenderverbaende from '@gruenerator/shared/assets/notebook-covers/landesverbaende.webp';
import coverNeu from '@gruenerator/shared/assets/notebook-covers/notebook-neu.webp';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  SectionHeader,
  Skeleton,
  cn,
} from '@gruenerator/ui';
import {
  BarChart3,
  Flame,
  Map as MapIcon,
  Plus,
  Rss,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  HiBookOpen,
  HiDotsVertical,
  HiOutlineTrash,
  HiPencil,
  HiShare,
  HiUserGroup,
} from 'react-icons/hi';
import { Link, useNavigate } from 'react-router-dom';

import FavouriteStar from '../../../components/common/FavouriteStar';
import { LikeButton } from '../../../components/common/LikeButton';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { NotebookIcon } from '../../../config/icons';
import { sortToolsByFavourites } from '../../../config/workplaceToolsConfig';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import { getPublicAppOrigin } from '../../../utils/platform';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups } from '../../groups/hooks/useGroups';
import { useEntityLikes } from '../../likes/hooks/useEntityLikes';
import { useMonitorSnapshot, usePolls, useWhatHappened } from '../../monitor/hooks/useMonitor';
import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import {
  getAustrianNotebooks,
  getListedNotebookById,
  getNotebooksByCategory,
  isNotebookVisibleForLocale,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';
import { usePublicNotebookCollections } from '../hooks/usePublicNotebookCollections';

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
  'shrink-0 basis-[calc((100%_-_1.5rem)_*_0.4)] sm:basis-[calc((100%_-_3rem)_*_0.2857)] md:basis-[calc((100%_-_4rem)_*_0.2222)] lg:basis-[calc((100%_-_5rem)_*_0.1818)]';

const EMPTY_COLLECTIONS: NotebookCollection[] = [];

const HIDDEN_NOTEBOOK_IDS = [
  'gruenerator-notebook',
  'gruenblog-notebook',
  'boell-stiftung-notebook',
  // Vorerst ausgeblendet — Kachel wieder einblenden = diese Zeile entfernen.
  'abgeordnetenwatch-notebook',
];

// Branded Cover für die aufklappbaren Sammel-Kategorien. Die webp-Dateien liegen
// (wie die übrigen Notebook-Cover) unter packages/shared/assets/notebook-covers/,
// damit Web und Mobile dieselbe Datei nutzen.
const LAENDER_COVER = coverLaenderverbaende;
const EIGENE_COVER = coverEigene;
const NEU_COVER = coverNeu;

const NotebookCard = memo(({ notebook }: { notebook: NotebookConfigEntry }) => {
  const navigate = useNavigate();
  return (
    <NotebookGalleryCard
      title={notebook.title}
      meta={notebook.meta}
      icon={notebook.icon}
      coverImage={notebook.coverImage}
      accent="pink"
      onActivate={() => navigate(notebook.path, { state: { freshConversation: true } })}
      action={<FavouriteStar id={notebook.id} size={16} />}
    />
  );
});
NotebookCard.displayName = 'NotebookCard';

interface NotebookSearchHit {
  key: string;
  title: string;
  meta?: string;
  icon: IconType;
  coverImage?: string;
  /** User notebooks have no designed webp — they bring rendered cover art. */
  coverNode?: ReactNode;
  onActivate: () => void;
}

const COLLAPSE_THRESHOLD = 3;

const isOwnedCollection = (c: NotebookCollection): boolean =>
  c.access_source == null || c.access_source === 'owned';

// Canonical URL for a community notebook: plural `/notebooks/` with the
// Notion-style slug, falling back to the raw UUID for legacy pre-backfill rows
// (NotebookResolver accepts either form).
const publicNotebookHref = (c: NotebookCollection): string =>
  `/notebooks/${c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id}`;

// Author attribution is what distinguishes a community notebook; fall back to
// its description when the creator has no display name.
const publicNotebookMeta = (c: NotebookCollection): string | undefined =>
  c.creator_name ? `von ${c.creator_name}` : (c.description ?? undefined);

/**
 * "Von der Basis" — publicly listed community notebooks, opened from the
 * category tile in the notebook row. Likes stay visible (not hover-revealed)
 * because the count is part of the card's information.
 */
const BasisNotebooks = memo(({ collections }: { collections: NotebookCollection[] }) => {
  const navigate = useNavigate();
  const { likedIds, toggleLike, isToggling, canLike } = useEntityLikes('notebook');

  return (
    <section className="mt-md">
      <SectionHeader title="Von der Basis" />
      <div className={NOTEBOOK_SCROLL_ROW}>
        {collections.map((c) => (
          <div key={c.id} className={NOTEBOOK_SCROLL_ITEM}>
            <NotebookGalleryCard
              title={c.name}
              coverNode={
                <NotebookCoverArt title={c.name} subtitle={publicNotebookMeta(c)} reserveTopRight />
              }
              accent="pink"
              onActivate={() => void navigate(publicNotebookHref(c))}
              action={
                <LikeButton
                  liked={likedIds.has(c.id)}
                  count={c.likes_count ?? 0}
                  loading={isToggling(c.id)}
                  disabled={!canLike}
                  disabledReason={canLike ? undefined : 'Melde dich an, um zu liken'}
                  onToggle={() => toggleLike(c.id)}
                />
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
});
BasisNotebooks.displayName = 'BasisNotebooks';

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

    const { userGroups = [] } = useGroups({ isActive: qaCollections.length > 0 });

    const handleDelete = async (id: string, name: string) => {
      if (window.confirm(`Notebook "${name}" wirklich löschen?`)) {
        setDeletingId(id);
        setDeleteError(null);
        try {
          await onDelete(id);
        } catch {
          setDeleteError(id);
          setTimeout(() => setDeleteError(null), 2000);
        } finally {
          setDeletingId(null);
        }
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
        if (res.status !== 200) throw new Error('share failed');
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

// Wissen-Tools als farbige Kacheln (Look wie das Arbeiten-Tool-Grid). Erste
// Kachel erstellt ein Notebook, danach die Monitor-Bereiche. Farbklassen
// literal, damit Tailwind-JIT sie behält.
interface WissenToolTile {
  id: string;
  title: string;
  description: string;
  path: string;
  Icon: LucideIcon;
  tile: string;
  icon: string;
  titleColor: string;
  descColor: string;
  /** Monitor-Pfade tragen den Locale-Param; interne Tools wie /notebooks/neu nicht. */
  localeAware?: boolean;
}

const WISSEN_TOOL_TILES: WissenToolTile[] = [
  {
    id: 'notebook-neu',
    title: 'Neues Notebook erstellen',
    description: 'Wissen sammeln und befragen.',
    path: '/notebooks/neu',
    Icon: Plus,
    tile: 'bg-[#FCDDE4] hover:shadow-[0_14px_30px_rgba(214,0,74,0.18)] dark:bg-[#2C121A]',
    icon: 'text-[#C80050] dark:text-[#EE6090]',
    titleColor: 'text-[#A00044] dark:text-[#F2A6C0]',
    descColor: 'text-[#8C5666] dark:text-[#BA7892]',
  },
  {
    id: 'monitor-themen',
    title: 'Themen',
    description: 'Meistdiskutierte Themen der letzten 24 Stunden.',
    path: '/themen',
    Icon: Flame,
    tile: 'bg-[#FADFEA] hover:shadow-[0_14px_30px_rgba(206,0,92,0.18)] dark:bg-[#2C121F]',
    icon: 'text-[#C4006A] dark:text-[#EC5AA0]',
    titleColor: 'text-[#9E0056] dark:text-[#EFA0C8]',
    descColor: 'text-[#8A5570] dark:text-[#B77697]',
    localeAware: true,
  },
  {
    id: 'monitor-trends',
    title: 'Trends',
    description: 'Was gerade auf X im Trend liegt.',
    path: '/trends',
    Icon: TrendingUp,
    tile: 'bg-[#F7DEEB] hover:shadow-[0_14px_30px_rgba(195,0,100,0.18)] dark:bg-[#2B1222]',
    icon: 'text-[#BA006D] dark:text-[#EA5AA7]',
    titleColor: 'text-[#960059] dark:text-[#EDA0CC]',
    descColor: 'text-[#875573] dark:text-[#B4769A]',
    localeAware: true,
  },
  {
    id: 'monitor-feed',
    title: 'Feed',
    description: 'Bluesky und neue Beiträge der Landesverbände.',
    path: '/feed',
    Icon: Rss,
    tile: 'bg-[#F2DCF0] hover:shadow-[0_14px_30px_rgba(166,0,116,0.18)] dark:bg-[#271226]',
    icon: 'text-[#A60074] dark:text-[#E45AB4]',
    titleColor: 'text-[#86005F] dark:text-[#E7A0D4]',
    descColor: 'text-[#815578] dark:text-[#B0769E]',
    localeAware: true,
  },
  {
    id: 'monitor-umfragen',
    title: 'Umfragen',
    description: 'Sonntagsfrage, Ländertrends und Meinungsbild.',
    path: '/umfragen',
    Icon: BarChart3,
    tile: 'bg-[#F5DDEE] hover:shadow-[0_14px_30px_rgba(184,0,108,0.18)] dark:bg-[#291224]',
    icon: 'text-[#B00070] dark:text-[#E85AAE]',
    titleColor: 'text-[#8E005C] dark:text-[#EAA0D0]',
    descColor: 'text-[#845576] dark:text-[#B2769C]',
    localeAware: true,
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
 * Live "intelligence" subtext for the Monitor tiles: the current hot topic
 * (Themen), the #1 X trend (Trends), the newest Landesverband article (Feed)
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
      if (id === 'monitor-themen') return snapshot?.topics?.[0]?.topArticles?.[0]?.title ?? null;
      if (id === 'monitor-trends') {
        const top = snapshot?.socialTrends?.[0]?.name;
        return top ? `Jetzt im Trend: ${top}` : null;
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
            <Link
              to={tile.localeAware ? withLocale(tile.path) : tile.path}
              className={cn(
                'group relative flex aspect-square flex-col justify-between gap-2 rounded-2xl p-4 no-underline transition-shadow duration-150',
                tile.tile
              )}
            >
              <span className={cn('flex text-[24px] sm:text-[28px] lg:text-[30px]', tile.icon)}>
                <tile.Icon />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[16px] font-bold leading-tight line-clamp-2 sm:text-[19px] lg:text-[22px]',
                    tile.titleColor
                  )}
                >
                  {tile.title}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block min-h-[2.75em] text-[12px] leading-snug line-clamp-2 sm:mt-1 sm:text-[13px] lg:text-[14px]',
                    tile.descColor
                  )}
                >
                  {intel(tile.id) ?? tile.description}
                </span>
              </span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
});
WissenToolsRow.displayName = 'WissenToolsRow';

/**
 * The /wissen gallery below the chat surface: notebook row with the expandable
 * category tiles (Landesverbände, Eigene, Von der Basis), the unified search and
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
  const directBefore = useMemo(
    () =>
      isAustrian
        ? getAustrianNotebooks()
        : [
            getListedNotebookById('gruene-notebook'),
            getListedNotebookById('bundestagsfraktion-notebook'),
          ].filter((nb): nb is NotebookConfigEntry => Boolean(nb)),
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
  const [openCategory, setOpenCategory] = useState<'laender' | 'eigene' | 'basis' | null>(null);

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

  // "Von der Basis": öffentlich gelistete Notebooks anderer Nutzer*innen. Sie
  // haben eine eigene aufklappbare Kategorie-Kachel (wie Landesverbände und
  // Eigene) und tauchen zusätzlich in der vereinten Suche auf. Eigene Notebooks
  // fallen raus — die stehen schon unter "Eigene".
  const { data: basisData } = usePublicNotebookCollections({ enabled: true });
  const ownIds = useMemo(() => new Set(qaCollections.map((c) => c.id)), [qaCollections]);
  const basisCollections = useMemo(
    () => (basisData ?? EMPTY_COLLECTIONS).filter((c) => !ownIds.has(c.id)),
    [basisData, ownIds]
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
          coverImage: nb.coverImage,
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
    for (const c of basisCollections) {
      if (!hit(c.name, c.description)) continue;
      hits.push({
        key: `basis-${c.id}`,
        title: c.name,
        icon: HiBookOpen,
        coverNode: <NotebookCoverArt title={c.name} subtitle={publicNotebookMeta(c)} />,
        onActivate: () => void navigate(publicNotebookHref(c)),
      });
    }
    return hits;
  }, [trimmed, orderedSystem, qaCollections, basisCollections, navigate, handleView]);

  return (
    <>
      <section className="mt-xl">
        <SectionHeader
          title="Notebooks"
          searchQuery={search}
          onSearchChange={setSearch}
          searchPlaceholder="Alle Notebooks durchsuchen…"
        />
        {trimmed ? (
          searchHits.length > 0 ? (
            <div className={NOTEBOOK_GRID_CLASS}>
              {searchHits.map((h) => (
                <NotebookGalleryCard
                  key={h.key}
                  title={h.title}
                  meta={h.meta}
                  icon={h.icon}
                  coverImage={h.coverImage}
                  coverNode={h.coverNode}
                  accent="pink"
                  onActivate={h.onActivate}
                />
              ))}
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
                <NotebookGalleryCard
                  title="Landesverbände"
                  meta={`${laenderNotebooks.length} Landesverbände`}
                  coverImage={LAENDER_COVER}
                  icon={MapIcon}
                  accent="pink"
                  onActivate={() => setOpenCategory((c) => (c === 'laender' ? null : 'laender'))}
                />
              </div>
            )}
            {qaCollections.length > 0 ? (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookGalleryCard
                  title="Eigene Notebooks"
                  meta={`${qaCollections.length} ${qaCollections.length === 1 ? 'Notebook' : 'Notebooks'}`}
                  coverImage={EIGENE_COVER}
                  icon={NotebookIcon}
                  accent="pink"
                  onActivate={() => setOpenCategory((c) => (c === 'eigene' ? null : 'eigene'))}
                />
              </div>
            ) : (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookGalleryCard
                  title="Neues erstellen"
                  coverImage={NEU_COVER}
                  accent="pink"
                  onActivate={handleCreate}
                />
              </div>
            )}
            {basisCollections.length > 0 && (
              <div className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookGalleryCard
                  title="Von der Basis"
                  coverNode={
                    <NotebookCoverArt
                      title="Von der Basis"
                      subtitle={`${basisCollections.length} ${basisCollections.length === 1 ? 'öffentliches Notebook' : 'öffentliche Notebooks'}`}
                    />
                  }
                  accent="pink"
                  onActivate={() => setOpenCategory((c) => (c === 'basis' ? null : 'basis'))}
                />
              </div>
            )}
            {directAfter.map((nb) => (
              <div key={nb.id} className={NOTEBOOK_SCROLL_ITEM}>
                <NotebookCard notebook={nb} />
              </div>
            ))}
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

      {!trimmed && openCategory === 'basis' && basisCollections.length > 0 && (
        <BasisNotebooks collections={basisCollections} />
      )}

      {!trimmed && openCategory === 'eigene' && qaCollections.length > 0 && (
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
      showLastAdded={false}
      showStats={false}
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
