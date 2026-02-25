import { useCallback, useEffect, useRef, useState } from 'react';
import { HiPlus } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { EarlyAccessBanner } from '../../../components/common/EarlyAccessBanner';
import IndexCard from '../../../components/common/IndexCard';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Separator } from '../../../components/ui/separator';
import { useAuthStore } from '../../../stores/authStore';
import { useDocumentsStore } from '../../../stores/documentsStore';
import NotebookEditor from '../components/NotebookEditor';
import NotebookList from '../components/NotebookList';
import { getAustrianNotebooks, getNotebooksByCategory } from '../config/notebooksConfig';
import useNotebookStore from '../stores/notebookStore';

interface EditorSaveData {
  id?: string;
  name: string;
  description?: string;
  selectionMode?: 'documents' | 'wolke';
  documents?: string[];
  wolkeShareLinks?: string[];
}

const gridClasses = 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2xl';

const NotebooksGalleryPage = () => {
  const navigate = useNavigate();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const bundesebeneNotebooks = getNotebooksByCategory('bundesebene');
  const landesebeneNotebooks = getNotebooksByCategory('landesebene');
  const weitereNotebooks = getNotebooksByCategory('weitere');
  const austrianNotebooks = getAustrianNotebooks();

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
    fetchQACollections();
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

  return (
    <ErrorBoundary>
      <div className="mx-auto mt-[60px] max-w-[1200px] px-lg flex flex-col max-md:mt-0 max-md:px-md max-md:pt-lg">
        <div className="text-center">
          <h1 className="text-[2.5rem] font-semibold mb-4 text-foreground-heading max-md:text-[1.75rem]">
            Notebooks
          </h1>
          <p className="mx-auto mb-xl max-w-[800px] text-[1.1rem] leading-relaxed text-foreground">
            {isAustrian
              ? 'Durchsuche grüne Dokumente und Programme mit KI-gestützten Fragen. Stelle deine Fragen zu grüner Politik in Österreich.'
              : 'Durchsuche grüne Dokumente und Programme mit KI-gestützten Fragen. Wähle ein Notebook und stelle deine Fragen zu grüner Politik.'}
          </p>
        </div>

        <EarlyAccessBanner feedbackUrl="https://tally.so/r/kdN6MZ" />

        {isAustrian ? (
          <div className={gridClasses}>
            {austrianNotebooks.map((notebook) => (
              <IndexCard
                key={notebook.id}
                title={notebook.title}
                description={notebook.description}
                meta={notebook.meta}
                tags={notebook.tags}
                onClick={() => navigate(notebook.path)}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mt-2xl mb-lg gap-md max-md:flex-col max-md:items-start max-md:gap-sm">
              <h2 className="text-2xl font-semibold text-foreground-heading m-0">Bundesebene</h2>
            </div>
            <div className={gridClasses}>
              {bundesebeneNotebooks.map((notebook) => (
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

            <div className="flex items-center justify-between mt-2xl mb-lg gap-md max-md:flex-col max-md:items-start max-md:gap-sm">
              <h2 className="text-2xl font-semibold text-foreground-heading m-0">Landesebene</h2>
            </div>
            <div className={gridClasses}>
              {landesebeneNotebooks.map((notebook) => (
                <IndexCard
                  key={notebook.id}
                  title={notebook.title}
                  description={notebook.description}
                  meta={notebook.meta}
                  tags={notebook.tags}
                  onClick={() => navigate(notebook.path)}
                />
              ))}
            </div>

            {weitereNotebooks.length > 0 && (
              <>
                <div className="flex items-center justify-between mt-2xl mb-lg gap-md max-md:flex-col max-md:items-start max-md:gap-sm">
                  <h2 className="text-2xl font-semibold text-foreground-heading m-0">Weitere</h2>
                </div>
                <div className={gridClasses}>
                  {weitereNotebooks.map((notebook) => (
                    <IndexCard
                      key={notebook.id}
                      title={notebook.title}
                      description={notebook.description}
                      meta={notebook.meta}
                      tags={notebook.tags}
                      onClick={() => navigate(notebook.path)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <Separator className="mt-2xl" />

        <div className="flex items-center justify-between mt-2xl mb-lg gap-md max-md:flex-col max-md:items-start max-md:gap-sm">
          <h2 className="text-2xl font-semibold text-foreground-heading m-0">Meine Notebooks</h2>
          <Button size="sm" onClick={handleCreate}>
            <HiPlus size={16} />
            Notebook erstellen
          </Button>
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

        <Dialog open={showEditor} onOpenChange={(open) => !open && handleCancel()}>
          <DialogContent
            className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0 [&>[data-slot=dialog-close]]:hidden"
            aria-describedby={undefined}
          >
            <DialogTitle className="sr-only">
              {editingCollection ? 'Notebook bearbeiten' : 'Notebook erstellen'}
            </DialogTitle>
            <NotebookEditor
              onSave={handleSave}
              onCancel={handleCancel}
              editingCollection={editingCollection}
              loading={collectionsLoading}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(NotebooksGalleryPage, {
  title: 'Notebooks',
});
