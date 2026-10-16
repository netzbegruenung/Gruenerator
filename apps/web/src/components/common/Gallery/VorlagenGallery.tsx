import { printVorlagenFor, type PrintVorlage } from '@gruenerator/canvas-editor/print-vorlagen';
import {
  GRUENERATOR_TEMPLATE_TYPE,
  sharepicCreatorLocaleSchema,
  type SharepicCreatorLocale,
} from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Globe } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { HiFilter, HiOutlineFilter, HiPlus } from 'react-icons/hi';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MeineVorlagenPanel } from '../../../features/vorlagen/components/MeineVorlagenPanel';
import {
  PRINT_TEMPLATE_TYPE,
  PrintVorlageCard,
  PrintVorlageDialog,
  printMatches,
} from '../../../features/vorlagen/components/PrintVorlagenSection';
import {
  catalogMatches,
  useSharepicVorlageCards,
} from '../../../features/vorlagen/components/SharepicVorlagenSection';
import { useGrueneratorVorlage } from '../../../features/vorlagen/hooks/useGrueneratorVorlage';
import { usePrintVorlage } from '../../../features/vorlagen/hooks/usePrintVorlage';
import { useSharepicVorlagen } from '../../../features/vorlagen/hooks/useSharepicVorlagen';
import { useVorlageInteractions } from '../../../features/vorlagen/hooks/useVorlageInteractions';
import { useAuthStore } from '../../../stores/authStore';
import ErrorBoundary from '../../ErrorBoundary';
import apiClient from '../../utils/apiClient';
import AddTemplateModal from '../AddTemplateModal/AddTemplateModal';
import { PageHero, PageHeroSearch, PageShell } from '../PageHero';
import TemplatePreviewModal from '../TemplatePreviewModal';

import {
  FilterChip,
  FilterMenuButton,
  GalleryCountRow,
  GalleryEmptyState,
  GalleryGrid,
  GallerySkeleton,
  GridSizeToggle,
  useGridSize,
} from './parts';
import VorlagenCard from './VorlagenCard';

import { cn } from '@/utils/cn';

