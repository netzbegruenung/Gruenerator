import {
  GRUENERATOR_TEMPLATE_TYPE,
  sharepicCreatorLocaleSchema,
  type SharepicCreatorLocale,
} from '@gruenerator/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Globe } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { HiFilter, HiOutlineFilter, HiPlus } from 'react-icons/hi';
import { HiXMark } from 'react-icons/hi2';
import { LuGrid2X2, LuGrid3X3 } from 'react-icons/lu';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MeineVorlagenPanel } from '../../../features/vorlagen/components/MeineVorlagenPanel';
import {
  catalogMatches,
  SharepicVorlagenCards,
} from '../../../features/vorlagen/components/SharepicVorlagenSection';
import { useGrueneratorVorlage } from '../../../features/vorlagen/hooks/useGrueneratorVorlage';
import { useSharepicVorlagen } from '../../../features/vorlagen/hooks/useSharepicVorlagen';
import { useVorlageInteractions } from '../../../features/vorlagen/hooks/useVorlageInteractions';
import { useAuthStore } from '../../../stores/authStore';
import ErrorBoundary from '../../ErrorBoundary';
import apiClient from '../../utils/apiClient';
import AddTemplateModal from '../AddTemplateModal/AddTemplateModal';
import { PageHero, PageHeroSearch, PageShell } from '../PageHero';
import TemplatePreviewModal from '../TemplatePreviewModal';

import VorlagenCard from './VorlagenCard';

import { cn } from '@/utils/cn';

const DEBOUNCE_DELAY = 500;

const GRID_CLASS = {
  small:
    'grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3',
  large:
    'grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6 max-md:grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] max-md:gap-4',
} as const;
type GridSize = keyof typeof GRID_CLASS;

const GRID_SIZE_KEY = 'vorlagen-grid-size';

function readGridSize(): GridSize {
  try {
    return localStorage.getItem(GRID_SIZE_KEY) === 'large' ? 'large' : 'small';
  } catch {
    return 'small';
  }
}

interface CategoryItem {
  id: string;
  label: string;
}

interface VorlageItem {
  id: string | number;
  title?: string;
  description?: string;
  template_type?: string;
  tags?: string[];
  thumbnail_url?: string;
  external_url?: string;
  download_url?: string;
  content_data?: { originalUrl?: string };
  metadata?: { author_name?: string; contact_email?: string };
  likes_count?: number;
  [key: string]: unknown;
}

const parseSearchQuery = (query: string): { textQuery: string; tags: string[] } => {
  const tags: string[] = [];
  const textParts: string[] = [];
  for (const token of query.split(/\s+/)) {
    if (token.startsWith('#') && token.length > 1) {
      tags.push(token.slice(1));
    } else if (token) {
      textParts.push(token);
    }
  }
  return { textQuery: textParts.join(' '), tags };
};

const addTagToSearch = (currentSearch: string, tag: string): string => {
  const hashtag = `#${tag}`;
  if (currentSearch.includes(hashtag)) return currentSearch;
  return currentSearch ? `${currentSearch} ${hashtag}` : hashtag;
};

const removeTagFromSearch = (currentSearch: string, tag: string): string =>
  currentSearch
    .split(/\s+/)
    .filter((token) => token.toLowerCase() !== `#${tag}`.toLowerCase())
    .join(' ')
    .trim();

/** Removable pill summarizing one applied filter (category, tag, or region). */
const FilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }): JSX.Element => (
  <button
    type="button"
    onClick={onRemove}
    className="inline-flex items-center gap-1 rounded-full bg-primary-500/10 py-1 pl-3 pr-2 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-500/20 dark:text-primary-400"
    aria-label={`Filter „${label}“ entfernen`}
  >
    {label}
    <HiXMark className="size-3.5" aria-hidden="true" />
  </button>
);

type EmptyCause = 'search' | 'favorites' | 'category' | 'none';

const EMPTY_TEXT: Record<EmptyCause, { title: string; hint?: string }> = {
  search: { title: 'Keine Vorlagen gefunden', hint: 'Versuche einen anderen Suchbegriff.' },
  favorites: {
    title: 'Noch keine gemerkten Vorlagen',
    hint: 'Tippe an einer Vorlage auf das Lesezeichen, um sie dir zu merken.',
  },
  category: { title: 'In dieser Kategorie gibt es noch keine Vorlagen' },
  none: { title: 'Noch keine Vorlagen' },
};

