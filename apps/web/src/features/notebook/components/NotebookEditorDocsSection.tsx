import { type LinkedDocRef } from '@gruenerator/contracts';
import { useDocuments, type Document } from '@gruenerator/docs';
import { Badge, Button, SectionHeader } from '@gruenerator/ui';
import { useState, useCallback, useMemo } from 'react';
import { HiDocumentText, HiExclamation, HiRefresh, HiX } from 'react-icons/hi';
import { Link } from 'react-router-dom';

import { useDocumentsStore } from '../../../stores/documentsStore';
import { cn } from '../../../utils/cn';

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
  const { uploadFileOnly } = useDocumentsStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attachedIds = useMemo(() => new Set(linkedDocs.map((d) => d.docId)), [linkedDocs]);
  const availableDocs = useMemo(
    () => (docsQuery.data ?? []).filter((d) => !attachedIds.has(d.id)),
    [docsQuery.data, attachedIds]
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
        setPickerOpen(false);
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
        onCreate={hasAnyDocs && linkedDocs.length > 0 ? () => setPickerOpen((v) => !v) : undefined}
        createLabel="Doc hinzufügen"
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
          {(pickerOpen || linkedDocs.length === 0) && availableDocs.length > 0 && (
            <div className="mb-md flex flex-col gap-1 rounded-xl border border-grey-200 bg-background p-xs dark:border-grey-700">
              <p className="m-0 px-1 pb-1 text-xs uppercase tracking-wide text-grey-500">
                Deine Docs
              </p>
              {availableDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  disabled={disabled || syncingId === doc.id}
                  className="flex items-center gap-sm rounded-md px-sm py-xs text-left transition-colors hover:bg-background-alt disabled:opacity-60"
                  onClick={() => void handleAttach(doc)}
                >
                  {syncingId === doc.id ? (
                    <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
                  ) : (
                    <HiDocumentText size={14} className="shrink-0 text-grey-400" aria-hidden />
                  )}
                  <span className="truncate text-sm text-foreground">{doc.title}</span>
                </button>
              ))}
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
