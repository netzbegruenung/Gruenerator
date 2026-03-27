import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  Input,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from '@gruenerator/ui';
import { ChevronLeft, XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiDocumentText, HiCollection, HiLink } from 'react-icons/hi';
import { PiSquaresFour } from 'react-icons/pi';

import apiClient from '../../../components/utils/apiClient';
import { ICONS } from '../../../config/icons';
import { profileApiService } from '../../auth/services/profileApiService';
import { SYSTEM_NOTEBOOKS } from '../../notebook/config/notebooksConfig';
import {
  LINK_ICONS,
  detectIconFromUrl,
  detectTitleFromUrl,
  getLinkIcon,
} from '../config/linkIcons';

import type { GroupLink } from '../hooks/useGroups';
import type { IconType } from 'react-icons';

import { cn } from '@/utils/cn';

interface ContentItem {
  id: string | number;
  title?: string;
  name?: string;
  description?: string;
  filename?: string;
}

interface ContentCategory {
  id: CategoryId;
  label: string;
  icon: IconType;
  contentType: string;
}

type CategoryId =
  | 'collabDocs'
  | 'boards'
  | 'documents'
  | 'texts'
  | 'generators'
  | 'notebooks'
  | 'links';

interface ContentState {
  collabDocs: ContentItem[];
  boards: ContentItem[];
  documents: ContentItem[];
  texts: ContentItem[];
  generators: ContentItem[];
  notebooks: ContentItem[];
}

interface SelectedItemsState {
  [key: string]: (string | number)[];
}

interface SharePermissions {
  read: boolean;
  write: boolean;
  collaborative: boolean;
}

interface ShareOptions {
  permissions: SharePermissions;
  targetGroupId: string;
}

interface AddContentToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  onShareContent: (
    contentType: string,
    itemId: string | number,
    options: ShareOptions
  ) => Promise<void>;
  isSharing?: boolean;
  onSuccess?: (count: number) => void;
  onError?: (error: { message: string } | unknown) => void;
  initialContentType?: 'templates' | 'content' | string;
  onAddLink?: (link: Omit<GroupLink, 'id'>) => void;
  isAddingLink?: boolean;
}

const CONTENT_CATEGORIES: ContentCategory[] = [
  { id: 'collabDocs', label: 'Docs', icon: HiDocumentText, contentType: 'collaborative_documents' },
  {
    id: 'boards',
    label: 'Boards',
    icon: PiSquaresFour as IconType,
    contentType: 'collaborative_documents',
  },
  { id: 'documents', label: 'Dokumente', icon: HiDocumentText, contentType: 'documents' },
  { id: 'texts', label: 'Texte', icon: HiDocumentText, contentType: 'user_documents' },
  { id: 'generators', label: 'Grüneratoren', icon: HiCollection, contentType: 'custom_generators' },
  {
    id: 'notebooks',
    label: 'Notebooks',
    icon: ICONS.actions.notebook as IconType,
    contentType: 'notebook_collections',
  },
];

const READ_ONLY_PERMISSIONS: SharePermissions = { read: true, write: false, collaborative: false };

