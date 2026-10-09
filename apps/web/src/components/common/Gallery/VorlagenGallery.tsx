import { GRUENERATOR_TEMPLATE_TYPE } from '@gruenerator/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { HiCog, HiFilter, HiPlus } from 'react-icons/hi';
import { HiXMark } from 'react-icons/hi2';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MeineVorlagenPanel } from '../../../features/vorlagen/components/MeineVorlagenPanel';
import { SharepicVorlagenSection } from '../../../features/vorlagen/components/SharepicVorlagenSection';
import { useGrueneratorVorlage } from '../../../features/vorlagen/hooks/useGrueneratorVorlage';
import { useVorlageInteractions } from '../../../features/vorlagen/hooks/useVorlageInteractions';
import ErrorBoundary from '../../ErrorBoundary';
import apiClient from '../../utils/apiClient';
import AddTemplateModal from '../AddTemplateModal/AddTemplateModal';
import { PageHero, PageHeroSearch, PageShell } from '../PageHero';
import TemplatePreviewModal from '../TemplatePreviewModal';

import VorlagenCard from './VorlagenCard';

import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';

const LOCALE_LABEL: Record<string, string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

const DEBOUNCE_DELAY = 500;

const GRID_CLASS =
  'grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3';

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

/** Resolve the openable/shareable URL for a gallery item, if any. */
const resolveTemplateUrl = (item: VorlageItem): string | undefined =>
  item.content_data?.originalUrl || item.external_url || item.download_url || undefined;

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
  localeFilter,
  signal,
}: {
  searchTerm: string;
  searchMode: string;
  selectedCategory: string;
  tags: string[];
  localeFilter: boolean;
  signal?: AbortSignal;
}): Promise<VorlageItem[]> => {
  const params: Record<string, unknown> = {};
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
  // Locale filtering is on by default server-side; only signal when turned off.
  if (!localeFilter) {
    params.localeFilter = 'false';
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
  // Scope the gallery to the user's region by default; the settings popover
  // lets them turn it off to browse templates from all audiences.
  const [localeFilter, setLocaleFilter] = useState(true);
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const localeLabel = LOCALE_LABEL[userLocale] ?? 'meine Region';

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

  const dataQuery = useQuery({
    queryKey: ['vorlagen-gallery', textQuery, searchMode, selectedCategory, tags, localeFilter],
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
        localeFilter,
        signal,
      }),
    placeholderData: (prev) => prev,
  });

  const loadedItems = useMemo(() => dataQuery.data ?? [], [dataQuery.data]);
  const itemIds = useMemo(() => loadedItems.map((item) => String(item.id)), [loadedItems]);
  const { cardProps, likesCount, favoritedIds } = useVorlageInteractions(itemIds);
  const items = onlyFavorites
    ? loadedItems.filter((item) => favoritedIds.has(String(item.id)))
    : loadedItems;

  const { openVorlage, usingId } = useGrueneratorVorlage();

  const previewId = previewTemplate ? String(previewTemplate.id) : '';
  const preview = cardProps(previewId);

  const handleTagClick = useCallback((tag: string) => {
    setInputValue((prev) => addTagToSearch(prev, tag));
  }, []);

  const removeTag = useCallback((tag: string) => {
    setInputValue((prev) => removeTagFromSearch(prev, tag));
  }, []);

  const resetFilters = useCallback(() => {
    setInputValue('');
    selectFilter(ALL_FILTER);
    setLocaleFilter(true);
    setOnlyFavorites(false);
  }, [selectFilter]);

  const copyLink = useCallback((item: VorlageItem) => {
    const url = resolveTemplateUrl(item);
    if (!url) return;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => toast.success('Link kopiert.'))
      .catch(() => toast.error('Link konnte nicht kopiert werden.'));
  }, []);

  // Active filters shown as removable chips below the search bar. Derived from
  // the live input (not the debounced term) so chips track typing immediately.
  const activeTags = useMemo(() => parseSearchQuery(inputValue).tags, [inputValue]);
  const activeFilter = filters.find((f) => f.id === selectedCategory) ?? {
    id: selectedCategory,
    label: CATEGORY_LABELS[selectedCategory] ?? selectedCategory,
  };
  const isFiltered = selectedCategory !== ALL_FILTER;
  const hasActiveFilters =
    activeTags.length > 0 || (isFiltered && !isMeine) || !localeFilter || onlyFavorites;

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
                  <HiFilter aria-hidden className="size-[18px]" />
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
            {!isMeine && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Einstellungen"
                    title="Einstellungen"
                  >
                    <HiCog aria-hidden className="size-[18px]" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[16.25rem]">
                  <DropdownMenuLabel>Region</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={localeFilter}
                    onCheckedChange={setLocaleFilter}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex flex-col gap-px">
                      <span>Auf {localeLabel} beschränken</span>
                      <span className="text-xs text-grey-500">
                        Zeigt nur Vorlagen für deine Region.
                      </span>
                    </span>
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
          {(selectedCategory === ALL_FILTER || selectedCategory === GRUENERATOR_TEMPLATE_TYPE) &&
            activeTags.length === 0 && (
              <SharepicVorlagenSection
                query={textQuery}
                gridClassName={GRID_CLASS}
                onlyFavorites={onlyFavorites}
              />
            )}

          <h2 className="sr-only">{activeFilter.label}</h2>
          {!dataQuery.isLoading && !dataQuery.error && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-foreground/60">
                {items.length} {items.length === 1 ? 'Vorlage' : 'Vorlagen'}
              </span>
              {isFiltered && (
                <FilterChip label={activeFilter.label} onRemove={() => selectFilter(ALL_FILTER)} />
              )}
              {activeTags.map((tag) => (
                <FilterChip key={tag} label={`#${tag}`} onRemove={() => removeTag(tag)} />
              ))}
              {!localeFilter && (
                <FilterChip label="Alle Regionen" onRemove={() => setLocaleFilter(true)} />
              )}
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
              <div className={GRID_CLASS}>
                {dataQuery.isLoading && items.length === 0 ? (
                  Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[3/4] animate-pulse rounded-lg bg-background-alt"
                    />
                  ))
                ) : (
                  <>
                    {/* Low-friction add tile, inline in the grid. Kept below the
                    cards' own height so the grid row stretch fills it out. */}
                    <button
                      type="button"
                      onClick={() => setShowAddModal(true)}
                      className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border-[1.5px] border-dashed border-grey-300 bg-transparent text-base text-grey-500 transition-colors hover:border-primary-500 hover:bg-primary-500/5 hover:text-primary-500 dark:border-grey-600"
                    >
                      <HiPlus className="size-7" />
                      <span>Neue Vorlage</span>
                    </button>
                    {items.map((item) => {
                      const itemId = String(item.id);
                      const hasUrl = Boolean(resolveTemplateUrl(item));
                      return (
                        <VorlagenCard
                          key={itemId}
                          item={{ ...item, likes_count: likesCount(itemId, item.likes_count) }}
                          onOpen={() => setPreviewTemplate(item)}
                          onCopyLink={hasUrl ? () => copyLink(item) : undefined}
                          {...cardProps(itemId)}
                        />
                      );
                    })}
                  </>
                )}
              </div>

              {!dataQuery.isLoading && items.length === 0 && (
                <div className="py-16 text-center">
                  <p className="mb-1 text-[1.0625rem] font-semibold text-foreground-heading">
                    Keine Vorlagen gefunden
                  </p>
                  <p className="text-sm text-foreground/60">Versuche einen anderen Suchbegriff.</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {previewTemplate && (
        <TemplatePreviewModal
          isOpen={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          template={previewTemplate}
          onTagClick={handleTagClick}
          liked={preview.liked}
          likeCount={likesCount(previewId, previewTemplate.likes_count)}
          onToggleLike={() => preview.onToggleLike?.()}
          likeToggling={preview.likeToggling}
          canLike={Boolean(preview.onToggleLike)}
          favorited={preview.favorited}
          onToggleFavorite={() => preview.onToggleFavorite?.()}
          favoriteToggling={preview.favoriteToggling}
          canFavorite={Boolean(preview.onToggleFavorite)}
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
