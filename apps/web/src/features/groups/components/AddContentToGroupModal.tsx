import { GROUP_SHARE_NOTE_MAX, type GroupContentType } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { type AddableItem, addItemsToGroup, addableKey } from '@gruenerator/shared/groups';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
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
  Textarea,
} from '@gruenerator/ui';
import { useQueries } from '@tanstack/react-query';
import { ChevronLeft, XIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { FiGrid, FiMonitor } from 'react-icons/fi';
import { HiDocumentText, HiLink } from 'react-icons/hi';
import { PiNotebook, PiRobot, PiSquaresFour } from 'react-icons/pi';

import { ICONS } from '../../../config/icons';
import { profileApiService } from '../../auth/services/profileApiService';
import { subtypeToKind } from '../../docs/docTypeMeta';
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
  document_subtype?: string;
  /** Besitz: Docs/Boards tragen `created_by`, Notebooks `user_id`. */
  created_by?: string;
  user_id?: string;
  updated_at?: string | null;
}

// Office collaborative_documents share one 'collaborative_documents' content_type
// and the same listDocuments query, but read as distinct picker categories
// (matching the workplace "Zuletzt" vocabulary). `subtypeToKind` is the single
// source for that subtype→category mapping (incl. legacy 'tabelle' → sheet).

interface ContentCategory {
  id: CategoryId;
  label: string;
  icon: IconType;
  contentType: string;
}

export type CategoryId =
  | 'agents'
  | 'recipes'
  | 'collabDocs'
  | 'sheets'
  | 'presentations'
  | 'boards'
  | 'documents'
  | 'notebooks'
  | 'links';

interface ContentState {
  agents: ContentItem[];
  recipes: ContentItem[];
  collabDocs: ContentItem[];
  sheets: ContentItem[];
  presentations: ContentItem[];
  boards: ContentItem[];
  documents: ContentItem[];
  notebooks: ContentItem[];
}

interface SelectedItemsState {
  [key: string]: (string | number)[];
}

interface AddContentToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  /** `addableKey` aller Inhalte, die schon im Projekt liegen (`sharedContentKeys(feed)`). */
  sharedKeys: ReadonlySet<string>;
  /** Der Server teilt nur Eigenes; fremde Docs, Boards und Notebooks gar nicht erst anbieten. */
  currentUserId: string | null;
  /** Mindestens ein Inhalt kam an. Schlug nichts fehl, schließt der Dialog danach selbst. */
  onAdded?: (count: number) => void;
  onAddLink?: (link: Omit<GroupLink, 'id'>) => void;
  isAddingLink?: boolean;
  /** Vorbelegung der Notiz, z. B. der Text aus dem Feed-Composer. */
  initialNote?: string;
  /** Opens straight in this category (the „Hinzufügen" menu). */
  initialCategory?: CategoryId;
}

const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    id: 'agents',
    label: 'Agents',
    icon: PiRobot as IconType,
    contentType: 'user_agents',
  },
  {
    id: 'recipes',
    label: 'Rezepte',
    icon: PiNotebook as IconType,
    contentType: 'user_text_forms',
  },
  { id: 'collabDocs', label: 'Docs', icon: HiDocumentText, contentType: 'collaborative_documents' },
  {
    id: 'sheets',
    label: 'Sheets',
    icon: FiGrid as IconType,
    contentType: 'collaborative_documents',
  },
  {
    id: 'presentations',
    label: 'Präsentationen',
    icon: FiMonitor as IconType,
    contentType: 'collaborative_documents',
  },
  {
    id: 'boards',
    label: 'Boards',
    icon: PiSquaresFour as IconType,
    contentType: 'collaborative_documents',
  },
  { id: 'documents', label: 'Dokumente', icon: HiDocumentText, contentType: 'documents' },
  {
    id: 'notebooks',
    label: 'Notebooks',
    icon: ICONS.actions.notebook as IconType,
    contentType: 'notebook_collections',
  },
];

const SYSTEM_NOTEBOOK_PREFIX = 'system:';

