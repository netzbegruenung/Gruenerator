import {
  type WordpressSiteRef,
  type WpDiscoverResponse,
  type WpImportResponse,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Badge, Button, Checkbox, Input, SectionHeader } from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { HiExclamation, HiGlobeAlt, HiPencil, HiRefresh, HiX } from 'react-icons/hi';

import { cn } from '../../../utils/cn';

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

interface DiscoveryState {
  site: WpDiscoverResponse['site'];
  categories: WpDiscoverResponse['categories'];
  totalPosts: number;
  totalPages: number;
  /** Set when re-configuring an already-attached site ("Auswahl ändern"). */
  editingSite: WordpressSiteRef | null;
}

const WP_ERROR_MESSAGES: Record<string, string> = {
  invalid_url: 'Bitte gib eine gültige Website-Adresse ein.',
  not_wordpress:
    'Unter dieser Adresse ist keine WordPress-REST-API erreichbar. Ist es eine WordPress-Website?',
  rest_disabled:
    'Die WordPress-REST-API dieser Website ist deaktiviert oder geschützt. Viele Websites schalten sie aus Sicherheitsgründen ab.',
  fetch_failed: 'Die Website ist nicht erreichbar. Prüfe die Adresse und versuche es erneut.',
  internal: 'Import fehlgeschlagen. Bitte versuche es später erneut.',
};

function wpErrorMessage(body: unknown): string {
  if (body && typeof body === 'object') {
    const code = (body as { code?: string }).code;
    if (code && WP_ERROR_MESSAGES[code]) return WP_ERROR_MESSAGES[code];
    const error = (body as { error?: string }).error;
    if (typeof error === 'string' && error) return error;
  }
  return WP_ERROR_MESSAGES.internal;
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
  if (site.pages) parts.push('Seiten');
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
  const [discovering, setDiscovering] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryState | null>(null);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(() => new Set());
  const [selAllPosts, setSelAllPosts] = useState(false);
  const [selPages, setSelPages] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncingUrl, setSyncingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const resetChecklist = useCallback(() => {
    setDiscovery(null);
    setSelectedCategoryIds(new Set());
    setSelAllPosts(false);
    setSelPages(false);
  }, []);

  const handleDiscover = useCallback(
    async (rawUrl: string, editingSite: WordpressSiteRef | null) => {
      setDiscovering(true);
      setError(null);
      setNotice(null);
      try {
        const result = await getContractsClient().notebookWordpress.discoverSite({
          body: { site_url: rawUrl },
        });
        if (result.status !== 200) {
          setError(wpErrorMessage(result.body));
          return;
        }
        setDiscovery({
          site: result.body.site,
          categories: result.body.categories,
          totalPosts: result.body.total_posts,
          totalPages: result.body.total_pages,
          editingSite,
        });
        setSelectedCategoryIds(new Set(editingSite?.categories.map((c) => c.id) ?? []));
        setSelAllPosts(editingSite?.allPosts ?? false);
        setSelPages(editingSite?.pages ?? false);
      } catch {
        setError(WP_ERROR_MESSAGES.fetch_failed);
      } finally {
        setDiscovering(false);
      }
    },
    []
  );

  /** Apply an import response to parent state and return the site's new documentIds. */
  const applyImportResult = useCallback(
    (body: WpImportResponse, previousDocIds: string[]): string[] => {
      const importedDocs = body.results
        .filter((r) => r.documentId)
        .map((r) => ({ id: r.documentId as string, title: r.title }));

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
    if (!discovery) return;
    const selectedCategories = discovery.categories
      .filter((c) => selectedCategoryIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name }));
    if (selectedCategories.length === 0 && !selAllPosts && !selPages) {
      setError('Wähle mindestens eine Kategorie aus.');
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const editing = discovery.editingSite;
      const result = await getContractsClient().notebookWordpress.importSite({
        body: {
          site_url: discovery.site.url,
          categories: selectedCategories,
          all_posts: selAllPosts,
          pages: selPages,
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
    selectedCategoryIds,
    selAllPosts,
    selPages,
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

  const busy = discovering || importing || syncingUrl !== null;
  const showAddForm = (addOpen || sites.length === 0) && !discovery;

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
                  if (urlInput.trim()) void handleDiscover(urlInput.trim(), null);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={disabled || busy || !urlInput.trim()}
              onClick={() => void handleDiscover(urlInput.trim(), null)}
            >
              {discovering ? (
                <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
              ) : null}
              Verbinden
            </Button>
          </div>
        </div>
      )}

      {discovery && (
        <div className="mb-md flex flex-col gap-sm rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
          <div className="flex items-center justify-between gap-xs">
            <div className="flex min-w-0 items-center gap-xs">
              <HiGlobeAlt
                size={16}
                className="shrink-0 text-secondary-600 dark:text-secondary-400"
                aria-hidden
              />
              <span className="truncate text-sm font-medium text-foreground">
                {discovery.site.name}
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
              <span className="ml-auto text-xs text-grey-500">{discovery.totalPosts}</span>
            </label>
            <label className="flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs hover:bg-background-alt">
              <Checkbox checked={selPages} onCheckedChange={(v) => setSelPages(v === true)} />
              <span className="text-sm text-foreground">Seiten</span>
              <span className="ml-auto text-xs text-grey-500">{discovery.totalPages}</span>
            </label>
            {discovery.categories.length > 0 && (
              <p className="m-0 px-sm pb-1 pt-xs text-xs uppercase tracking-wide text-grey-500">
                Kategorien
              </p>
            )}
            {discovery.categories.map((cat) => (
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
                      onClick={() => void handleDiscover(site.siteUrl, site)}
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
      {error && (
        <div className="mt-md flex items-start gap-xs rounded-md bg-amber-50 px-sm py-xs text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <HiExclamation size={14} className="mt-[1px] shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
};

export default NotebookEditorWordpressSection;
