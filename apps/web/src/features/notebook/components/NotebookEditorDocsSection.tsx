import { type LinkedDocRef } from '@gruenerator/contracts';
import { useDocuments, useDocsAdapter, type Document } from '@gruenerator/docs';
import {
  Badge,
  Button,
  Input,
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  SectionHeader,
} from '@gruenerator/ui';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { HiDocumentText, HiExclamation, HiRefresh, HiSearch, HiX } from 'react-icons/hi';
import { Link } from 'react-router-dom';

import { useDocumentsStore } from '../../../stores/documentsStore';
import { cn } from '../../../utils/cn';
import { DocumentCard } from '../../docs/DocumentCard';

export interface ImportedLinkedDoc {
  id: string;
  title: string;
}

interface Props {
  linkedDocs: LinkedDocRef[];
  onLinkedDocsChange: (next: LinkedDocRef[]) => void;
  remainingSlots: number;
  /** Called with newly imported documents — parent appends to uploadedDocuments and starts indexing polling. */
  onDocsImported: (docs: ImportedLinkedDoc[]) => void;
  /** Called when a previously imported Document should leave the parent's uploadedDocuments (re-sync or unlink). */
  onUploadedDocumentRemoved: (documentId: string) => void;
  disabled: boolean;
}

const DOCS_PER_PAGE = 12;

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Noch nicht importiert';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(then)) return 'Noch nicht importiert';
  if (diff < 60_000) return 'Importiert vor wenigen Sekunden';
  if (diff < 3_600_000) return `Importiert vor ${Math.round(diff / 60_000)} Min.`;
  if (diff < 86_400_000) return `Importiert vor ${Math.round(diff / 3_600_000)} Std.`;
  return `Importiert am ${new Date(iso).toLocaleDateString('de-DE')}`;
}

const ExperimentalBadge = (
  <Badge
    variant="outline"
    className="border-amber-300 bg-amber-50 text-[10px] uppercase text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
  >
    Experimentell
  </Badge>
);

