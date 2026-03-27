import { FileText } from 'lucide-react';
import { useCallback, useState } from 'react';

import useNotebookStore from '../stores/notebookStore';

import { DocumentRow } from './DocumentRow';
import { DocumentViewer } from './DocumentViewer';

import type { Document } from '../../../types/documents';
import type { NotebookCollection } from '../../../types/notebook';

interface DocumentBrowserPanelProps {
  collection: NotebookCollection;
}

export function DocumentBrowserPanel({ collection }: DocumentBrowserPanelProps) {
  const documents = collection.documents || [];
  const {
    toggleDocumentSelection,
    getSelectedDocumentIds,
    setSelectedDocumentIds,
    removeDocumentFromCollection,
  } = useNotebookStore();
  const selectedIds = getSelectedDocumentIds(collection.id);

  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleToggle = useCallback(
    (documentId: string) => {
      toggleDocumentSelection(collection.id, documentId);
    },
    [collection.id, toggleDocumentSelection]
  );

  const handleView = useCallback(
    (documentId: string) => {
      const doc = documents.find((d) => d.id === documentId);
      if (doc) setViewingDoc(doc);
    },
    [documents]
  );

  const handleRemove = useCallback(
    async (documentId: string) => {
      setRemovingId(documentId);
      try {
        await removeDocumentFromCollection(collection.id, documentId);
      } finally {
        setRemovingId(null);
      }
    },
    [collection.id, removeDocumentFromCollection]
  );

  const allSelected =
    documents.length > 0 &&
    selectedIds.length === documents.filter((d) => d.status === 'completed').length;

  const handleToggleAll = useCallback(() => {
    const readyIds = documents.filter((d) => d.status === 'completed').map((d) => d.id);

    if (allSelected) {
      setSelectedDocumentIds(collection.id, []);
    } else {
      setSelectedDocumentIds(collection.id, readyIds);
    }
  }, [allSelected, collection.id, documents, setSelectedDocumentIds]);

  const readyCount = documents.filter((d) => d.status === 'completed').length;

  if (viewingDoc) {
    return (
      <DocumentViewer
        documentId={viewingDoc.id}
        documentTitle={viewingDoc.title || 'Dokument'}
        onClose={() => setViewingDoc(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-foreground-muted" />
          <span className="text-sm font-medium">Dokumente ({documents.length})</span>
        </div>
        {readyCount > 1 && (
          <button
            onClick={handleToggleAll}
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            {allSelected ? 'Keine' : 'Alle'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-xs text-foreground-muted">
        <span>
          {selectedIds.length} von {readyCount} aktiv
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-foreground-muted">
            <FileText className="h-8 w-8 opacity-40" />
            <p className="text-sm">Keine Dokumente</p>
          </div>
        ) : (
          documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              document={doc}
              isSelected={selectedIds.includes(doc.id)}
              onToggle={handleToggle}
              onView={handleView}
              onRemove={removingId === doc.id ? () => {} : handleRemove}
            />
          ))
        )}
      </div>
    </div>
  );
}
