import { useRef, useEffect, useCallback, memo, useMemo } from 'react';

// Components
import DocumentOverview from '../../../../../../../components/common/DocumentOverview';
import * as documentAndTextUtils from '../../../../../../../components/utils/documentAndTextUtils';
import { useDocumentsStore } from '../../../../../../../stores/documentsStore';

interface DocumentsSectionProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
}

interface CombinedItem {
  id: string;
  title?: string;
  name?: string;
  status?: string;
  itemType: 'document' | 'text';
  content?: string;
  document_type?: string;
  word_count?: number;
  source_type?: string;
  full_content?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// Static constants moved outside component
const DOCUMENT_TYPES = documentAndTextUtils.DOCUMENT_TYPES;

// Read-only archive: no per-item actions. The Word/PDF "Exportieren" submenu is
// appended unconditionally by DocumentOverview and remains the download path.
const NO_ITEM_ACTIONS = () => [];

/**
 * DocumentsSection — read-only archive view.
 *
 * This page is deprecated. Saved texts now live under /recherche and documents are
 * managed in the Notebook. All write/interactive functions (upload, delete, rename,
 * search, refresh, migrate) have been removed; users can only view and download
 * content they created here.
 */
const DocumentsSection = memo(
  ({ isActive, onSuccessMessage, onErrorMessage }: DocumentsSectionProps) => {
    // Documents store integration with combined content (read-only)
    const {
      documents,
      texts,
      isLoading: documentsLoading,
      error: documentsError,
      fetchCombinedContent,
    } = useDocumentsStore();

    // Combine documents and texts into a single read-only array
    const combinedItems: CombinedItem[] = useMemo(() => {
      const documentsWithType = documents.map((doc) => ({ ...doc, itemType: 'document' as const }));
      const textsWithType = texts.map((text) => ({
        ...text,
        itemType: 'text' as const,
        source_type: 'gruenerierte_texte', // Mark texts as generated content
        full_content: text.content, // Map content field for preview modal
        type: text.document_type, // Map document_type to type for metadata display
        word_count: text.word_count || (text.content ? text.content.split(/\s+/).length : 0),
      }));
      return [...documentsWithType, ...textsWithType] as CombinedItem[];
    }, [documents, texts]);

    // Combined fetch handler using the unified read-only endpoint
    const handleCombinedFetch = useCallback(async () => {
      try {
        await fetchCombinedContent();
      } catch (error) {
        console.error('[DocumentsSection] Error fetching combined content:', error);
        onErrorMessage(
          'Fehler beim Laden der Inhalte: ' +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }, [fetchCombinedContent, onErrorMessage]);

    // Handle errors
    useEffect(() => {
      if (documentsError) {
        console.error('[DocumentsSection] Fehler beim Laden der Dokumente:', documentsError);
        onErrorMessage('Fehler beim Laden der Dokumente: ' + documentsError);
      }
    }, [documentsError, onErrorMessage]);

    // Fetch combined content when tab becomes active - latest-ref keeps the
    // effect keyed on `isActive` only, without re-running on handler identity.
    const fetchCombinedRef = useRef(handleCombinedFetch);
    useEffect(() => {
      fetchCombinedRef.current = handleCombinedFetch;
    }, [handleCombinedFetch]);

    useEffect(() => {
      if (isActive) {
        void fetchCombinedRef.current();
      }
    }, [isActive]);

    return (
      <div className="flex flex-col gap-md">
        <DocumentOverview
          documents={
            combinedItems as Array<{
              id: string;
              title?: string;
              status?: string;
              [key: string]: unknown;
            }>
          }
          loading={documentsLoading}
          onFetch={handleCombinedFetch}
          documentTypes={DOCUMENT_TYPES}
          actionItems={NO_ITEM_ACTIONS}
          enableBulkSelect={false}
          enableLocalSearch={false}
          remoteSearchEnabled={false}
          emptyStateConfig={{
            noDocuments: 'Keine Inhalte vorhanden.',
            createMessage:
              'Hier findest du deine früher hochgeladenen Dokumente und gespeicherten Texte zum Ansehen und Herunterladen.',
          }}
          title="Meine Inhalte (Archiv)"
          onSuccessMessage={onSuccessMessage}
          onErrorMessage={onErrorMessage}
        />
      </div>
    );
  }
);

DocumentsSection.displayName = 'DocumentsSection';

export default DocumentsSection;
