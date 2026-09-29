import { type WordpressSiteRef, type WpImportResponse } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  Button,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { HiChevronDown, HiExclamation } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';
import {
  useWordpressDiscovery,
  wpErrorMessage,
  WP_ERROR_MESSAGES,
} from '../../hooks/useWordpressDiscovery';

export interface WordpressImportOutcome {
  ref: WordpressSiteRef;
  added: string[];
  removed: string[];
  summary: string;
}

export function summarizeImport(body: WpImportResponse): string {
  const parts: string[] = [];
  if (body.created_count > 0) parts.push(`${body.created_count} neu`);
  if (body.updated_count > 0) parts.push(`${body.updated_count} aktualisiert`);
  if (body.removed_document_ids.length > 0)
    parts.push(`${body.removed_document_ids.length} entfernt`);
  if (body.skipped_count > 0) parts.push(`${body.skipped_count} übersprungen (Notebook voll)`);
  if (body.failed_count > 0) parts.push(`${body.failed_count} fehlgeschlagen`);
  return parts.join(', ') || 'Alles aktuell.';
}

/** Was eine Import-Antwort am Dokumentbestand der Website ändert. */
export function applyImport(
  body: WpImportResponse,
  previous: string[]
): { documentIds: string[]; added: string[]; removed: string[] } {
  const added = body.results.flatMap((r) => (r.documentId ? [r.documentId] : []));
  const removed = new Set<string>(body.removed_document_ids);
  body.results.forEach((r) => {
    if (r.action === 'updated' && r.oldDocumentId) removed.add(r.oldDocumentId);
  });
  const kept = previous.filter((id) => !removed.has(id));
  return {
    documentIds: [...new Set([...kept, ...added])],
    added,
    removed: [...removed],
  };
}

interface WordpressSelectionProps {
  websiteId: string;
  siteUrl: string;
  /** Der gespeicherte Eintrag, wenn die Auswahl geändert wird; sonst `null`. */
  editing: WordpressSiteRef | null;
  room: number;
  onCancel: () => void;
  onImported: (outcome: WordpressImportOutcome) => Promise<void>;
}

/**
 * Was von einer Website übernommen wird: alle Beiträge, einzelne Kategorien
 * und/oder Seiten. Die Kategorien und Seiten kommen aus der (gecachten)
 * Discovery; die Auswahl ist sofort aus dem gespeicherten Eintrag vorbelegt.
 */
