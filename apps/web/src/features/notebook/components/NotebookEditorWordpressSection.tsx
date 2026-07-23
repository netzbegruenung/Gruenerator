import { type WordpressSiteRef, type WpImportResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  Badge,
  Button,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionHeader,
  Skeleton,
} from '@gruenerator/ui';
import { useCallback, useMemo, useState } from 'react';
import { HiChevronDown, HiExclamation, HiGlobeAlt, HiPencil, HiRefresh, HiX } from 'react-icons/hi';

import { cn } from '../../../utils/cn';
import {
  useWordpressDiscovery,
  useWordpressDiscoveryPrefetch,
  wpErrorMessage,
  WP_ERROR_MESSAGES,
} from '../hooks/useWordpressDiscovery';

export interface ImportedWordpressDocument {
  id: string;
  title: string;
}

interface Props {
  sites: WordpressSiteRef[];
  onSitesChange: (next: WordpressSiteRef[]) => void;
  remainingSlots: number;
  /** Newly imported documents — parent appends to its list and starts indexing polling. */
  onDocsImported: (docs: ImportedWordpressDocument[]) => void;
  /** Documents deleted server-side (replaced or deselected) — parent drops them from its list. */
  onUploadedDocumentRemoved: (documentId: string) => void;
  disabled: boolean;
}

/** Which site the selection panel is open for, and whether it edits an existing one. */
interface DiscoveryTarget {
  url: string;
  editingSite: WordpressSiteRef | null;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Noch nicht synchronisiert';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(then)) return 'Noch nicht synchronisiert';
  if (diff < 60_000) return 'Synchronisiert vor wenigen Sekunden';
  if (diff < 3_600_000) return `Synchronisiert vor ${Math.round(diff / 60_000)} Min.`;
  if (diff < 86_400_000) return `Synchronisiert vor ${Math.round(diff / 3_600_000)} Std.`;
  return `Synchronisiert am ${new Date(iso).toLocaleDateString('de-DE')}`;
}

function selectionSummary(site: WordpressSiteRef): string {
  const parts: string[] = [];
  if (site.categories.length > 0) {
    parts.push(
      site.categories.length === 1
        ? site.categories[0].name
        : `${site.categories.length} Kategorien`
    );
  }
  if (site.allPosts) parts.push('Alle Beiträge');
  if (site.pages) {
    const picked = site.selectedPages?.length ?? 0;
    parts.push(picked > 0 ? `${picked} Seiten` : 'Alle Seiten');
  }
  return parts.join(' · ') || 'Keine Auswahl';
}

const ExperimentalBadge = (
  <Badge
    variant="outline"
    className="border-amber-300 bg-amber-50 text-[10px] uppercase text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
  >
    Experimentell
  </Badge>
);