const DEBOUNCE_DELAY = 500;

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
  [PRINT_TEMPLATE_TYPE]: 'Print',
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
  const [previewPrint, setPreviewPrint] = useState<PrintVorlage | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [gridSize, toggleGridSize] = useGridSize('vorlagen-grid-size');

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
      { id: PRINT_TEMPLATE_TYPE, label: CATEGORY_LABELS[PRINT_TEMPLATE_TYPE] },
      ...(categoriesQuery.data ?? []).filter(
        (c) =>
          c.id !== GRUENERATOR_TEMPLATE_TYPE &&
          c.id !== PRINT_TEMPLATE_TYPE &&
          c.id !== ALL_FILTER &&
          c.id !== MEINE_FILTER
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
  // The print Vorlagen live in the client; the server has nothing for this filter.
  const isPrint = selectedCategory === PRINT_TEMPLATE_TYPE;
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
    enabled: !isMeine && !isPrint,
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

  const showCatalog =
    !isMeine &&
    (selectedCategory === ALL_FILTER || selectedCategory === GRUENERATOR_TEMPLATE_TYPE) &&
    tags.length === 0;
  // `placeholderData` would keep the previous filter's items on the disabled query.
  const loadedItems = useMemo(
    () => (isPrint ? [] : (dataQuery.data ?? [])),
    [isPrint, dataQuery.data]
  );
  const catalogQuery = useSharepicVorlagen(land);
  const itemIds = useMemo(
    () => [
      ...loadedItems.map((item) => String(item.id)),
      ...(showCatalog ? (catalogQuery.data ?? []) : []).map((v) => v.id),
    ],
    [loadedItems, showCatalog, catalogQuery.data]
  );
  const interactions = useVorlageInteractions(itemIds);
  const { cardProps, likesCount, favoritedIds } = interactions;
  // The server already returns only bookmarks; this drops one unbookmarked meanwhile.
  const items = onlyFavorites
    ? loadedItems.filter((item) => favoritedIds.has(String(item.id)))
    : loadedItems;

  const { openVorlage, usingId } = useGrueneratorVorlage();
  const { openPrintVorlage, openingId } = usePrintVorlage();

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

  const catalog = useMemo(
    () =>
      showCatalog
        ? (catalogQuery.data ?? []).filter(
            (v) => catalogMatches(v, textQuery) && (!onlyFavorites || favoritedIds.has(v.id))
          )
        : [],
    [showCatalog, catalogQuery.data, textQuery, onlyFavorites, favoritedIds]
  );
  // Print Vorlagen have no likes or bookmarks yet, so „nur gemerkte" hides them.
  const showPrint =
    !isMeine && (selectedCategory === ALL_FILTER || isPrint) && tags.length === 0 && !onlyFavorites;
  const printVorlagen = useMemo(
    () => (showPrint ? printVorlagenFor(shownLand).filter((v) => printMatches(v, textQuery)) : []),
    [showPrint, shownLand, textQuery]
  );
  const total = items.length + catalog.length + printVorlagen.length;

  // Most liked first, like the studio's „Beliebte Vorlagen"; the sort is
  // stable, so ties keep catalogue before community, newest community first.
  const sorted = useMemo(() => {
    const entries = [
      ...catalog.map((vorlage) => ({ id: vorlage.id, vorlage, item: undefined, print: undefined })),
      ...printVorlagen.map((print) => ({
        id: print.id,
        print,
        vorlage: undefined,
        item: undefined,
      })),
      ...items.map((item) => ({ id: String(item.id), item, vorlage: undefined, print: undefined })),
    ];
    const likes = (e: (typeof entries)[number]) =>
      e.print ? 0 : likesCount(e.id, e.item?.likes_count);
    return entries.sort((a, b) => likes(b) - likes(a));
  }, [catalog, printVorlagen, items, likesCount]);
  const { renderCard, dialog: catalogDialog } = useSharepicVorlageCards(catalog, interactions);
  const settled = !dataQuery.isLoading && (!showCatalog || !catalogQuery.isLoading);
  const emptyCause: EmptyCause =
    hasSearch || activeTags.length > 0
      ? 'search'
      : onlyFavorites
        ? 'favorites'
        : isFiltered
          ? 'category'
          : 'none';

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
            <FilterMenuButton
              label={isFiltered ? `Filter: ${activeFilter.label}` : 'Filter'}
              menuLabel="Anzeigen"
              value={selectedCategory}
              options={filters}
              onChange={selectFilter}
              active={isFiltered}
              icon={
                isFiltered ? (
                  <HiFilter aria-hidden className="size-[18px]" />
                ) : (
                  <HiOutlineFilter aria-hidden className="size-[18px]" />
                )
              }
            />
            {isAdmin && !isMeine && (
              <FilterMenuButton
                label={`Land: ${LAND_LABEL[shownLand]}`}
                menuLabel="Land (nur für Admins)"
                value={shownLand}
                options={sharepicCreatorLocaleSchema.options.map((value) => ({
                  id: value,
                  label:
                    value === ownLand ? `${LAND_LABEL[value]} (eigenes Land)` : LAND_LABEL[value],
                }))}
                onChange={selectLand}
                active={Boolean(land)}
                icon={<Globe aria-hidden className="size-[18px]" />}
              />
            )}
            {!isMeine && <GridSizeToggle gridSize={gridSize} onToggle={toggleGridSize} />}
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
            <GalleryCountRow
              count={`${total} ${total === 1 ? 'Vorlage' : 'Vorlagen'}`}
              onReset={hasActiveFilters ? resetFilters : undefined}
            >
              {isFiltered && (
                <FilterChip label={activeFilter.label} onRemove={() => selectFilter(ALL_FILTER)} />
              )}
              {activeTags.map((tag) => (
                <FilterChip key={tag} label={`#${tag}`} onRemove={() => removeTag(tag)} />
              ))}
            </GalleryCountRow>
          )}

          {dataQuery.error ? (
            <p className="text-center text-error">
              {dataQuery.error.message || 'Fehler beim Laden'}
            </p>
          ) : (
            <>
              <GalleryGrid size={gridSize}>
                {!settled && total === 0 ? (
                  <GallerySkeleton />
                ) : (
                  <>
                    {sorted.map((entry) =>
                      entry.vorlage ? (
                        renderCard(entry.vorlage)
                      ) : entry.print ? (
                        <PrintVorlageCard
                          key={entry.id}
                          vorlage={entry.print}
                          onOpen={setPreviewPrint}
                        />
                      ) : (
                        <VorlagenCard
                          key={entry.id}
                          item={{
                            ...entry.item,
                            likes_count: likesCount(entry.id, entry.item.likes_count),
                          }}
                          onOpen={() => setPreviewTemplate(entry.item)}
                          {...cardProps(entry.id)}
                        />
                      )
                    )}
                    {catalogDialog}
                  </>
                )}
              </GalleryGrid>

              {settled && total === 0 && (
                <GalleryEmptyState
                  {...EMPTY_TEXT[emptyCause]}
                  action={
                    emptyCause === 'category' ? (
                      <Button variant="outline" size="sm" onClick={() => selectFilter(ALL_FILTER)}>
                        Alle Vorlagen anzeigen
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </>
          )}
        </>
      )}

      {previewPrint && (
        <PrintVorlageDialog
          vorlage={previewPrint}
          opening={openingId === previewPrint.id}
          onEdit={(v) => void openPrintVorlage(v)}
          onClose={() => setPreviewPrint(null)}
        />
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
