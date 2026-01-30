import { useCallback, useEffect, useRef, useState } from 'react';
import { HiPlus } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { EarlyAccessBanner } from '../../../components/common/EarlyAccessBanner';
import IndexCard from '../../../components/common/IndexCard';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useDocumentsStore } from '../../../stores/documentsStore';
import NotebookEditor from '../components/NotebookEditor';
import NotebookList from '../components/NotebookList';
import { getOrderedNotebooks } from '../config/notebooksConfig';
import useNotebookStore from '../stores/notebookStore';
import '../../../assets/styles/components/gallery-layout.css';
import '../../../assets/styles/components/gallery-content-type.css';

interface EditorSaveData {
  id?: string;
  name: string;
  description?: string;
  selectionMode?: 'documents' | 'wolke';
  documents?: string[];
  wolkeShareLinks?: string[];
}

const NotebooksGalleryPage = () => {
  const navigate = useNavigate();
  const notebooks = getOrderedNotebooks();

  const {
    qaCollections,
    loading: collectionsLoading,
    fetchQACollections,
    createQACollection,
    updateQACollection,
    deleteQACollection,
    getQACollection,
  } = useNotebookStore();

  const { pollDocumentStatus } = useDocumentsStore();

  const [showEditor, setShowEditor] = useState(false);
  const [editingCollection, setEditingCollection] = useState<ReturnType<
    typeof getQACollection
  > | null>(null);
  const [processingCollectionIds, setProcessingCollectionIds] = useState<Set<string>>(new Set());
  const pollingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (import.meta.env.DEV) fetchQACollections();
  }, [fetchQACollections]);

  const handleCreate = useCallback(() => {
    setEditingCollection(null);
    setShowEditor(true);
  }, []);

  const handleEdit = useCallback(
    (collectionId: string) => {
      const collection = getQACollection(collectionId);
      if (collection) {
        setEditingCollection(collection);
        setShowEditor(true);
      }
    },
    [getQACollection]
  );

  const handleView = useCallback(
    (collectionId: string) => {
      navigate(`/notebook/${collectionId}`);
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async (collectionId: string) => {
      await deleteQACollection(collectionId);
    },
    [deleteQACollection]
  );

  const handleShare = useCallback((collectionId: string) => {
    const url = `${window.location.origin}/notebook/${collectionId}`;
    navigator.clipboard.writeText(url);
  }, []);

  const startPolling = useCallback(
    (collectionId: string, documentIds: string[]) => {
      if (pollingRef.current.has(collectionId)) return;
      pollingRef.current.add(collectionId);

      setProcessingCollectionIds((prev) => new Set([...prev, collectionId]));

      Promise.all(documentIds.map((docId) => pollDocumentStatus(docId)))
        .then(() => {
          pollingRef.current.delete(collectionId);
          setProcessingCollectionIds((prev) => {
            const next = new Set(prev);
            next.delete(collectionId);
            return next;
          });
          fetchQACollections();
        })
        .catch(() => {
          pollingRef.current.delete(collectionId);
          setProcessingCollectionIds((prev) => {
            const next = new Set(prev);
            next.delete(collectionId);
            return next;
          });
        });
    },
    [pollDocumentStatus, fetchQACollections]
  );

  const handleSave = useCallback(
    async (data: unknown) => {
      const saveData = data as EditorSaveData;
      if (saveData.id) {
        await updateQACollection(saveData.id, {
          name: saveData.name,
          description: saveData.description,
          selectionMode: saveData.selectionMode,
          documents: saveData.documents,
          wolkeShareLinks: saveData.wolkeShareLinks,
        });
      } else {
        const result = await createQACollection({
          name: saveData.name,
          description: saveData.description,
          selectionMode: saveData.selectionMode,
          documents: saveData.documents,
          wolkeShareLinks: saveData.wolkeShareLinks,
        });

        // Start polling for newly created notebooks with uploaded documents
        if (result?.id && saveData.documents?.length) {
          startPolling(result.id, saveData.documents);
        }
      }
      setShowEditor(false);
      setEditingCollection(null);
    },
    [createQACollection, updateQACollection, startPolling]
  );

  const handleCancel = useCallback(() => {
    setShowEditor(false);
    setEditingCollection(null);
  }, []);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        handleCancel();
      }
    },
    [handleCancel]
  );

  return (
    <ErrorBoundary>
      <div className="gallery-layout">
        <div className="gallery-header">
          <h1>Notebooks</h1>
          <p>
            Durchsuche grüne Dokumente und Programme mit KI-gestützten Fragen. Wähle ein Notebook
            und stelle deine Fragen zu grüner Politik.
          </p>
        </div>

        <EarlyAccessBanner feedbackUrl="https://tally.so/r/kdN6MZ" />

        <div className="gallery-grid">
          {notebooks.map((notebook) => (
            <IndexCard
              key={notebook.id}
              title={notebook.title}
              description={notebook.description}
              meta={notebook.meta}
              tags={notebook.tags}
              onClick={() => navigate(notebook.path)}
              variant={notebook.id === 'gruenerator-notebook' ? 'elevated' : 'default'}
            />
          ))}
        </div>

        {import.meta.env.DEV && (
          <>
            <hr className="gallery-section-divider" />

            <div className="gallery-section-header">
              <h2>Meine Notebooks</h2>
              <button className="btn-create" onClick={handleCreate}>
                <HiPlus size={16} />
                Notebook erstellen
              </button>
            </div>

            <NotebookList
              qaCollections={qaCollections}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onShare={handleShare}
              loading={collectionsLoading}
              processingCollectionIds={processingCollectionIds}
            />

            {showEditor && (
              <div className="notebook-editor-modal-overlay" onClick={handleOverlayClick}>
                <div className="notebook-editor-modal-content">
                  <NotebookEditor
                    onSave={handleSave}
                    onCancel={handleCancel}
                    editingCollection={editingCollection}
                    loading={collectionsLoading}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(NotebooksGalleryPage, {
  title: 'Notebooks',
});