const NotebookEditorWordpressSection = ({
  sites,
  onSitesChange,
  remainingSlots,
  onDocsImported,
  onUploadedDocumentRemoved,
  disabled,
}: Props) => {
  const [addOpen, setAddOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [target, setTarget] = useState<DiscoveryTarget | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(() => new Set());
  const [selAllPosts, setSelAllPosts] = useState(false);
  const [selPages, setSelPages] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<number>>(() => new Set());
  const [pagesOpen, setPagesOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncingUrl, setSyncingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const discoveryQuery = useWordpressDiscovery(target?.url ?? null);
  const prefetchDiscovery = useWordpressDiscoveryPrefetch();
  const discovery = discoveryQuery.data ?? null;

  const resetChecklist = useCallback(() => {
    setTarget(null);
    setSelectedCategoryIds(new Set());
    setSelAllPosts(false);
    setSelPages(false);
    setSelectedPageIds(new Set());
    setPagesOpen(false);
  }, []);

  /**
   * Seeds the selection from the stored ref synchronously, so the panel is
   * usable the moment it opens — the category and page lists stream in from
   * the (usually cached) discovery query.
   */
  const openPanel = useCallback((rawUrl: string, editingSite: WordpressSiteRef | null) => {
    setError(null);
    setNotice(null);
    setSelectedCategoryIds(new Set(editingSite?.categories.map((c) => c.id) ?? []));
    setSelAllPosts(editingSite?.allPosts ?? false);
    setSelPages(editingSite?.pages ?? false);
    setSelectedPageIds(new Set(editingSite?.selectedPages?.map((p) => p.id) ?? []));
    setPagesOpen(false);
    setTarget({ url: rawUrl, editingSite });
  }, []);

  /** Apply an import response to parent state and return the site's new documentIds. */
  const applyImportResult = useCallback(
    (body: WpImportResponse, previousDocIds: string[]): string[] => {
      const importedDocs = body.results.flatMap((r) =>
        r.documentId ? [{ id: r.documentId, title: r.title }] : []
      );

      const removedIds = new Set<string>(body.removed_document_ids);
      body.results.forEach((r) => {
        if (r.action === 'updated' && r.oldDocumentId) removedIds.add(r.oldDocumentId);
      });
      removedIds.forEach((id) => onUploadedDocumentRemoved(id));
      if (importedDocs.length > 0) onDocsImported(importedDocs);

      const kept = previousDocIds.filter((id) => !removedIds.has(id));
      return Array.from(new Set([...kept, ...importedDocs.map((d) => d.id)]));
    },
    [onDocsImported, onUploadedDocumentRemoved]
  );

  const buildSummary = useCallback((body: WpImportResponse): string | null => {
    const parts: string[] = [];
    if (body.created_count > 0) parts.push(`${body.created_count} neu`);
    if (body.updated_count > 0) parts.push(`${body.updated_count} aktualisiert`);
    if (body.removed_document_ids.length > 0)
      parts.push(`${body.removed_document_ids.length} entfernt`);
    if (body.skipped_count > 0) parts.push(`${body.skipped_count} übersprungen (Notebook voll)`);
    if (body.failed_count > 0) parts.push(`${body.failed_count} fehlgeschlagen`);
    return parts.length > 0 ? parts.join(', ') : null;
  }, []);

  const handleImport = useCallback(async () => {
    if (!discovery || !target) return;
    const selectedCategories = discovery.categories
      .filter((c) => selectedCategoryIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    if (selectedCategories.length === 0 && !selAllPosts && !selPages) {
      setError(WP_ERROR_MESSAGES.no_scopes);
      return;
    }
    const pickedPages = selPages ? discovery.pages.filter((p) => selectedPageIds.has(p.id)) : [];

    setImporting(true);
    setError(null);
    try {
      // A site added a second time (the server normalises "example.de" and
      // "https://example.de/" to the same URL) must reconfigure the existing
      // entry rather than append a twin that fights over the same documents.
      const editing =
        target.editingSite ?? sites.find((s) => s.siteUrl === discovery.site.url) ?? null;
      const result = await getContractsClient().notebookWordpress.importSite({
        body: {
          site_url: discovery.site.url,
          categories: selectedCategories,
          all_posts: selAllPosts,
          pages: selPages,
          page_ids: pickedPages.length > 0 ? pickedPages.map((p) => p.id) : null,
          modified_after: null,
          known_document_ids: editing?.documentIds ?? [],
          max_new_documents: Math.max(0, remainingSlots),
        },
      });
      if (result.status !== 200) {
        setError(wpErrorMessage(result.body));
        return;
      }

      const documentIds = applyImportResult(result.body, editing?.documentIds ?? []);
      const nextRef: WordpressSiteRef = {
        siteUrl: discovery.site.url,
        siteName: discovery.site.name,
        categories: selectedCategories,
        allPosts: selAllPosts,
        pages: selPages,
        selectedPages: pickedPages,
        documentIds,
        lastSyncedAt: new Date().toISOString(),
      };
      onSitesChange(
        editing
          ? sites.map((s) => (s.siteUrl === editing.siteUrl ? nextRef : s))
          : [...sites, nextRef]
      );
      setNotice(buildSummary(result.body));
      setAddOpen(false);
      setUrlInput('');
      resetChecklist();
    } catch {
      setError(WP_ERROR_MESSAGES.fetch_failed);
    } finally {
      setImporting(false);
    }
  }, [
    discovery,
    target,
    selectedCategoryIds,
    selAllPosts,
    selPages,
    selectedPageIds,
    remainingSlots,
    sites,
    onSitesChange,
    applyImportResult,
    buildSummary,
    resetChecklist,
  ]);

  const handleSync = useCallback(
    async (site: WordpressSiteRef) => {
      setSyncingUrl(site.siteUrl);
      setError(null);
      setNotice(null);
      try {
        const result = await getContractsClient().notebookWordpress.importSite({
          body: {
            site_url: site.siteUrl,
            categories: site.categories,
            all_posts: site.allPosts,
            pages: site.pages,
            page_ids: site.selectedPages?.length ? site.selectedPages.map((p) => p.id) : null,
            modified_after: site.lastSyncedAt ?? null,
            known_document_ids: site.documentIds,
            max_new_documents: Math.max(0, remainingSlots),
          },
        });
        if (result.status !== 200) {
          setError(wpErrorMessage(result.body));
          return;
        }
        const documentIds = applyImportResult(result.body, site.documentIds);
        onSitesChange(
          sites.map((s) =>
            s.siteUrl === site.siteUrl
              ? { ...s, documentIds, lastSyncedAt: new Date().toISOString() }
              : s
          )
        );
        setNotice(buildSummary(result.body) ?? 'Alles aktuell.');
      } catch {
        setError(WP_ERROR_MESSAGES.fetch_failed);
      } finally {
        setSyncingUrl(null);
      }
    },
    [sites, remainingSlots, onSitesChange, applyImportResult, buildSummary]
  );

  const handleRemove = useCallback(
    (site: WordpressSiteRef) => {
      onSitesChange(sites.filter((s) => s.siteUrl !== site.siteUrl));
    },
    [sites, onSitesChange]
  );

  const discovering = discoveryQuery.isFetching;
  const busy = discovering || importing || syncingUrl !== null;
  const showAddForm = (addOpen || sites.length === 0) && !target;
  const discoveryError = discoveryQuery.isError
    ? discoveryQuery.error instanceof Error
      ? discoveryQuery.error.message
      : WP_ERROR_MESSAGES.internal
    : null;

  const pageSelectionLabel = useMemo(() => {
    if (selectedPageIds.size === 0)
      return `Alle Seiten${discovery ? ` (${discovery.pages.length})` : ''}`;
    return selectedPageIds.size === 1
      ? (discovery?.pages.find((p) => selectedPageIds.has(p.id))?.title ?? '1 Seite')
      : `${selectedPageIds.size} Seiten ausgewählt`;
  }, [selectedPageIds, discovery]);

  const headerActions = (
    <div className="flex items-center gap-xs">
      {ExperimentalBadge}
      {sites.length > 0 && <span className="text-sm text-grey-500">{sites.length}</span>}
    </div>
  );

  return (
    <section>
      <SectionHeader
        title="WordPress-Website"
        onCreate={sites.length > 0 ? () => setAddOpen((v) => !v) : undefined}
        createLabel="Website hinzufügen"
        actions={headerActions}
      />

      {showAddForm && (
        <div className="mb-md flex flex-col gap-xs rounded-xl border border-dashed border-grey-300 bg-background p-md dark:border-grey-700">
          <p className="m-0 text-sm text-foreground">
            Beiträge einer WordPress-Website als Quelle importieren.
          </p>
          <div className="flex items-center gap-xs">
            <Input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://gruene-beispielstadt.de"
              disabled={disabled || busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (urlInput.trim()) openPanel(urlInput.trim(), null);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={disabled || busy || !urlInput.trim()}
              onClick={() => openPanel(urlInput.trim(), null)}
            >
              {discovering ? (
                <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
              ) : null}
              Verbinden
            </Button>
          </div>
        </div>
      )}

      {target && (
        <div className="mb-md flex flex-col gap-sm rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
          <div className="flex items-center justify-between gap-xs">
            <div className="flex min-w-0 items-center gap-xs">
              <HiGlobeAlt
                size={16}
                className="shrink-0 text-secondary-600 dark:text-secondary-400"
                aria-hidden
              />
              <span className="truncate text-sm font-medium text-foreground">
                {discovery?.site.name ?? target.editingSite?.siteName ?? target.url}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={resetChecklist}
              aria-label="Auswahl abbrechen"
            >
              <HiX size={12} />
            </Button>
          </div>
          <p className="m-0 text-xs text-grey-500">
            Was soll importiert werden? Es werden jeweils die neuesten 50 Beiträge übernommen.
          </p>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            <label className="flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs hover:bg-background-alt">
              <Checkbox checked={selAllPosts} onCheckedChange={(v) => setSelAllPosts(v === true)} />
              <span className="text-sm text-foreground">Alle Beiträge</span>
              <span className="ml-auto text-xs text-grey-500">{discovery?.total_posts ?? '—'}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs hover:bg-background-alt">
              <Checkbox checked={selPages} onCheckedChange={(v) => setSelPages(v === true)} />
              <span className="text-sm text-foreground">Seiten</span>
              <span className="ml-auto text-xs text-grey-500">{discovery?.total_pages ?? '—'}</span>
            </label>

            {selPages && (
              <div className="px-sm pb-xs pl-[2.1rem]">
                <Popover open={pagesOpen} onOpenChange={setPagesOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-between font-normal"
                      disabled={!discovery || discovery.pages.length === 0}
                      aria-label="Seiten auswählen"
                    >
                      <span className="truncate">
                        {discovery ? pageSelectionLabel : 'Seiten werden geladen…'}
                      </span>
                      <HiChevronDown size={12} className="ml-xs shrink-0 opacity-60" aria-hidden />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(20rem,80vw)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Seite suchen…" />
                      <CommandList>
                        <CommandEmpty>Keine Seite gefunden.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="__alle-seiten"
                            onSelect={() => setSelectedPageIds(new Set())}
                          >
                            <Checkbox checked={selectedPageIds.size === 0} className="mr-sm" />
                            <span className="text-sm">Alle Seiten</span>
                          </CommandItem>
                          {(discovery?.pages ?? []).map((page) => (
                            <CommandItem
                              key={page.id}
                              value={`${page.title} ${page.id}`}
                              onSelect={() => {
                                setSelectedPageIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(page.id)) next.delete(page.id);
                                  else next.add(page.id);
                                  return next;
                                });
                              }}
                            >
                              <Checkbox
                                checked={selectedPageIds.has(page.id)}
                                className="mr-sm shrink-0"
                              />
                              <span className="truncate text-sm">{page.title}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {discoveryQuery.isPending && (
              <div className="flex flex-col gap-1 px-sm pt-xs">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-6 w-full rounded-md" />
                ))}
              </div>
            )}
            {discovery && discovery.categories.length > 0 && (
              <p className="m-0 px-sm pb-1 pt-xs text-xs uppercase tracking-wide text-grey-500">
                Kategorien
              </p>
            )}
            {(discovery?.categories ?? []).map((cat) => (
              <label
                key={cat.id}
                className={cn(
                  'flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs hover:bg-background-alt',
                  selAllPosts && 'opacity-50'
                )}
              >
                <Checkbox
                  checked={selectedCategoryIds.has(cat.id)}
                  disabled={selAllPosts}
                  onCheckedChange={(v) => {
                    setSelectedCategoryIds((prev) => {
                      const next = new Set(prev);
                      if (v === true) next.add(cat.id);
                      else next.delete(cat.id);
                      return next;
                    });
                  }}
                />
                <span className="truncate text-sm text-foreground">{cat.name}</span>
                <span className="ml-auto shrink-0 text-xs text-grey-500">{cat.count}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-end gap-xs">
            <Button type="button" variant="ghost" size="sm" onClick={resetChecklist}>
              Abbrechen
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                disabled ||
                importing ||
                !discovery ||
                (selectedCategoryIds.size === 0 && !selAllPosts && !selPages)
              }
              onClick={() => void handleImport()}
            >
              {importing ? (
                <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
              ) : null}
              {importing ? 'Wird importiert…' : 'Importieren'}
            </Button>
          </div>
        </div>
      )}

      {sites.length > 0 && (
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {sites.map((site) => {
            const isSyncing = syncingUrl === site.siteUrl;
            return (
              <div
                key={site.siteUrl}
                className={cn(
                  'group relative flex min-h-[112px] min-w-0 flex-col gap-xs overflow-hidden rounded-xl border border-grey-200 bg-background p-md transition-all duration-200 dark:border-grey-800',
                  isSyncing ? 'opacity-90' : 'hover:shadow-sm'
                )}
                aria-label={`WordPress-Website: ${site.siteName}`}
              >
                <div
                  className="pointer-events-none absolute right-0 top-0 h-[3px] w-12 rounded-bl-md bg-secondary-400 dark:bg-secondary-700"
                  aria-hidden
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    'absolute right-1 top-1 transition-opacity',
                    isSyncing
                      ? 'opacity-60'
                      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                  )}
                  disabled={disabled || isSyncing}
                  onClick={() => handleRemove(site)}
                  title="Bereits importierte Dokumente bleiben im Notebook."
                  aria-label={`${site.siteName} entfernen`}
                >
                  <HiX size={12} />
                </Button>
                <div className="flex items-start gap-xs pr-6">
                  <HiGlobeAlt
                    size={14}
                    className="mt-[2px] shrink-0 text-secondary-600 dark:text-secondary-400"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div
                      className="line-clamp-1 break-words text-sm font-medium leading-snug text-foreground"
                      title={site.siteName}
                    >
                      {site.siteName}
                    </div>
                    <div
                      className="line-clamp-1 text-xs text-grey-500"
                      title={selectionSummary(site)}
                    >
                      {selectionSummary(site)} · {site.documentIds.length} Dok.
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-xs">
                  <span className="truncate text-xs text-grey-500">
                    {isSyncing ? 'Wird synchronisiert…' : formatRelative(site.lastSyncedAt)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={disabled || busy}
                      onClick={() => openPanel(site.siteUrl, site)}
                      onMouseEnter={() => prefetchDiscovery(site.siteUrl)}
                      onFocus={() => prefetchDiscovery(site.siteUrl)}
                      title="Auswahl ändern"
                      aria-label={`Auswahl für ${site.siteName} ändern`}
                    >
                      <HiPencil size={12} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || busy}
                      onClick={() => void handleSync(site)}
                      aria-label={`${site.siteName} synchronisieren`}
                    >
                      {isSyncing ? (
                        <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                      ) : (
                        <HiRefresh size={12} />
                      )}
                      Sync
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notice && (
        <div className="mt-md rounded-md bg-secondary-50 px-sm py-xs text-xs text-secondary-800 dark:bg-secondary-950/30 dark:text-secondary-200">
          {notice}
        </div>
      )}
      {(error || discoveryError) && (
        <div className="mt-md flex items-start gap-xs rounded-md bg-amber-50 px-sm py-xs text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <HiExclamation size={14} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error ?? discoveryError}</span>
        </div>
      )}
    </section>
  );
};

export default NotebookEditorWordpressSection;
