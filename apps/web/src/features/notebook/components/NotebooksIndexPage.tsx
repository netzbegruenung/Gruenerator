import { getContractsClient } from '@gruenerator/shared/api';
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
import { BarChart3, Eye, Flame, Map as MapIcon, Plus, type LucideIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  HiBookOpen,
  HiChevronRight,
  HiDotsVertical,
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
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import { getPublicAppOrigin } from '../../../utils/platform';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups } from '../../groups/hooks/useGroups';
import { useWhatHappened } from '../../monitor/hooks/useMonitor';
import { useMonitorLocaleParam } from '../../monitor/hooks/useMonitorLocaleParam';
import { getNotebookConfig } from '../config/notebookPagesConfig';
import {
  getAustrianNotebooks,
  getNotebookById,
  getNotebooksByCategory,
  type NotebookConfigEntry,
} from '../config/notebooksConfig';
import { usePublicNotebookCollections } from '../hooks/usePublicNotebookCollections';

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

// Branded Cover für die aufklappbaren Sammel-Kategorien. Die webp-Dateien
// liegen (wie die übrigen Notebook-Cover) unter apps/web/public/notebook-covers/.
const LAENDER_COVER = '/notebook-covers/landesverbaende.webp';
const EIGENE_COVER = '/notebook-covers/eigene.webp';

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
  onActivate: () => void;
}

const COLLAPSE_THRESHOLD = 3;

const isOwnedCollection = (c: NotebookCollection): boolean =>
  c.access_source == null || c.access_source === 'owned';

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
                <Skeleton className="aspect-[5/4] rounded-none" />
                <div className="px-3 py-2.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-1.5 h-3 w-1/2" />
                </div>
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
                  meta={c.description || 'Eigenes Notebook'}
                  icon={NotebookIcon}
                  accent="pink"
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

const WHAT_HAPPENED_MAX = 12;

function formatWhatHappenedDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatArticleDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

// Tagesaktuelle Content-Sync-Beiträge im selben Scroll-Strip-Look wie die
// Notebook-Reihen. Zieht die Monitor-Daten, verlinkt in den vollen Feed.
const WhatHappenedRow = memo(() => {
  const navigate = useNavigate();
  const { locale, withLocale } = useMonitorLocaleParam();
  const { data, isLoading } = useWhatHappened(locale, { days: 7 });

  // Über alle geladenen Tage zusammenziehen und nach Neuigkeit sortieren, damit
  // die Reihe auch bei einem dünnen Tag immer voll ist. Dedupe nach sourceUrl.
  const articles = useMemo(() => {
    const sorted = (data?.days ?? [])
      .flatMap((d) => d.articles)
      .sort(
        (a, b) =>
          new Date(b.publishedAt ?? b.indexedAt).getTime() -
          new Date(a.publishedAt ?? a.indexedAt).getTime()
      );
    const seen = new Set<string>();
    const unique: (typeof sorted)[number][] = [];
    for (const article of sorted) {
      if (seen.has(article.sourceUrl)) continue;
      seen.add(article.sourceUrl);
      unique.push(article);
      if (unique.length >= WHAT_HAPPENED_MAX) break;
    }
    return unique;
  }, [data]);

  const latestDate = data?.days[0]?.date;

  if (!isLoading && articles.length === 0) return null;

  const feedPath = withLocale('/experiments/monitor/feed');

  return (
    <section className="mt-xl">
      <SectionHeader
        title="Was ist passiert"
        onTitleClick={() => navigate(feedPath)}
        actions={
          <span className="inline-flex items-center gap-sm">
            {latestDate && (
              <span className="text-xs text-grey-400">{formatWhatHappenedDay(latestDate)}</span>
            )}
            <Link
              to={feedPath}
              className="inline-flex items-center gap-0.5 text-xs text-grey-400 hover:text-foreground transition-colors no-underline"
            >
              Alle anzeigen
              <HiChevronRight className="h-3.5 w-3.5" />
            </Link>
          </span>
        }
      />
      <div className={NOTEBOOK_SCROLL_ROW}>
        {articles.length > 0
          ? articles.map((article) => (
              <a
                key={article.sourceUrl}
                href={article.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  NOTEBOOK_SCROLL_ITEM,
                  'group flex flex-col gap-2 rounded-xl border bg-background p-4 no-underline transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
                  'border-[#EFC9DD] hover:border-[#D6006E] dark:border-[#4A2A3B] dark:hover:border-[#EC5AA0]'
                )}
              >
                <h3 className="m-0 line-clamp-2 text-sm font-semibold leading-snug text-foreground-heading group-hover:text-[#D6006E] dark:group-hover:text-[#EC5AA0]">
                  {article.title}
                </h3>
                {article.excerpt && (
                  <p className="m-0 line-clamp-4 flex-1 text-xs leading-relaxed text-grey-500 dark:text-grey-400">
                    {article.excerpt}
                  </p>
                )}
                <div className="mt-auto flex items-center gap-1.5 truncate pt-1 text-[11px] text-grey-400">
                  <span className="truncate">{article.sourceName}</span>
                  {article.publishedAt && (
                    <span className="shrink-0">· {formatArticleDate(article.publishedAt)}</span>
                  )}
                </div>
              </a>
            ))
          : ['a', 'b', 'c', 'd'].map((key) => (
              <div key={key} className={NOTEBOOK_SCROLL_ITEM}>
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ))}
      </div>
    </section>
  );
});
WhatHappenedRow.displayName = 'WhatHappenedRow';

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
    tile: 'bg-[#E3F1DE] hover:shadow-[0_14px_30px_rgba(37,118,57,0.20)] dark:bg-[#14251A]',
    icon: 'text-[#2C7A3E] dark:text-[#7FC08C]',
    titleColor: 'text-[#1E5A2C] dark:text-[#A9DDB2]',
    descColor: 'text-[#4B7B57] dark:text-[#84A98D]',
  },
  {
    id: 'monitor-themen',
    title: 'Themen',
    description: 'Meistdiskutierte Themen der letzten 24 Stunden.',
    path: '/experiments/monitor/themen',
    Icon: Flame,
    tile: 'bg-[#FBE7D6] hover:shadow-[0_14px_30px_rgba(180,83,20,0.20)] dark:bg-[#2B1B10]',
    icon: 'text-[#B4530F] dark:text-[#E0A46A]',
    titleColor: 'text-[#8A3F0B] dark:text-[#EAC29A]',
    descColor: 'text-[#9E6438] dark:text-[#B79576]',
    localeAware: true,
  },
  {
    id: 'monitor-umfragen',
    title: 'Umfragen',
    description: 'Sonntagsfrage, Ländertrends und Meinungsbild.',
    path: '/experiments/monitor/umfragen',
    Icon: BarChart3,
    tile: 'bg-[#DCE8F6] hover:shadow-[0_14px_30px_rgba(30,74,140,0.20)] dark:bg-[#101C2B]',
    icon: 'text-[#1E4A8C] dark:text-[#7FA6DD]',
    titleColor: 'text-[#173A6E] dark:text-[#A0C0EA]',
    descColor: 'text-[#3F5C85] dark:text-[#7A93B7]',
    localeAware: true,
  },
  {
    id: 'monitor-watcher',
    title: 'Watcher',
    description: 'Berichterstattung über die Grünen im Blick.',
    path: '/experiments/monitor/watcher',
    Icon: Eye,
    tile: 'bg-[#F6DEED] hover:shadow-[0_14px_30px_rgba(196,0,106,0.18)] dark:bg-[#2B1220]',
    icon: 'text-[#C4006A] dark:text-[#EC5AA0]',
    titleColor: 'text-[#9E0056] dark:text-[#EFA0C8]',
    descColor: 'text-[#8A5570] dark:text-[#B77697]',
    localeAware: true,
  },
];