const EmptyResult = ({
  cause,
  onShowAll,
}: {
  cause: EmptyCause;
  onShowAll: () => void;
}): JSX.Element => (
  <div className="py-16 text-center">
    <p className="mb-1 text-[1.0625rem] font-semibold text-foreground-heading">
      {EMPTY_TEXT[cause].title}
    </p>
    {EMPTY_TEXT[cause].hint && (
      <p className="text-sm text-foreground/60">{EMPTY_TEXT[cause].hint}</p>
    )}
    {cause === 'category' && (
      <Button variant="outline" size="sm" className="mt-sm" onClick={onShowAll}>
        Alle Vorlagen anzeigen
      </Button>
    )}
  </div>
);

interface VorlagenResponse {
  vorlagen: VorlageItem[];
}
interface CategoriesResponse {
  categories: CategoryItem[];
}

const fetchVorlagen = async ({
  searchTerm,
  searchMode,
  selectedCategory,
  tags,
  onlyFavorites,
  land,
  signal,
}: {
  searchTerm: string;
  searchMode: string;
  selectedCategory: string;
  tags: string[];
  onlyFavorites: boolean;
  land: SharepicCreatorLocale | null;
  signal?: AbortSignal;
}): Promise<VorlageItem[]> => {
  const params: Record<string, unknown> = {};
  if (onlyFavorites) params.favorites = '1';
  if (land) params.land = land;
  if (searchTerm) {
    params.searchTerm = searchTerm;
    if (searchMode) params.searchMode = searchMode;
  }
  if (selectedCategory && selectedCategory !== 'all') {
    params.templateType = selectedCategory;
  }
  if (tags.length > 0) {
    params.tags = JSON.stringify(tags);
  }

  const response = await apiClient.get<VorlagenResponse>('/auth/vorlagen', { params, signal });
  const data = response.data;
  return Array.isArray(data?.vorlagen) ? data.vorlagen : [];
};

/** Pretty labels for known template_type categories; server sends raw ids. */
const CATEGORY_LABELS: Record<string, string> = {
  canva: 'Canva',
  [GRUENERATOR_TEMPLATE_TYPE]: 'Grünerator',
};

const fetchCategories = async (): Promise<CategoryItem[]> => {
  const response = await apiClient.get<CategoriesResponse>('/auth/vorlagen-categories');
  const data = response.data;
  const categories: CategoryItem[] = Array.isArray(data?.categories) ? data.categories : [];
  const labeled = categories.map((c) => ({ ...c, label: CATEGORY_LABELS[c.id] ?? c.label }));
  return labeled;
};

const LAND_LABEL: Record<SharepicCreatorLocale, string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

const ALL_FILTER = 'all';
const MEINE_FILTER = 'meine';