export function WordpressSelection({
  websiteId,
  siteUrl,
  editing,
  room,
  onCancel,
  onImported,
}: WordpressSelectionProps) {
  const discoveryQuery = useWordpressDiscovery(siteUrl);
  const discovery = discoveryQuery.data ?? null;
  const [categoryIds, setCategoryIds] = useState<Set<number>>(
    () => new Set(editing?.categories.map((c) => c.id) ?? [])
  );
  const [allPosts, setAllPosts] = useState(editing?.allPosts ?? !editing);
  const [pages, setPages] = useState(editing?.pages ?? false);
  const [pageIds, setPageIds] = useState<Set<number>>(
    () => new Set(editing?.selectedPages?.map((p) => p.id) ?? [])
  );
  const [pagesOpen, setPagesOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageLabel = useMemo(() => {
    if (pageIds.size === 0) return `Alle Seiten${discovery ? ` (${discovery.pages.length})` : ''}`;
    return pageIds.size === 1
      ? (discovery?.pages.find((p) => pageIds.has(p.id))?.title ?? '1 Seite')
      : `${pageIds.size} Seiten ausgewählt`;
  }, [pageIds, discovery]);

  const nothingChosen = categoryIds.size === 0 && !allPosts && !pages;

  const runImport = async () => {
    if (!discovery) return;
    if (nothingChosen) {
      setError(WP_ERROR_MESSAGES.no_scopes);
      return;
    }
    const categories = discovery.categories
      .filter((c) => categoryIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    const pickedPages = pages ? discovery.pages.filter((p) => pageIds.has(p.id)) : [];
    setImporting(true);
    setError(null);
    try {
      const result = await getContractsClient().notebookWordpress.importSite({
        body: {
          site_url: discovery.site.url,
          categories,
          all_posts: allPosts,
          pages,
          page_ids: pickedPages.length > 0 ? pickedPages.map((p) => p.id) : null,
          modified_after: null,
          known_document_ids: editing?.documentIds ?? [],
          max_new_documents: room,
        },
      });
      if (result.status !== 200) {
        setError(wpErrorMessage(result.body));
        return;
      }
      const { documentIds, added, removed } = applyImport(result.body, editing?.documentIds ?? []);
      await onImported({
        ref: {
          websiteId,
          categories,
          allPosts,
          pages,
          selectedPages: pickedPages,
          documentIds,
          lastSyncedAt: new Date().toISOString(),
        },
        added,
        removed,
        summary: summarizeImport(result.body),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : WP_ERROR_MESSAGES.fetch_failed);
    } finally {
      setImporting(false);
    }
  };

  const discoveryError = discoveryQuery.isError
    ? discoveryQuery.error instanceof Error
      ? discoveryQuery.error.message
      : WP_ERROR_MESSAGES.internal
    : null;

  return (
    <div className="flex flex-col gap-sm">
      <p className="m-0 text-sm text-grey-500">
        Was soll importiert werden? Es werden jeweils die neuesten 50 Beiträge übernommen.
      </p>
      <div className="flex flex-col gap-1">
        <label className="flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs hover:bg-background-alt">
          <Checkbox checked={allPosts} onCheckedChange={(v) => setAllPosts(v === true)} />
          <span className="text-sm">Alle Beiträge</span>
          <span className="ml-auto text-xs text-grey-500">{discovery?.total_posts ?? '—'}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs hover:bg-background-alt">
          <Checkbox checked={pages} onCheckedChange={(v) => setPages(v === true)} />
          <span className="text-sm">Seiten</span>
          <span className="ml-auto text-xs text-grey-500">{discovery?.total_pages ?? '—'}</span>
        </label>

        {pages ? (
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
                    {discovery ? pageLabel : 'Seiten werden geladen…'}
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
                      <CommandItem value="__alle-seiten" onSelect={() => setPageIds(new Set())}>
                        <Checkbox checked={pageIds.size === 0} className="mr-sm" />
                        <span className="text-sm">Alle Seiten</span>
                      </CommandItem>
                      {(discovery?.pages ?? []).map((page) => (
                        <CommandItem
                          key={page.id}
                          value={`${page.title} ${page.id}`}
                          onSelect={() =>
                            setPageIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(page.id)) next.delete(page.id);
                              else next.add(page.id);
                              return next;
                            })
                          }
                        >
                          <Checkbox checked={pageIds.has(page.id)} className="mr-sm shrink-0" />
                          <span className="truncate text-sm">{page.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}

        {discoveryQuery.isPending ? (
          <div className="flex flex-col gap-1 px-sm pt-xs">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-6 w-full rounded-md" />
            ))}
          </div>
        ) : null}
        {discovery && discovery.categories.length > 0 ? (
          <p className="m-0 px-sm pt-xs pb-1 text-xs tracking-wide text-grey-500 uppercase">
            Kategorien
          </p>
        ) : null}
        {(discovery?.categories ?? []).map((cat) => (
          <label
            key={cat.id}
            className={cn(
              'flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs hover:bg-background-alt',
              allPosts && 'opacity-50'
            )}
          >
            <Checkbox
              checked={categoryIds.has(cat.id)}
              disabled={allPosts}
              onCheckedChange={(v) =>
                setCategoryIds((prev) => {
                  const next = new Set(prev);
                  if (v === true) next.add(cat.id);
                  else next.delete(cat.id);
                  return next;
                })
              }
            />
            <span className="truncate text-sm">{cat.name}</span>
            <span className="ml-auto shrink-0 text-xs text-grey-500">{cat.count}</span>
          </label>
        ))}
      </div>

      {error || discoveryError ? (
        <div
          role="alert"
          className="flex items-start gap-xs rounded-md bg-amber-50 px-sm py-xs text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <HiExclamation size={14} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error ?? discoveryError}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-xs">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={importing}>
          Abbrechen
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={importing || !discovery || nothingChosen}
          onClick={() => void runImport()}
        >
          {importing ? 'Wird importiert…' : 'Importieren'}
        </Button>
      </div>
    </div>
  );
}