const WissenToolsRow = memo(() => {
  const { withLocale } = useMonitorLocaleParam();

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
                  {tile.description}
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

function NotebooksIndexFooter() {
  const navigate = useNavigate();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const allNotebooks = useMemo(
    () =>
      isAustrian
        ? getAustrianNotebooks()
        : [
            ...getNotebooksByCategory('bundesebene'),
            ...getNotebooksByCategory('landesebene'),
            ...getNotebooksByCategory('weitere'),
          ],
    [isAustrian]
  );

  // Erste Reihe: Direkt-Notebooks + aufklappbare Sammel-Kategorien. Für AT ist
  // es nur das eine Österreich-Notebook (+ Eigene, falls vorhanden).
  const laenderNotebooks = useMemo(() => getNotebooksByCategory('landesebene'), []);
  const directBefore = useMemo(
    () =>
      isAustrian
        ? getAustrianNotebooks()
        : [
            getNotebookById('gruene-notebook'),
            getNotebookById('bundestagsfraktion-notebook'),
          ].filter((nb): nb is NotebookConfigEntry => Boolean(nb)),
    [isAustrian]
  );
  const directAfter = useMemo(
    () =>
      isAustrian
        ? []
        : [getNotebookById('kommunalwiki-notebook')].filter((nb): nb is NotebookConfigEntry =>
            Boolean(nb)
          ),
    [isAustrian]
  );
  const [openCategory, setOpenCategory] = useState<'laender' | 'eigene' | null>(null);

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

  // "Von der Basis" bekommt keine eigene Reihe mehr, taucht aber in der
  // vereinten Suche auf (System + eigene + öffentliche Notebooks).
  const { data: basisData } = usePublicNotebookCollections({ enabled: true });
  const basisCollections = useMemo(() => basisData ?? EMPTY_COLLECTIONS, [basisData]);

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
    const ownIds = new Set(qaCollections.map((c) => c.id));
    for (const c of qaCollections) {
      if (hit(c.name, c.description)) {
        hits.push({
          key: `own-${c.id}`,
          title: c.name,
          meta: c.description || 'Eigenes Notebook',
          icon: NotebookIcon,
          onActivate: () => handleView(c.id),
        });
      }
    }
    for (const c of basisCollections) {
      if (ownIds.has(c.id) || !hit(c.name, c.description)) continue;
      hits.push({
        key: `basis-${c.id}`,
        title: c.name,
        meta: c.creator_name ? `von ${c.creator_name}` : (c.description ?? undefined),
        icon: HiBookOpen,
        onActivate: () =>
          void navigate(
            `/notebooks/${c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id}`
          ),
      });
    }
    return hits;
  }, [trimmed, orderedSystem, qaCollections, basisCollections, navigate, handleView]);

  return (
    <>
      <section className="mt-xl" data-tour="wissen-notebooks">
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
            {qaCollections.length > 0 && (
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

      {!trimmed && <WhatHappenedRow />}

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
      pageGradient={false}
      omniComposer
    />
  );
}

/** Unwrapped variant for embedding (workplace "Wissen" tab — auth-gated route). */
export { NotebooksIndexPage as NotebooksIndexContent };

export default withAuthRequired(NotebooksIndexPage, {
  title: 'Notebooks',
});
