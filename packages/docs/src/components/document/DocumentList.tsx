import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useCallback, useMemo, useState } from 'react';
import { FiPlus, FiFile, FiGrid, FiUsers } from 'react-icons/fi';

import { useDocsAdapter } from '../../context/DocsContext';
import {
  useDocuments,
  useCreateDocument,
  useGenerateDocument,
  useDeleteDocument,
  useUpdateDocument,
} from '../../hooks/useDocuments';
import { type TemplateType } from '../../lib/templates';
import type { Document } from '../../stores/documentStore';
import { ShareModal } from '../permissions/ShareModal';
import { DocumentCard } from './DocumentCard';
import { TemplateCarousel } from './TemplateCarousel';
import { TemplatePicker } from './TemplatePicker';

const gridClasses =
  'flex flex-col gap-sm sm:grid sm:grid-cols-2 sm:gap-md md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-lg lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]';

interface DocumentListProps {
  searchQuery?: string;
}

export const DocumentList = memo(({ searchQuery }: DocumentListProps) => {
  const adapter = useDocsAdapter();

  const { data: documents = [], isLoading, error } = useDocuments();
  const createDocumentMutation = useCreateDocument();
  const generateDocumentMutation = useGenerateDocument();
  const deleteDocumentMutation = useDeleteDocument();
  const updateDocumentMutation = useUpdateDocument();

  const [showGallery, setShowGallery] = useState(false);
  const [shareDoc, setShareDoc] = useState<{ id: string; title: string } | null>(null);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery?.trim()) return documents;
    const query = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => doc.title.toLowerCase().includes(query));
  }, [documents, searchQuery]);

  const { personalDocs, groupDocsByGroup } = useMemo(() => {
    const personal: Document[] = [];
    const groupMap = new Map<string, { groupName: string; docs: Document[] }>();

    for (const doc of filteredDocuments) {
      if (doc.access_type === 'group' && doc.group_shares?.length) {
        for (const gs of doc.group_shares) {
          let entry = groupMap.get(gs.group_id);
          if (!entry) {
            entry = { groupName: gs.group_name, docs: [] };
            groupMap.set(gs.group_id, entry);
          }
          entry.docs.push(doc);
        }
      } else {
        personal.push(doc);
      }
    }

    return {
      personalDocs: personal,
      groupDocsByGroup: Array.from(groupMap.entries()).sort(([, a], [, b]) =>
        a.groupName.localeCompare(b.groupName, 'de')
      ),
    };
  }, [filteredDocuments]);

  const handleTemplateSelect = useCallback(
    async (templateType: TemplateType) => {
      setShowGallery(false);
      try {
        const { templates } = await import('../../lib/templates');
        const template = templates.find((t) => t.id === templateType);
        const title = template?.defaultTitle || 'Neues Dokument';
        const newDoc = await createDocumentMutation.mutateAsync({
          title,
          documentSubtype: templateType,
        });
        adapter.navigateToDocument(newDoc.id);
      } catch (err) {
        console.error('Failed to create document:', err);
      }
    },
    [createDocumentMutation, adapter]
  );

  const handleShowGallery = useCallback(() => setShowGallery(true), []);

  const handleDeleteDocument = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (window.confirm('Dokument wirklich löschen?')) {
        try {
          await deleteDocumentMutation.mutateAsync(id);
        } catch (err) {
          console.error('Failed to delete document:', err);
        }
      }
    },
    [deleteDocumentMutation]
  );

  const handleRenameDocument = useCallback(
    async (doc: { id: string; title: string }, e: React.MouseEvent) => {
      e.stopPropagation();
      const newTitle = window.prompt('Neuer Titel:', doc.title);
      if (newTitle && newTitle.trim() && newTitle.trim() !== doc.title) {
        try {
          await updateDocumentMutation.mutateAsync({
            id: doc.id,
            updates: { title: newTitle.trim() },
          });
        } catch (err) {
          console.error('Failed to rename document:', err);
        }
      }
    },
    [updateDocumentMutation]
  );

  const handleShareDocument = useCallback((doc: { id: string; title: string }) => {
    setShareDoc({ id: doc.id, title: doc.title });
  }, []);

  const handleNavigate = useCallback((id: string) => adapter.navigateToDocument(id), [adapter]);

  if (isLoading) {
    return <div className="py-12 px-4 text-center text-grey-500 dark:text-grey-400">Lädt...</div>;
  }

  if (error) {
    return (
      <div className="py-12 px-4 text-center text-red-600 dark:text-red-400">{error.message}</div>
    );
  }

  const hasNoDocuments = documents.length === 0;
  const hasNoResults = filteredDocuments.length === 0 && !hasNoDocuments;

  return (
    <div className="w-full">
      {/* Desktop: template carousel */}
      <div className="max-sm:hidden">
        <TemplateCarousel
          onTemplateSelect={handleTemplateSelect}
          onShowGallery={handleShowGallery}
        />
      </div>

      {hasNoDocuments ? (
        <div className="py-12 px-4 text-center text-[0.9375rem] leading-relaxed text-grey-500 dark:text-grey-400">
          Noch keine Dokumente vorhanden. Erstelle dein erstes Dokument!
        </div>
      ) : hasNoResults ? (
        <div className="py-12 px-4 text-center text-[0.9375rem] leading-relaxed text-grey-500 dark:text-grey-400">
          Keine Dokumente gefunden.
        </div>
      ) : (
        <>
          {/* Personal documents */}
          {personalDocs.length > 0 && (
            <div className={gridClasses}>
              {personalDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onNavigate={handleNavigate}
                  onRename={handleRenameDocument}
                  onDelete={handleDeleteDocument}
                  onShare={handleShareDocument}
                />
              ))}
            </div>
          )}

          {/* One section per group */}
          {groupDocsByGroup.map(([groupId, { groupName, docs }]) => (
            <div key={groupId} className="mt-xl">
              <h2 className="mb-sm flex items-center gap-xs text-sm font-medium text-grey-500 dark:text-grey-400">
                <FiUsers size={14} />
                {groupName}
              </h2>
              <div className={gridClasses}>
                {docs.map((doc) => (
                  <DocumentCard
                    key={`${doc.id}-${groupId}`}
                    doc={doc}
                    onNavigate={handleNavigate}
                    onRename={handleRenameDocument}
                    onDelete={handleDeleteDocument}
                    onShare={handleShareDocument}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Mobile: floating action button */}
      <div className="hidden max-sm:fixed max-sm:bottom-5 max-sm:right-5 max-sm:z-[100] max-sm:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className="h-[52px] w-[52px] rounded-full bg-[#5F8575] shadow-[0_4px_12px_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.1)] hover:bg-[#5F8575]/90"
              aria-label="Neues Dokument erstellen"
            >
              <FiPlus size={24} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={8}>
            <DropdownMenuLabel>Neues Dokument</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleTemplateSelect('blank')}>
              <FiFile size={16} />
              Leeres Dokument
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowGallery(true)}>
              <FiGrid size={16} />
              Aus Vorlage...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showGallery && (
        <TemplatePicker onSelect={handleTemplateSelect} onClose={() => setShowGallery(false)} />
      )}

      {shareDoc && (
        <ShareModal
          documentId={shareDoc.id}
          documentTitle={shareDoc.title}
          onClose={() => setShareDoc(null)}
        />
      )}
    </div>
  );
});

DocumentList.displayName = 'DocumentList';
