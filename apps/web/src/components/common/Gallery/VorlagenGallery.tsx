import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { HiPlus } from 'react-icons/hi';
import { HiCog6Tooth } from 'react-icons/hi2';

import SearchBar from '../../../features/search/components/SearchBar';
import apiClient from '../../utils/apiClient';
import AddTemplateModal from '../AddTemplateModal/AddTemplateModal';
import BetaFeatureWrapper from '../BetaFeatureWrapper';
import IndexCard from '../IndexCard';
import TemplatePreviewModal from '../TemplatePreviewModal';

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
  content_data?: { originalUrl?: string };
  metadata?: { author_name?: string; contact_email?: string };
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

const fetchVorlagen = async ({
  searchTerm,
  searchMode,
  selectedCategory,
  tags,
  signal,
}: {
  searchTerm: string;
  searchMode: string;
  selectedCategory: string;
  tags: string[];
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

  const response = await apiClient.get('/auth/vorlagen', { params, signal });
  const data = response.data;
  return Array.isArray(data?.vorlagen) ? data.vorlagen : [];
};

const fetchCategories = async (): Promise<CategoryItem[]> => {
  const response = await apiClient.get('/auth/vorlagen-categories');
  const data = response.data;
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  return [{ id: 'all', label: 'Alle Typen' }, ...categories];
};

const VorlagenGallery = memo((): JSX.Element => {
  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState('title');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [previewTemplate, setPreviewTemplate] = useState<VorlageItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

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
    queryKey: ['vorlagen-gallery', textQuery, searchMode, selectedCategory, tags],
    staleTime: 30_000,
    gcTime: 60_000,
    refetchOnMount: 'always' as const,
    queryFn: ({ signal }) =>
      fetchVorlagen({ searchTerm: textQuery, searchMode, selectedCategory, tags, signal }),
    placeholderData: (prev) => prev,
  });

  const categories = categoriesQuery.data ?? [];
  const items = dataQuery.data ?? [];

  const handleTagClick = useCallback((tag: string) => {
    setInputValue((prev) => addTagToSearch(prev, tag));
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((c) => c.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categories, selectedCategory]);

  const showCategoryFilter = categories.length > 0;

  return (
    <BetaFeatureWrapper featureKey="vorlagen" fallbackPath="/">
      <div className="mx-auto mt-[60px] max-w-[1200px] flex-col px-lg box-border max-md:mt-0 max-md:px-md max-md:py-lg">
        <div className="text-center">
          <h1 className="mb-4 text-[2.5rem] font-semibold text-foreground-heading max-md:text-[1.75rem]">
            Vorlagen-Datenbank
          </h1>
          <p className="mx-auto mb-xl max-w-[800px] text-center text-[1.1rem] leading-relaxed text-foreground">
            Durchsuche hier Design-Vorlagen für Canva, InDesign und mehr.
          </p>

          <div className="mx-auto mb-xl flex w-full justify-center px-md box-border">
            <div className="gallery-controls">
              <div className="gallery-controls-row">
                <SearchBar
                  onSearch={() => {}}
                  value={inputValue}
                  onChange={setInputValue}
                  placeholder="Vorlagen durchsuchen..."
                  hideExamples
                  hideDisclaimer
                  settingsContent={
                    showCategoryFilter ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center justify-center rounded-full border-none bg-transparent p-2 text-foreground opacity-70 transition-colors hover:bg-background-alt hover:text-primary-500 hover:opacity-100"
                            aria-label="Einstellungen"
                            title="Einstellungen"
                          >
                            <HiCog6Tooth className="size-5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          sideOffset={8}
                          className="w-[16rem] space-y-3 p-3"
                        >
                          <div>
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
                        </PopoverContent>
                      </Popover>
                    ) : null
                  }
                />
                <button
                  type="button"
                  className="pabtn pabtn--primary pabtn--s"
                  onClick={() => setShowAddModal(true)}
                >
                  <HiPlus className="pabtn__icon" />
                  <span className="pabtn__label">Vorlage hinzufügen</span>
                </button>
              </div>

              <AddTemplateModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSuccess={() => dataQuery.refetch()}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2xl max-lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] max-md:gap-4">
          {dataQuery.isLoading && items.length === 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-md col-span-full">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-md bg-background-alt h-[180px]" />
              ))}
            </div>
          ) : dataQuery.error ? (
            <p className="col-span-full text-center text-error">
              {dataQuery.error.message || 'Fehler beim Laden'}
            </p>
          ) : items.length === 0 ? (
            <p className="col-span-full text-center">Keine Vorlagen gefunden.</p>
          ) : (
            items.map((item) => {
              const templateType = item.template_type
                ? item.template_type.charAt(0).toUpperCase() + item.template_type.slice(1)
                : '';
              return (
                <IndexCard
                  key={String(item.id)}
                  title={item.title || 'Unbenannte Vorlage'}
                  description={item.description || ''}
                  meta={templateType}
                  tags={Array.isArray(item.tags) ? item.tags.slice(0, 5) : []}
                  thumbnailUrl={item.thumbnail_url || ''}
                  onTagClick={handleTagClick}
                  onClick={() => setPreviewTemplate(item)}
                  className="vorlagen-card"
                  authorName={item.metadata?.author_name || ''}
                  authorEmail={item.metadata?.contact_email || ''}
                />
              );
            })
          )}
        </div>

        {previewTemplate && (
          <TemplatePreviewModal
            isOpen={!!previewTemplate}
            onClose={() => setPreviewTemplate(null)}
            template={previewTemplate}
            onTagClick={handleTagClick}
          />
        )}
      </div>
    </BetaFeatureWrapper>
  );
});

VorlagenGallery.displayName = 'VorlagenGallery';

export default VorlagenGallery;