/** Was der Server für eine Kachel bekommt: System-Notebooks sind ein eigener Typ mit nackter Id. */
function toAddable(category: ContentCategory, item: ContentItem): AddableItem {
  const id = String(item.id);
  const title = item.title || item.name || 'Ohne Titel';
  if (category.id === 'notebooks' && id.startsWith(SYSTEM_NOTEBOOK_PREFIX)) {
    return { contentType: 'system_notebooks', id: id.slice(SYSTEM_NOTEBOOK_PREFIX.length), title };
  }
  return { contentType: category.contentType as GroupContentType, id, title };
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatUpdated(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

const AddContentToGroupModal: React.FC<AddContentToGroupModalProps> = ({
  isOpen,
  onClose,
  groupId,
  sharedKeys,
  currentUserId,
  onAdded,
  onAddLink,
  isAddingLink,
  initialNote,
  initialCategory,
}) => {
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItemsState>({});
  const [isSaving, setIsSaving] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [contentPage, setContentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState('');
  const [note, setNote] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkIcon, setLinkIcon] = useState('globe');
  const [linkIconManual, setLinkIconManual] = useState(false);
  const [linkTitleManual, setLinkTitleManual] = useState(false);
  const [linkUrlError, setLinkUrlError] = useState<string | null>(null);

  // Reset all modal state when the parent closes it. Done during render via a
  // previous-value guard (React's documented "reset state when a prop changes"
  // pattern) rather than an effect — no setState-in-effect, and the reset lands
  // before the next paint instead of one frame later.
  // Starts at `false`, so a dialog mounted already open still takes its initial category and note.
  const [wasOpen, setWasOpen] = useState(false);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setNote((initialNote ?? '').slice(0, GROUP_SHARE_NOTE_MAX));
      setActiveCategory(initialCategory ?? null);
    } else {
      setSelectedItems({});
      setShareError(null);
      setActiveCategory(null);
      setContentPage(1);
      setSearchQuery('');
      setNote('');
      setLinkTitle('');
      setLinkUrl('');
      setLinkDescription('');
      setLinkIcon('globe');
      setLinkIconManual(false);
      setLinkTitleManual(false);
      setLinkUrlError(null);
    }
  }

  const contentQueries = useQueries({
    queries: [
      {
        // Nur eigene Agents: `list` liefert keine fremden, und `id` ist der Teilen-Schlüssel.
        queryKey: ['add-to-group', 'agents'],
        queryFn: async (): Promise<ContentItem[]> => {
          const result = await getContractsClient().userAgents.list();
          if (result.status !== 200) return [];
          return result.body.agents.flatMap((a) => (a.id ? [{ id: a.id, title: a.title }] : []));
        },
        enabled: isOpen,
      },
      {
        // Ohne Projekt-Geteiltes und ohne angepasste System-Rezepte — die darf man nicht teilen.
        queryKey: ['add-to-group', 'recipes'],
        queryFn: async (): Promise<ContentItem[]> => {
          const result = await getContractsClient().userTextForms.list();
          if (result.status !== 200) return [];
          return result.body.forms
            .filter((f) => f.kind === 'custom' && f.sharedFromGroup === null)
            .map((f) => ({ id: f.id, title: f.title }));
        },
        enabled: isOpen,
      },
      {
        queryKey: ['add-to-group', 'collabDocs'],
        queryFn: async (): Promise<ContentItem[]> => {
          const result = await getContractsClient().docs.listDocuments({ query: {} });
          return result.status === 200 ? result.body : [];
        },
        enabled: isOpen,
      },
      {
        queryKey: ['add-to-group', 'boards'],
        queryFn: async (): Promise<ContentItem[]> => {
          const result = await getContractsClient().boards.listBoards();
          if (result.status !== 200) return [];
          return result.body.map((b) => ({ ...b, description: b.description ?? undefined }));
        },
        enabled: isOpen,
      },
      {
        queryKey: ['add-to-group', 'documents'],
        queryFn: () => profileApiService.getAvailableDocuments(),
        enabled: isOpen,
      },
      {
        queryKey: ['add-to-group', 'notebooks'],
        queryFn: () => profileApiService.getNotebookCollections(),
        enabled: isOpen,
      },
    ],
  });

  const isLoading = contentQueries.some((q) => q.isLoading);

  const content = useMemo<ContentState>(() => {
    const [agents, recipes, allCollabDocs, boards, docs, notebooks] = contentQueries.map(
      (q) => (q.data as ContentItem[] | undefined) ?? []
    );
    const systemNotebookItems: ContentItem[] = SYSTEM_NOTEBOOKS.map((nb) => ({
      id: `system:${nb.id}`,
      title: nb.title,
    }));
    // One listDocuments query backs three doc categories; split by subtype so
    // office items read as Sheets/Präsentationen instead of being lumped into Docs.
    const kindOf = (item: ContentItem) => subtypeToKind(item.document_subtype);
    // Die Listen enthalten auch, was andere mit mir geteilt haben; teilen darf ich nur Eigenes.
    const own = (owner: string | undefined) => !currentUserId || owner === currentUserId;
    const ownCollabDocs = allCollabDocs.filter((d) => own(d.created_by));
    return {
      agents,
      recipes,
      collabDocs: ownCollabDocs.filter((d) => kindOf(d) === 'doc'),
      sheets: ownCollabDocs.filter((d) => kindOf(d) === 'sheet'),
      presentations: ownCollabDocs.filter((d) => kindOf(d) === 'pres'),
      boards: boards.filter((b) => own(b.created_by)),
      documents: docs,
      notebooks: [...notebooks.filter((n) => own(n.user_id)), ...systemNotebookItems],
    };
  }, [contentQueries, currentUserId]);

  const isShared = useCallback(
    (category: ContentCategory, item: ContentItem) =>
      sharedKeys.has(addableKey(toAddable(category, item))),
    [sharedKeys]
  );

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
    onClose();
  }, [linkTitle, linkUrl, linkDescription, linkIcon, onAddLink, onClose]);

  // Was gesendet wird: ausgewählt und noch nicht im Projekt. Kam beim letzten
  // Versuch etwas an, steht es nach dem Nachladen in `sharedKeys` und fällt
  // hier heraus — ein zweiter Klick schickt nur noch, was gescheitert war.
  const pendingItems = useMemo<AddableItem[]>(
    () =>
      CONTENT_CATEGORIES.flatMap((cat) => {
        const ids = new Set((selectedItems[cat.id] || []).map(String));
        if (ids.size === 0) return [];
        return (content[cat.id as keyof ContentState] || [])
          .filter((item) => ids.has(String(item.id)) && !isShared(cat, item))
          .map((item) => toAddable(cat, item));
      }),
    [selectedItems, content, isShared]
  );
  const totalSelectedCount = pendingItems.length;

  const handleShare = useCallback(async () => {
    if (pendingItems.length === 0) return;
    setIsSaving(true);
    setShareError(null);
    try {
      const result = await addItemsToGroup(groupId, pendingItems, note);
      if (result.added > 0) onAdded?.(result.added);
      if (result.failed === 0) {
        onClose();
        return;
      }
      const reason = result.firstError ?? 'Unbekannter Fehler.';
      setShareError(
        result.failed === 1
          ? `Ein Inhalt wurde nicht hinzugefügt: ${reason}`
          : `${result.failed} Inhalte wurden nicht hinzugefügt: ${reason}`
      );
    } finally {
      setIsSaving(false);
    }
  }, [pendingItems, groupId, note, onAdded, onClose]);

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

  const allCategoryItems: ContentItem[] = useMemo(
    () =>
      activeCategory && activeCategory !== 'links'
        ? content[activeCategory as keyof ContentState] || []
        : [],
    [activeCategory, content]
  );

  const currentItems = useMemo(() => {
    if (!searchQuery.trim()) return allCategoryItems;
    const q = searchQuery.toLowerCase();
    return allCategoryItems.filter((item) => {
      const title = (item.title || item.name || '').toLowerCase();
      return title.includes(q);
    });
  }, [allCategoryItems, searchQuery]);

  const GRID_COLS = 4;
  const GRID_ROW_HEIGHT = 92;
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
          {/* DialogTitle (not a bare h2) so Radix wires aria-labelledby and the
              dialog has an accessible name. */}
          <DialogTitle className="text-lg font-semibold text-foreground-heading m-0 shrink-0">
            {activeCategory === 'links'
              ? 'Link hinzufügen'
              : activeCategory
                ? activeCategoryData?.label
                : 'Inhalte hinzufügen'}
          </DialogTitle>
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
            {['a', 'b', 'c', 'd'].map((k) => (
              <div key={`skeleton-${k}`} className="flex items-center gap-md">
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
                cat.id !== 'links'
                  ? (content[cat.id as keyof ContentState] || []).filter(
                      (item) => !isShared(cat, item)
                    ).length
                  : 0;
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
                    {cat.id !== 'links' && (
                      <span className="text-xs text-grey-500">
                        {count > 0 ? `${count} verfügbar` : 'Alles schon im Projekt'}
                      </span>
                    )}
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
              <label htmlFor="add-content-link-url" className="text-sm font-medium text-foreground">
                URL
              </label>
              <div className="flex items-center gap-xs">
                <Input
                  id="add-content-link-url"
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
                  <label
                    htmlFor="add-content-link-title"
                    className="text-sm font-medium text-foreground"
                  >
                    Titel
                  </label>
                  <Input
                    id="add-content-link-title"
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
                  <label
                    htmlFor="add-content-link-description"
                    className="text-sm font-medium text-foreground"
                  >
                    Beschreibung (optional)
                  </label>
                  <Input
                    id="add-content-link-description"
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
            {paginatedItems.length === 0 && (
              <p className="col-span-4 m-0 text-sm text-muted-foreground">
                Hier gibt es noch nichts, was du hinzufügen kannst.
              </p>
            )}
            {paginatedItems.map((item: ContentItem) => {
              const shared = activeCategoryData ? isShared(activeCategoryData, item) : false;
              const isSelected =
                !shared && currentSelections.some((sel) => String(sel) === String(item.id));
              const title = item.title || item.name || 'Ohne Titel';
              const Icon = activeCategoryData?.icon ?? HiDocumentText;
              const updated = formatUpdated(item.updated_at);

              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={shared}
                  aria-pressed={isSelected}
                  onClick={() => handleToggleItem(activeCategory, item.id)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-xxs rounded-md border-2 p-xs transition-all duration-150 bg-transparent',
                    shared
                      ? 'cursor-default border-dashed border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-900'
                      : isSelected
                        ? 'cursor-pointer border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                        : 'cursor-pointer border-grey-200 dark:border-grey-700 hover:border-grey-300 dark:hover:border-grey-600 hover:shadow-sm'
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
                  {(shared || updated) && (
                    <span className="text-[0.6rem] text-grey-600 dark:text-grey-400 leading-tight">
                      {shared ? 'Schon im Projekt' : updated}
                    </span>
                  )}
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

        {/* `sm:flex-col`: die Fußzeile von shadcn wird ab `sm` zur Zeile — die Notiz
            stand dann neben den Knöpfen und schrumpfte auf eine Zeichenbreite. */}
        <DialogFooter className="pt-md border-t border-grey-200 dark:border-grey-700 flex-col sm:flex-col sm:justify-start gap-sm">
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
          {activeCategory !== 'links' && (
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Notiz für die Gruppe (optional) – wofür ist das gedacht?"
              aria-label="Notiz für die Gruppe"
              maxLength={GROUP_SHARE_NOTE_MAX}
              rows={2}
              className="w-full resize-none"
            />
          )}
          {shareError && (
            <p role="alert" className="m-0 w-full text-sm text-red-600 dark:text-red-400">
              {shareError}
            </p>
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
              <Button onClick={handleShare} disabled={totalSelectedCount === 0 || isSaving}>
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
