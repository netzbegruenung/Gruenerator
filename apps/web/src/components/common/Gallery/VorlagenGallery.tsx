import { GRUENERATOR_TEMPLATE_TYPE } from '@gruenerator/contracts';
import { Button, Popover, PopoverContent, PopoverTrigger, Switch } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { HiPlus } from 'react-icons/hi';
import { HiOutlineAdjustmentsHorizontal, HiMagnifyingGlass, HiXMark } from 'react-icons/hi2';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { useEntityFavorites } from '../../../features/favorites/hooks/useEntityFavorites';
import { useEntityLikes } from '../../../features/likes/hooks/useEntityLikes';
import { useGrueneratorVorlage } from '../../../features/vorlagen/hooks/useGrueneratorVorlage';
import apiClient from '../../utils/apiClient';
import AddTemplateModal from '../AddTemplateModal/AddTemplateModal';
import TemplatePreviewModal from '../TemplatePreviewModal';

import VorlagenCard from './VorlagenCard';

import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/utils/cn';

const LOCALE_LABEL: Record<string, string> = {
  'de-DE': 'Deutschland',
  'de-AT': 'Österreich',
};

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
  return [{ id: 'all', label: 'Alle Typen' }, ...labeled];
};

const VorlagenGallery = memo((): JSX.Element => {
  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState('title');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewTemplate, setPreviewTemplate] = useState<VorlageItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Scope the gallery to the user's region by default; the settings popover
  // lets them turn it off to browse templates from all audiences.
  const [localeFilter, setLocaleFilter] = useState(true);

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

  const dataQuery = useQuery({
    queryKey: ['vorlagen-gallery', textQuery, searchMode, selectedCategory, tags, localeFilter],
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

  const categories = categoriesQuery.data ?? [];
  const items = dataQuery.data ?? [];

  const { likedIds, toggleLike, isToggling: isLikeToggling, canLike } = useEntityLikes('template');
  const {
    favoritedIds,
    toggleFavorite,
    isToggling: isFavoriteToggling,
    canFavorite,
  } = useEntityFavorites('template');

  const { openVorlage, usingId } = useGrueneratorVorlage();

  const previewId = previewTemplate ? String(previewTemplate.id) : '';

  const handleTagClick = useCallback((tag: string) => {
    setInputValue((prev) => addTagToSearch(prev, tag));
  }, []);

  const removeTag = useCallback((tag: string) => {
    setInputValue((prev) => removeTagFromSearch(prev, tag));
  }, []);

  const resetFilters = useCallback(() => {
    setInputValue('');
    setSelectedCategory('all');
    setLocaleFilter(true);
  }, []);

  const copyLink = useCallback((item: VorlageItem) => {
    const url = resolveTemplateUrl(item);
    if (!url) return;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => toast.success('Link kopiert.'))
      .catch(() => toast.error('Link konnte nicht kopiert werden.'));
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((c) => c.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categories, selectedCategory]);

  const showCategoryFilter = categories.length > 0;

  // Active filters shown as removable chips below the search bar. Derived from
  // the live input (not the debounced term) so chips track typing immediately.
  const activeTags = useMemo(() => parseSearchQuery(inputValue).tags, [inputValue]);
  const activeCategory =
    selectedCategory !== 'all' ? categories.find((c) => c.id === selectedCategory) : undefined;
  const hasActiveFilters = activeTags.length > 0 || Boolean(activeCategory) || !localeFilter;

  return (
    <div className="mx-auto mt-[60px] max-w-[1200px] flex-col px-lg box-border max-md:mt-0 max-md:px-md max-md:py-lg">
      <div className="text-center">
        <h1 className="mb-4 text-[2.5rem] font-semibold text-foreground-heading max-md:text-[1.75rem]">
          Vorlagen-Datenbank
        </h1>
        <p className="mx-auto mb-xl max-w-[800px] text-center text-[1.1rem] leading-relaxed text-foreground">
          Durchsuche hier Design-Vorlagen für Canva, InDesign und mehr.
        </p>

        <div className="mx-auto mb-xl flex w-full max-w-[760px] flex-wrap items-center justify-center gap-3 px-md box-border max-md:flex-col max-md:items-stretch">
          {/* Compact, width-limited search field with leading icon. */}
          <div className="relative h-12 min-w-0 flex-1 max-md:w-full">
            <HiMagnifyingGlass
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-foreground/50"
              aria-hidden="true"
            />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Vorlagen durchsuchen..."
              aria-label="Vorlagen durchsuchen"
              className="h-full w-full rounded-full border-2 border-background-alt bg-background pl-11 pr-12 text-base text-foreground outline-none transition-colors placeholder:text-foreground/50 focus:border-primary-500"
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border-none bg-transparent text-foreground/60 transition-colors hover:bg-background-alt hover:text-primary-500',
                    (!localeFilter || selectedCategory !== 'all') &&
                      'bg-primary-500/10 text-primary-500'
                  )}
                  aria-label="Einstellungen"
                  title="Einstellungen"
                >
                  <HiOutlineAdjustmentsHorizontal className="size-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="w-[18rem] space-y-4 p-4">
                <label className="flex items-start justify-between gap-3 text-left">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      Auf {localeLabel} beschränken
                    </span>
                    <span className="mt-0.5 block text-xs text-grey-500 dark:text-grey-400">
                      Zeigt nur Vorlagen für deine Region.
                    </span>
                  </span>
                  <Switch
                    checked={localeFilter}
                    onCheckedChange={setLocaleFilter}
                    aria-label={`Auf ${localeLabel} beschränken`}
                  />
                </label>

                {showCategoryFilter && (
                  <div className="border-t border-grey-200 pt-3 dark:border-grey-700">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
                      Kategorie
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          className={cn(
                            'rounded-2xl border px-2.5 py-1 text-xs font-medium transition-colors',
                            selectedCategory === category.id
                              ? 'border-transparent bg-primary-500 text-white'
                              : 'border-grey-300 text-grey-700 hover:border-grey-400 dark:border-grey-600 dark:text-grey-300'
                          )}
                          onClick={() => setSelectedCategory(category.id)}
                        >
                          {category.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          <Button
            variant="brand"
            size="brand-md"
            className="max-md:w-full"
            onClick={() => setShowAddModal(true)}
          >
            <HiPlus className="size-5" />
            Vorlage hinzufügen
          </Button>
          <Button asChild variant="brand-outline" size="brand-md" className="max-md:w-full">
            <Link to="/vorlagen/meine">Meine Vorlagen</Link>
          </Button>

          <AddTemplateModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onSuccess={() => dataQuery.refetch()}
          />
        </div>
      </div>

      {!dataQuery.isLoading && !dataQuery.error && (
        <div className="mb-md flex flex-wrap items-center gap-2 text-sm">
          <span className="text-foreground/60">
            {items.length} {items.length === 1 ? 'Vorlage' : 'Vorlagen'}
          </span>
          {activeCategory && (
            <FilterChip label={activeCategory.label} onRemove={() => setSelectedCategory('all')} />
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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3">
        {dataQuery.isLoading && items.length === 0 ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-lg bg-background-alt" />
          ))
        ) : dataQuery.error ? (
          <p className="col-span-full text-center text-error">
            {dataQuery.error.message || 'Fehler beim Laden'}
          </p>
        ) : items.length === 0 ? (
          <p className="col-span-full text-center">Keine Vorlagen gefunden.</p>
        ) : (
          <>
            {/* Low-friction add tile, inline in the grid. */}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="group flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-grey-300 bg-transparent text-grey-500 transition-colors hover:border-primary-500 hover:text-primary-500 dark:border-grey-600"
            >
              <HiPlus className="size-7" />
              <span className="text-sm font-medium">Neue Vorlage</span>
            </button>
            {items.map((item) => {
              const itemId = String(item.id);
              const hasUrl = Boolean(resolveTemplateUrl(item));
              return (
                <VorlagenCard
                  key={itemId}
                  item={item}
                  onOpen={() => setPreviewTemplate(item)}
                  liked={likedIds.has(itemId)}
                  onToggleLike={canLike ? () => toggleLike(itemId) : undefined}
                  likeToggling={isLikeToggling(itemId)}
                  onCopyLink={hasUrl ? () => copyLink(item) : undefined}
                />
              );
            })}
          </>
        )}
      </div>

      {previewTemplate && (
        <TemplatePreviewModal
          isOpen={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          template={previewTemplate}
          onTagClick={handleTagClick}
          liked={likedIds.has(previewId)}
          likeCount={(previewTemplate.likes_count as number | undefined) ?? 0}
          onToggleLike={() => toggleLike(previewId)}
          likeToggling={isLikeToggling(previewId)}
          canLike={canLike}
          favorited={favoritedIds.has(previewId)}
          onToggleFavorite={() => toggleFavorite(previewId)}
          favoriteToggling={isFavoriteToggling(previewId)}
          canFavorite={canFavorite}
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
    </div>
  );
});

VorlagenGallery.displayName = 'VorlagenGallery';

export default VorlagenGallery;