const AddContentToGroupModal: React.FC<AddContentToGroupModalProps> = ({
  isOpen,
  onClose,
  groupId,
  onShareContent,
  isSharing,
  onSuccess,
  onError,
  onAddLink,
  isAddingLink,
}) => {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItemsState>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contentPage, setContentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkIcon, setLinkIcon] = useState('globe');
  const [linkIconManual, setLinkIconManual] = useState(false);
  const [linkTitleManual, setLinkTitleManual] = useState(false);
  const [linkUrlError, setLinkUrlError] = useState<string | null>(null);

  const [content, setContent] = useState<ContentState>({
    collabDocs: [],
    boards: [],
    documents: [],
    texts: [],
    generators: [],
    notebooks: [],
  });

  useEffect(() => {
    if (!isOpen) {
      setSelectedItems({});
      setActiveCategory(null);
      setContentPage(1);
      setSearchQuery('');
      setLinkTitle('');
      setLinkUrl('');
      setLinkDescription('');
      setLinkIcon('globe');
      setLinkIconManual(false);
      setLinkTitleManual(false);
      setLinkUrlError(null);
      return;
    }

    const loadContent = async () => {
      setIsLoading(true);
      try {
        const [collabDocsRaw, boardsRaw, docs, texts, generators, notebooks] = await Promise.all([
          apiClient
            .get('/docs')
            .then((r) => r.data)
            .catch(() => []),
          apiClient
            .get('/boards')
            .then((r) => r.data)
            .catch(() => []),
          profileApiService.getAvailableDocuments().catch((): ContentItem[] => []),
          profileApiService.getUserTexts().catch((): ContentItem[] => []),
          profileApiService.getCustomGenerators().catch((): ContentItem[] => []),
          profileApiService.getNotebookCollections().catch((): ContentItem[] => []),
        ]);

        const collabDocs = Array.isArray(collabDocsRaw)
          ? collabDocsRaw.filter(
              (d: { document_subtype?: string }) => d.document_subtype !== 'boards'
            )
          : [];
        const boards = Array.isArray(boardsRaw) ? boardsRaw : [];

        const systemNotebookItems: ContentItem[] = SYSTEM_NOTEBOOKS.map((nb) => ({
          id: `system:${nb.id}`,
          title: nb.title,
        }));

        setContent({
          collabDocs,
          boards,
          documents: docs || [],
          texts: texts || [],
          generators: generators || [],
          notebooks: [...(notebooks || []), ...systemNotebookItems],
        });
      } catch (error) {
        console.error('Error loading content:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [isOpen]);

  const handleToggleItem = useCallback((categoryId: CategoryId, itemId: string | number) => {
    setSelectedItems((prev) => {
      const selections = prev[categoryId] || [];
      const isSelected = selections.some((id) => String(id) === String(itemId));
      return {
        ...prev,
        [categoryId]: isSelected
          ? selections.filter((id) => String(id) !== String(itemId))
          : [...selections, itemId],
      };
    });
  }, []);

  const handleAddLink = useCallback(() => {
    if (!linkTitle.trim() || !linkUrl.trim() || !onAddLink) return;
    if (!/^https?:\/\/.+/.test(linkUrl.trim())) {
      setLinkUrlError('URL muss mit http:// oder https:// beginnen.');
      return;
    }
    const data: Omit<GroupLink, 'id'> = {
      title: linkTitle.trim(),
      url: linkUrl.trim(),
      icon: linkIcon,
    };
    if (linkDescription.trim()) {
      data.description = linkDescription.trim();
    }
    onAddLink(data);
    setLinkTitle('');
    setLinkUrl('');
    setLinkDescription('');
    setLinkIcon('globe');
    setLinkUrlError(null);
    onSuccess?.(1);
  }, [linkTitle, linkUrl, linkDescription, linkIcon, onAddLink, onSuccess]);

  const totalSelectedCount = useMemo(() => {
    return Object.values(selectedItems).reduce(
      (sum: number, arr: (string | number)[]) => sum + arr.length,
      0
    );
  }, [selectedItems]);

  const handleShare = useCallback(async () => {
    if (totalSelectedCount === 0) return;
    setIsSaving(true);
    try {
      const shareRequests = CONTENT_CATEGORIES.flatMap((cat) =>
        (selectedItems[cat.id] || []).map((itemId) => {
          const idStr = String(itemId);
          const isSystemNotebook = cat.id === 'notebooks' && idStr.startsWith('system:');
          const contentType = isSystemNotebook ? 'system_notebooks' : cat.contentType;
          const resolvedId = isSystemNotebook ? idStr.slice('system:'.length) : itemId;
          return onShareContent(contentType, resolvedId, {
            permissions: READ_ONLY_PERMISSIONS,
            targetGroupId: groupId,
          });
        })
      );
      const results = await Promise.allSettled(shareRequests);
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const errorCount = results.filter((r) => r.status === 'rejected').length;
      if (successCount > 0) onSuccess?.(successCount);
      if (errorCount > 0)
        onError?.({ message: `${errorCount} Inhalt(e) konnten nicht hinzugefügt werden.` });
    } catch (error) {
      onError?.(error);
    } finally {
      setIsSaving(false);
    }
  }, [selectedItems, totalSelectedCount, onShareContent, groupId, onSuccess, onError]);

  // Categories with items (+ links always available if onAddLink provided)
  const availableCategories = useMemo(() => {
    const cats = CONTENT_CATEGORIES.filter(
      (cat) => (content[cat.id as keyof ContentState] || []).length > 0
    );
    if (onAddLink) {
      cats.push({ id: 'links', label: 'Links', icon: HiLink as IconType, contentType: 'links' });
    }
    return cats;
  }, [content, onAddLink]);

  const allCategoryItems: ContentItem[] =
    activeCategory && activeCategory !== 'links'
      ? content[activeCategory as keyof ContentState] || []
      : [];

  const currentItems = useMemo(() => {
    if (!searchQuery.trim()) return allCategoryItems;
    const q = searchQuery.toLowerCase();
    return allCategoryItems.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      return title.includes(q);
    });
  }, [allCategoryItems, searchQuery]);

  const GRID_COLS = 4;
  const GRID_ROW_HEIGHT = 72;
  const DIALOG_CHROME_HEIGHT = 290;
  const gridRows = Math.max(
    2,
    Math.floor((window.innerHeight * 0.92 - DIALOG_CHROME_HEIGHT) / GRID_ROW_HEIGHT)
  );
  const itemsPerPage = GRID_COLS * gridRows;
  const totalPages = Math.ceil(currentItems.length / itemsPerPage);
  const safePage = Math.min(contentPage, Math.max(1, totalPages));
  const paginatedItems =
    currentItems.length > itemsPerPage
      ? currentItems.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage)
      : currentItems;
  const currentSelections: (string | number)[] = activeCategory
    ? selectedItems[activeCategory] || []
    : [];

  const activeCategoryData = CONTENT_CATEGORIES.find((c) => c.id === activeCategory);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[36rem] max-h-[92vh] flex flex-col gap-0"
        showCloseButton={false}
      >
        <div className="flex items-center gap-sm pb-md">
          {activeCategory && (
            <button
              type="button"
              onClick={() => {
                setActiveCategory(null);
                setContentPage(1);
                setSearchQuery('');
              }}
              className="flex items-center justify-center size-7 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors cursor-pointer bg-transparent border-none shrink-0"
              aria-label="Zurück"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          <h2 className="text-lg font-semibold text-foreground-heading m-0 shrink-0">
            {activeCategory === 'links'
              ? 'Link hinzufügen'
              : activeCategory
                ? activeCategoryData?.label
                : 'Inhalte hinzufügen'}
          </h2>
          {activeCategory &&
            activeCategory !== 'links' &&
            allCategoryItems.length > itemsPerPage && (
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setContentPage(1);
                }}
                placeholder="Suchen..."
                className="h-7 text-xs flex-1 min-w-0"
              />
            )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center size-7 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800 transition-colors cursor-pointer bg-transparent border-none shrink-0 ml-auto"
            aria-label="Schließen"
          >
            <XIcon className="size-4 text-grey-500" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-md p-lg flex-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-md">
                <Skeleton className="size-8 rounded-lg" />
                <Skeleton className="h-4 w-3/4 rounded" />
              </div>
            ))}
          </div>
        ) : !activeCategory ? (
          /* ── Category cards ── */
          <div className="grid grid-cols-2 gap-sm px-lg py-sm">
            {availableCategories.map((cat) => {
              const Icon = cat.icon;
              const count =
                cat.id !== 'links' ? (content[cat.id as keyof ContentState] || []).length : 0;
              const selectedCount = (selectedItems[cat.id] || []).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setContentPage(1);
                  }}
                  className="flex items-center gap-sm rounded-md border border-grey-200 dark:border-grey-700 bg-background p-md transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600 cursor-pointer text-left"
                >
                  <div className="flex items-center justify-center size-9 rounded-md bg-primary-50 dark:bg-primary-950/20 shrink-0">
                    <Icon className="size-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-foreground-heading">{cat.label}</span>
                    {count > 0 && <span className="text-xs text-grey-500">{count} verfügbar</span>}
                  </div>
                  {selectedCount > 0 && (
                    <Badge variant="default" className="text-[0.6rem] leading-none px-1.5 py-0.5">
                      {selectedCount}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        ) : activeCategory === 'links' ? (
          /* ── Link form — progressive: URL first, details after ── */
          <div className="flex flex-col gap-md px-lg py-sm">
            <div className="flex flex-col gap-xs">
              <label className="text-sm font-medium text-foreground">URL</label>
              <div className="flex items-center gap-xs">
                <Input
                  value={linkUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLinkUrl(val);
                    if (linkUrlError) setLinkUrlError(null);
                    if (!linkIconManual) setLinkIcon(detectIconFromUrl(val));
                    if (!linkTitleManual) setLinkTitle(detectTitleFromUrl(val) ?? '');
                  }}
                  placeholder="https://..."
                  type="url"
                  autoFocus
                  className="flex-1"
                />
                {linkUrl.trim().length > 0 &&
                  (() => {
                    const CurrentIcon = getLinkIcon(linkIcon);
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center justify-center size-9 rounded-md border border-grey-200 dark:border-grey-700 bg-background hover:bg-grey-50 dark:hover:bg-grey-800 transition-colors cursor-pointer shrink-0"
                            title="Icon ändern"
                          >
                            <CurrentIcon className="size-4 text-primary-600 dark:text-primary-400" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-sm">
                          <div className="grid grid-cols-6 gap-xs">
                            {LINK_ICONS.map((entry) => {
                              const isSelected = linkIcon === entry.key;
                              const IconComp = entry.icon;
                              return (
                                <button
                                  key={entry.key}
                                  type="button"
                                  className={cn(
                                    'flex flex-col items-center justify-center gap-xxs rounded-md p-xs transition-all duration-150 border-2 cursor-pointer bg-transparent',
                                    isSelected
                                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                                      : 'border-transparent hover:border-grey-300 dark:hover:border-grey-600'
                                  )}
                                  onClick={() => {
                                    setLinkIcon(entry.key);
                                    setLinkIconManual(true);
                                  }}
                                  title={entry.label}
                                >
                                  <IconComp className="size-4 text-foreground" />
                                  <span className="text-[0.55rem] text-foreground truncate w-full text-center">
                                    {entry.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
              </div>
              {linkUrlError && <p className="text-xs text-red-500 m-0">{linkUrlError}</p>}
            </div>
            {linkUrl.trim().length > 0 && (
              <>
                <div className="flex flex-col gap-xs">
                  <label className="text-sm font-medium text-foreground">Titel</label>
                  <Input
                    value={linkTitle}
                    onChange={(e) => {
                      setLinkTitle(e.target.value);
                      setLinkTitleManual(true);
                    }}
                    placeholder="z.B. Signal-Gruppe"
                    maxLength={100}
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="text-sm font-medium text-foreground">
                    Beschreibung (optional)
                  </label>
                  <Input
                    value={linkDescription}
                    onChange={(e) => setLinkDescription(e.target.value)}
                    placeholder="Kurze Beschreibung..."
                    maxLength={300}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── Item grid ── */
          <div className="grid grid-cols-4 gap-xs px-lg py-sm">
            {paginatedItems.map((item: ContentItem) => {
              const isSelected = currentSelections.some((sel) => String(sel) === String(item.id));
              const title = item.title || item.name || 'Ohne Titel';
              const Icon = activeCategoryData?.icon ?? HiDocumentText;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleToggleItem(activeCategory, item.id)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-xxs rounded-md border-2 p-xs cursor-pointer transition-all duration-150 bg-transparent',
                    isSelected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                      : 'border-grey-200 dark:border-grey-700 hover:border-grey-300 dark:hover:border-grey-600 hover:shadow-sm'
                  )}
                >
                  <Icon
                    className={cn(
                      'size-4',
                      isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-grey-400'
                    )}
                  />
                  <span className="text-[0.65rem] font-medium text-foreground-heading text-center line-clamp-2 leading-tight w-full">
                    {title}
                  </span>
                  {isSelected && (
                    <div className="absolute -top-1 -right-1 size-3.5 rounded-full bg-primary-500 text-white flex items-center justify-center">
                      <svg className="size-2" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter className="pt-md border-t border-grey-200 dark:border-grey-700 flex-col gap-sm">
          {totalPages > 1 && activeCategory && activeCategory !== 'links' && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setContentPage((p) => Math.max(1, p - 1))}
                    className={cn(safePage <= 1 && 'pointer-events-none opacity-50')}
                    aria-disabled={safePage <= 1}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      isActive={page === safePage}
                      onClick={() => setContentPage(page)}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setContentPage((p) => Math.min(totalPages, p + 1))}
                    className={cn(safePage >= totalPages && 'pointer-events-none opacity-50')}
                    aria-disabled={safePage >= totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
          <div className="flex justify-end gap-sm w-full">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Abbrechen
            </Button>
            {activeCategory === 'links' ? (
              <Button
                onClick={handleAddLink}
                disabled={!linkTitle.trim() || !linkUrl.trim() || !!isAddingLink}
              >
                {isAddingLink ? 'Wird hinzugefügt...' : 'Link hinzufügen'}
              </Button>
            ) : (
              <Button
                onClick={handleShare}
                disabled={totalSelectedCount === 0 || isSaving || isSharing}
              >
                {isSaving
                  ? 'Wird hinzugefügt...'
                  : totalSelectedCount > 0
                    ? `${totalSelectedCount} hinzufügen`
                    : 'Hinzufügen'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddContentToGroupModal;