const VorlagenGallery = memo((): JSX.Element => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState('title');
  const [previewTemplate, setPreviewTemplate] = useState<VorlageItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [gridSize, setGridSize] = useState<GridSize>(readGridSize);
  const toggleGridSize = useCallback(() => {
    setGridSize((prev) => {
      const next = prev === 'large' ? 'small' : 'large';
      try {
        localStorage.setItem(GRID_SIZE_KEY, next);
      } catch {
        // Not remembered, still switched.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => setSearchTerm(inputValue), DEBOUNCE_DELAY);
    return () => clearTimeout(handler);
  }, [inputValue]);

  const { textQuery, tags } = useMemo(() => parseSearchQuery(searchTerm), [searchTerm]);

  const categoriesQuery = useQuery({
    queryKey: ['vorlagenCategories'],
    queryFn: fetchCategories,
  });

  const filters = useMemo<CategoryItem[]>(
    () => [
      { id: ALL_FILTER, label: 'Alle Vorlagen' },
      { id: GRUENERATOR_TEMPLATE_TYPE, label: CATEGORY_LABELS[GRUENERATOR_TEMPLATE_TYPE] },
      ...(categoriesQuery.data ?? []).filter(
        (c) => c.id !== GRUENERATOR_TEMPLATE_TYPE && c.id !== ALL_FILTER && c.id !== MEINE_FILTER
      ),
      { id: MEINE_FILTER, label: 'Meine Vorlagen' },
    ],
    [categoriesQuery.data]
  );
  const catParam = searchParams.get('cat');
  // Until the categories arrive a server category in the link is taken on trust.
  const selectedCategory =
    catParam && (categoriesQuery.isPending || filters.some((f) => f.id === catParam))
      ? catParam
      : ALL_FILTER;
  const isMeine = selectedCategory === MEINE_FILTER;
  const selectFilter = useCallback(
    (key: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === ALL_FILTER) next.delete('cat');
          else next.set('cat', key);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );

  // Instance admins may look at the other country's Vorlagen (`?land=`); the
  // server ignores the parameter for everyone else, so it is not even sent.
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true);
  const ownLand = useAuthStore((s) => s.locale);
  const landParam = sharepicCreatorLocaleSchema.safeParse(searchParams.get('land')).data;
  const land = isAdmin && landParam && landParam !== ownLand ? landParam : null;
  const shownLand = land ?? ownLand;
  const selectLand = useCallback(
    (value: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === ownLand) next.delete('land');
          else next.set('land', value);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams, ownLand]
  );

  const dataQuery = useQuery({
    queryKey: [
      'vorlagen-gallery',
      textQuery,
      searchMode,
      selectedCategory,
      tags,
      onlyFavorites,
      land,
    ],
    enabled: !isMeine,
    staleTime: 30_000,
    gcTime: 60_000,
    refetchOnMount: 'always' as const,
    queryFn: ({ signal }) =>
      fetchVorlagen({
        searchTerm: textQuery,
        searchMode,
        selectedCategory,
        tags,
        onlyFavorites,
        land,
        signal,
      }),
    placeholderData: (prev) => prev,
  });

  const loadedItems = useMemo(() => dataQuery.data ?? [], [dataQuery.data]);
  const itemIds = useMemo(() => loadedItems.map((item) => String(item.id)), [loadedItems]);
  const { cardProps, likesCount, favoritedIds } = useVorlageInteractions(itemIds);
  // The server already returns only bookmarks; this drops one unbookmarked meanwhile.
  const items = onlyFavorites
    ? loadedItems.filter((item) => favoritedIds.has(String(item.id)))
    : loadedItems;

  const { openVorlage, usingId } = useGrueneratorVorlage();

  const handleTagClick = useCallback((tag: string) => {
    setInputValue((prev) => addTagToSearch(prev, tag));
  }, []);

  const removeTag = useCallback((tag: string) => {
    setInputValue((prev) => removeTagFromSearch(prev, tag));
  }, []);

  const resetFilters = useCallback(() => {
    setInputValue('');
    selectFilter(ALL_FILTER);
    setOnlyFavorites(false);
  }, [selectFilter]);

  // Active filters shown as removable chips below the search bar. Derived from
  // the live input (not the debounced term) so chips track typing immediately.
  const activeTags = useMemo(() => parseSearchQuery(inputValue).tags, [inputValue]);
  const activeFilter = filters.find((f) => f.id === selectedCategory) ?? {
    id: selectedCategory,
    label: CATEGORY_LABELS[selectedCategory] ?? selectedCategory,
  };
  const isFiltered = selectedCategory !== ALL_FILTER;
  const hasActiveFilters = activeTags.length > 0 || (isFiltered && !isMeine) || onlyFavorites;
  const hasSearch = inputValue.trim().length > 0;

  const showCatalog =
    !isMeine &&
    (selectedCategory === ALL_FILTER || selectedCategory === GRUENERATOR_TEMPLATE_TYPE) &&
    tags.length === 0;
  const catalogQuery = useSharepicVorlagen(land);
  const catalog = useMemo(
    () =>
      showCatalog
        ? (catalogQuery.data ?? []).filter(
            (v) => catalogMatches(v, textQuery) && (!onlyFavorites || favoritedIds.has(v.id))
          )
        : [],
    [showCatalog, catalogQuery.data, textQuery, onlyFavorites, favoritedIds]
  );
  const total = items.length + catalog.length;
  const settled = !dataQuery.isLoading && (!showCatalog || !catalogQuery.isLoading);

  const handleAddSuccess = useCallback(() => {
    void dataQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['userTemplates'] });
    if (isMeine) toast.success('Vorlage wurde hinzugefügt.');
  }, [dataQuery, queryClient, isMeine]);

  return (
    <PageShell wide>
      <PageHero
        title="Vorlagen-Datenbank"
        description={
          <p className="m-0 text-sm leading-relaxed text-pretty text-grey-500 dark:text-grey-400">
            Sharepic-Vorlagen vom Grünerator und Design-Vorlagen für Canva, InDesign und mehr.
          </p>
        }
        toolbar={
          <>
            {!isMeine && (
              <PageHeroSearch
                query={inputValue}
                onQuery={setInputValue}
                placeholder="Vorlagen durchsuchen…"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Vorlage hinzufügen"
              title="Vorlage hinzufügen"
              onClick={() => setShowAddModal(true)}
            >
              <HiPlus aria-hidden className="size-[18px]" />
            </Button>
            {!isMeine && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Nur gemerkte Vorlagen"
                aria-pressed={onlyFavorites}
                title="Nur gemerkte Vorlagen"
                className={cn(onlyFavorites && 'text-primary-600 dark:text-primary-400')}
                onClick={() => setOnlyFavorites((on) => !on)}
              >
                <Bookmark
                  aria-hidden
                  className="size-[18px]"
                  fill={onlyFavorites ? 'currentColor' : 'none'}
                />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={isFiltered ? `Filter: ${activeFilter.label}` : 'Filter'}
                  title={isFiltered ? `Filter: ${activeFilter.label}` : 'Filter'}
                  className={cn('relative', isFiltered && 'text-primary-600 dark:text-primary-400')}
                >
                  {isFiltered ? (
                    <HiFilter aria-hidden className="size-[18px]" />
                  ) : (
                    <HiOutlineFilter aria-hidden className="size-[18px]" />
                  )}
                  {isFiltered && (
                    <span
                      aria-hidden
                      className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary-600 dark:bg-primary-400"
                    />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[14rem]">
                <DropdownMenuLabel>Anzeigen</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={selectedCategory} onValueChange={selectFilter}>
                  {filters.map((f) => (
                    <DropdownMenuRadioItem key={f.id} value={f.id}>
                      {f.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {isAdmin && !isMeine && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Land: ${LAND_LABEL[shownLand]}`}
                    title={`Land: ${LAND_LABEL[shownLand]}`}
                    className={cn('relative', land && 'text-primary-600 dark:text-primary-400')}
                  >
                    <Globe aria-hidden className="size-[18px]" />
                    {land && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary-600 dark:bg-primary-400"
                      />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[14rem]">
                  <DropdownMenuLabel>Land (nur für Admins)</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={shownLand} onValueChange={selectLand}>
                    {sharepicCreatorLocaleSchema.options.map((value) => (
                      <DropdownMenuRadioItem key={value} value={value}>
                        {LAND_LABEL[value]}
                        {value === ownLand && ' (eigenes Land)'}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isMeine && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Große Kacheln"
                aria-pressed={gridSize === 'large'}
                title="Große Kacheln"
                onClick={toggleGridSize}
              >
                {gridSize === 'large' ? (
                  <LuGrid2X2 aria-hidden className="size-[18px]" />
                ) : (
                  <LuGrid3X3 aria-hidden className="size-[18px]" />
                )}
              </Button>
            )}
          </>
        }
      />
      <AddTemplateModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      {isMeine ? (
        <ErrorBoundary>
          <MeineVorlagenPanel
            onAdd={() => setShowAddModal(true)}
            onBrowse={() => selectFilter(ALL_FILTER)}
          />
        </ErrorBoundary>
      ) : (
        <>
          <h2 className="sr-only">{activeFilter.label}</h2>
          {settled && !dataQuery.error && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-foreground/60">
                {total} {total === 1 ? 'Vorlage' : 'Vorlagen'}
              </span>
              {isFiltered && (
                <FilterChip label={activeFilter.label} onRemove={() => selectFilter(ALL_FILTER)} />
              )}
              {activeTags.map((tag) => (
                <FilterChip key={tag} label={`#${tag}`} onRemove={() => removeTag(tag)} />
              ))}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-foreground/60 underline-offset-2 transition-colors hover:text-primary-500 hover:underline"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          )}

          {dataQuery.error ? (
            <p className="text-center text-error">
              {dataQuery.error.message || 'Fehler beim Laden'}
            </p>
          ) : (
            <>
              <div className={GRID_CLASS[gridSize]}>
                {!settled && total === 0 ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[3/4] animate-pulse rounded-lg bg-background-alt"
                    />
                  ))
                ) : (
                  <>
                    <SharepicVorlagenCards vorlagen={catalog} />
                    {items.map((item) => {
                      const itemId = String(item.id);
                      return (
                        <VorlagenCard
                          key={itemId}
                          item={{ ...item, likes_count: likesCount(itemId, item.likes_count) }}
                          onOpen={() => setPreviewTemplate(item)}
                          {...cardProps(itemId)}
                        />
                      );
                    })}
                  </>
                )}
              </div>

              {settled && total === 0 && (
                <EmptyResult
                  cause={
                    hasSearch || activeTags.length > 0
                      ? 'search'
                      : onlyFavorites
                        ? 'favorites'
                        : isFiltered
                          ? 'category'
                          : 'none'
                  }
                  onShowAll={() => selectFilter(ALL_FILTER)}
                />
              )}
            </>
          )}
        </>
      )}

      {previewTemplate && (
        <TemplatePreviewModal
          onClose={() => setPreviewTemplate(null)}
          template={previewTemplate}
          onTagClick={handleTagClick}
          {...cardProps(String(previewTemplate.id))}
          onUseTemplate={
            previewTemplate.template_type === GRUENERATOR_TEMPLATE_TYPE
              ? () =>
                  void openVorlage({
                    id: String(previewTemplate.id),
                    content_data: previewTemplate.content_data,
                  })
              : undefined
          }
          isUsing={usingId === String(previewTemplate.id)}
        />
      )}
    </PageShell>
  );
});

VorlagenGallery.displayName = 'VorlagenGallery';

export default VorlagenGallery;