async function fetchDocMarkdown(docId: string): Promise<string> {
  const res = await fetch(`/api/docs/${docId}/export/markdown`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Markdown-Export fehlgeschlagen (${res.status})`);
  }
  return res.text();
}

const NotebookEditorDocsSection = ({
  linkedDocs,
  onLinkedDocsChange,
  remainingSlots,
  onDocsImported,
  onUploadedDocumentRemoved,
  disabled,
}: Props) => {
  const docsQuery = useDocuments();
  const docsAdapter = useDocsAdapter();
  const { uploadFileOnly } = useDocumentsStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const attachedIds = useMemo(() => new Set(linkedDocs.map((d) => d.docId)), [linkedDocs]);
  const availableDocs = useMemo(
    () => (docsQuery.data ?? []).filter((d) => !attachedIds.has(d.id)),
    [docsQuery.data, attachedIds]
  );

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableDocs;
    return availableDocs.filter((d) => d.title.toLowerCase().includes(q));
  }, [availableDocs, searchQuery]);

  // Reset to page 1 whenever the filter result changes — keeps the user from
  // landing on an empty late page after typing a query.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, availableDocs.length]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / DOCS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedDocs = filteredDocs.slice(
    (safePage - 1) * DOCS_PER_PAGE,
    safePage * DOCS_PER_PAGE
  );

  const importDoc = useCallback(
    async (docId: string, docTitle: string): Promise<ImportedLinkedDoc> => {
      const markdown = await fetchDocMarkdown(docId);
      const safeName = docTitle.replace(/[^\p{L}\p{N}\s.-]+/gu, '_').slice(0, 80) || 'Dokument';
      const file = new File([markdown], `${safeName}.md`, { type: 'text/markdown' });
      const uploaded = await uploadFileOnly(file, file.name);
      return { id: uploaded.id, title: uploaded.title || docTitle };
    },
    [uploadFileOnly]
  );

  const handleAttach = useCallback(
    async (doc: Document) => {
      if (remainingSlots <= 0) {
        setError('Notebook ist voll.');
        return;
      }
      setSyncingId(doc.id);
      setError(null);
      try {
        const imported = await importDoc(doc.id, doc.title);
        onDocsImported([imported]);
        const newRef: LinkedDocRef = {
          docId: doc.id,
          docTitle: doc.title,
          documentId: imported.id,
          lastSyncedAt: new Date().toISOString(),
        };
        onLinkedDocsChange([...linkedDocs, newRef]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import fehlgeschlagen.');
      } finally {
        setSyncingId(null);
      }
    },
    [importDoc, onDocsImported, onLinkedDocsChange, linkedDocs, remainingSlots]
  );

  const handleSync = useCallback(
    async (ref: LinkedDocRef) => {
      if (remainingSlots <= 0 && !ref.documentId) {
        setError('Notebook ist voll.');
        return;
      }
      setSyncingId(ref.docId);
      setError(null);
      try {
        if (ref.documentId) {
          onUploadedDocumentRemoved(ref.documentId);
        }
        const imported = await importDoc(ref.docId, ref.docTitle);
        onDocsImported([imported]);
        const updated: LinkedDocRef = {
          ...ref,
          documentId: imported.id,
          lastSyncedAt: new Date().toISOString(),
        };
        onLinkedDocsChange(linkedDocs.map((d) => (d.docId === ref.docId ? updated : d)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sync fehlgeschlagen.');
      } finally {
        setSyncingId(null);
      }
    },
    [
      importDoc,
      onDocsImported,
      onLinkedDocsChange,
      onUploadedDocumentRemoved,
      linkedDocs,
      remainingSlots,
    ]
  );

  const handleRemove = useCallback(
    (docId: string) => {
      const ref = linkedDocs.find((d) => d.docId === docId);
      if (ref?.documentId) {
        onUploadedDocumentRemoved(ref.documentId);
      }
      onLinkedDocsChange(linkedDocs.filter((d) => d.docId !== docId));
    },
    [linkedDocs, onLinkedDocsChange, onUploadedDocumentRemoved]
  );

  const isLoading = docsQuery.isLoading;
  const hasAnyDocs = (docsQuery.data ?? []).length > 0;

  const headerActions = (
    <div className="flex items-center gap-xs">
      {ExperimentalBadge}
      {hasAnyDocs && <span className="text-sm text-grey-500">{linkedDocs.length}</span>}
    </div>
  );

  return (
    <section>
      <SectionHeader
        title="Docs"
        onCreate={hasAnyDocs ? () => setPickerOpen((v) => !v) : undefined}
        createLabel={pickerOpen ? 'Schließen' : 'Doc hinzufügen'}
        actions={headerActions}
      />

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-grey-100 dark:bg-grey-900" />
      ) : !hasAnyDocs ? (
        <div className="flex flex-col items-start gap-xs rounded-xl border border-dashed border-grey-300 bg-background p-md dark:border-grey-700">
          <p className="m-0 text-sm text-foreground">Du hast noch keine Docs.</p>
          <p className="m-0 text-xs text-grey-500">
            Erstelle ein Doc und du kannst es hier als Quelle hinzufügen.
          </p>
          <Button asChild type="button" size="sm" className="mt-xs">
            <Link to="/docs">Zu meinen Docs →</Link>
          </Button>
        </div>
      ) : (
        <>
          {pickerOpen && (
            <div className="mb-md flex flex-col gap-md rounded-xl border border-grey-200 bg-background p-md dark:border-grey-700">
              <div className="relative">
                <HiSearch
                  size={14}
                  className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-grey-400"
                  aria-hidden
                />
                <Input
                  type="search"
                  placeholder="Docs durchsuchen…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                  aria-label="Docs durchsuchen"
                />
              </div>

              {filteredDocs.length === 0 ? (
                <p className="text-xs text-grey-500">
                  {availableDocs.length === 0
                    ? 'Alle deine Docs sind bereits hinzugefügt.'
                    : 'Keine Treffer für deine Suche.'}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-sm sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                    {paginatedDocs.map((doc) => (
                      <DocumentCard
                        key={doc.id}
                        doc={doc}
                        adapter={docsAdapter}
                        mode="select"
                        isSelected={syncingId === doc.id}
                        isDisabled={disabled || (syncingId !== null && syncingId !== doc.id)}
                        onSelect={() => void handleAttach(doc)}
                      />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className={cn(safePage <= 1 && 'pointer-events-none opacity-50')}
                            aria-disabled={safePage <= 1}
                          />
                        </PaginationItem>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <PaginationItem key={page}>
                            <PaginationLink
                              isActive={page === safePage}
                              onClick={() => setCurrentPage(page)}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className={cn(
                              safePage >= totalPages && 'pointer-events-none opacity-50'
                            )}
                            aria-disabled={safePage >= totalPages}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </>
              )}
            </div>
          )}

          {linkedDocs.length > 0 && (
            <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {linkedDocs.map((ref) => {
                const isSyncing = syncingId === ref.docId;
                return (
                  <div
                    key={ref.docId}
                    className={cn(
                      'group relative flex min-h-[112px] min-w-0 flex-col gap-xs overflow-hidden rounded-xl border border-grey-200 bg-background p-md transition-all duration-200 dark:border-grey-800',
                      isSyncing ? 'opacity-90' : 'hover:shadow-sm'
                    )}
                    aria-label={`Doc: ${ref.docTitle}`}
                  >
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent dark:via-amber-500/40"
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
                      onClick={() => handleRemove(ref.docId)}
                      title="Importierter Inhalt wird ebenfalls entfernt."
                      aria-label={`${ref.docTitle} entfernen`}
                    >
                      <HiX size={12} />
                    </Button>
                    <div className="flex items-start gap-xs pr-6">
                      <HiDocumentText
                        size={14}
                        className="mt-[2px] shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden
                      />
                      <div
                        className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground"
                        title={ref.docTitle}
                      >
                        {ref.docTitle}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-xs">
                      <span className="text-xs text-grey-500">
                        {isSyncing ? 'Wird importiert…' : formatRelative(ref.lastSyncedAt)}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || isSyncing || (remainingSlots <= 0 && !ref.documentId)}
                        onClick={() => void handleSync(ref)}
                        aria-label={`${ref.docTitle} synchronisieren`}
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
                );
              })}
            </div>
          )}

          {error && (
            <div className="mt-md flex items-start gap-xs rounded-md bg-amber-50 px-sm py-xs text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <HiExclamation size={14} className="mt-[1px] shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default NotebookEditorDocsSection;
