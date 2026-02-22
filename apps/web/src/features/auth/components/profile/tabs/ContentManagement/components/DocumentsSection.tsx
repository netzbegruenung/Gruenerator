import {
  useState,
  useRef,
  useEffect,
  useCallback,
  memo,
  useMemo,
  type FormEvent,
  type ChangeEvent,
} from 'react';
import { HiPlus } from 'react-icons/hi';

// Components
import DocumentOverview from '../../../../../../../components/common/DocumentOverview';
import DocumentUpload from '../../../../../../../components/common/DocumentUpload';
import TextInput from '../../../../../../../components/common/Form/Input/TextInput';
import Spinner from '../../../../../../../components/common/Spinner';
import {
  ProfileIconButton,
  ProfileActionButton,
} from '../../../../../../../components/profile/actions/ProfileActionButton';
import { Button } from '../../../../../../../components/ui/button';
import { Card } from '../../../../../../../components/ui/card';
import apiClient from '../../../../../../../components/utils/apiClient';
import * as documentAndTextUtils from '../../../../../../../components/utils/documentAndTextUtils';
import { handleError } from '../../../../../../../components/utils/errorHandling';
import { useOptimizedAuth } from '../../../../../../../hooks/useAuth';
import { useTabIndex } from '../../../../../../../hooks/useTabIndex';
import { useDocumentsStore } from '../../../../../../../stores/documentsStore';
import { useWolkeStore } from '../../../../../../../stores/wolkeStore';
import { WolkeSyncManager } from '../../../../../../documents/components/WolkeSyncManager';

// Hooks
import { useDocumentMode } from '../../../../../../documents/hooks/useDocumentMode';
import { useWolkeSync } from '../../../../../../documents/hooks/useWolkeSync';
// Removed useUserTexts import - now using combined fetch from documentsStore

// Stores

// Utils

interface MemoizedDocumentUploadProps {
  onUploadComplete?: (document: unknown) => void;
  onDeleteComplete?: () => void;
  showDocumentsList?: boolean;
  showTitle?: boolean;
  forceShowUploadForm?: boolean;
  showAsModal?: boolean;
}

interface DocumentsSectionProps {
  isActive: boolean;
  onSuccessMessage: (message: string) => void;
  onErrorMessage: (message: string) => void;
  onShareToGroup?: (contentType: string, contentId: string, contentTitle: string) => void;
}

interface BulkDeleteResult {
  message?: string;
  hasErrors?: boolean;
}

interface SearchResultWithIndex {
  id: string;
  title?: string;
  content?: string;
  search_type?: string;
  score?: number;
  document_id?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
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

// Memoized DocumentUpload wrapper to prevent re-renders
const MemoizedDocumentUpload = memo(
  ({
    onUploadComplete,
    onDeleteComplete,
    showDocumentsList = true,
    showTitle = true,
    forceShowUploadForm = false,
    showAsModal = false,
  }: MemoizedDocumentUploadProps) => {
    return (
      <DocumentUpload
        onUploadComplete={onUploadComplete}
        onDeleteComplete={onDeleteComplete}
        showTitle={showTitle}
        showDocumentsList={showDocumentsList}
        forceShowUploadForm={forceShowUploadForm}
        showAsModal={showAsModal}
      />
    );
  }
);

MemoizedDocumentUpload.displayName = 'MemoizedDocumentUpload';

// Static constants moved outside component
const DOCUMENT_TYPES = documentAndTextUtils.DOCUMENT_TYPES;

const DocumentsSection = memo(
  ({ isActive, onSuccessMessage, onErrorMessage, onShareToGroup }: DocumentsSectionProps) => {
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_CONTENT_MANAGEMENT');

    // Auth state
    const { user, isAuthenticated } = useOptimizedAuth();

    // Document mode management
    const { loading: modeLoading } = useDocumentMode();

    // =====================================================================
    // DOCUMENTS-RELATED STATE AND FUNCTIONALITY
    // =====================================================================

    // Document upload form state
    const [showUploadForm, setShowUploadForm] = useState(false);

    // Delete all state
    const [showDeleteAllForm, setShowDeleteAllForm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeletingAll, setIsDeletingAll] = useState(false);
    const [deleteAllError, setDeleteAllError] = useState('');

    // Documents store integration with combined content
    const {
      documents,
      texts,
      isLoading: documentsLoading,
      error: documentsError,
      fetchDocuments,
      fetchCombinedContent,
      deleteDocument,
      updateDocumentTitle,
      refreshDocument,
      searchDocuments: searchDocumentsApi,
      isSearching: isDocumentsSearching,
      searchResults: documentSearchResults,
      clearSearchResults,
    } = useDocumentsStore();

    // Wolke store integration
    const {
      shareLinks: wolkeShareLinks,
      isLoading: wolkeLoading,
      error: wolkeError,
      fetchShareLinks,
      initialized: wolkeInitialized,
    } = useWolkeStore();

    // Wolke sync integration for delete all functionality
    const { syncStatuses, setAutoSync } = useWolkeSync();

    // Texts are now fetched through combined content - no separate hook needed
    // Text operations will need to be implemented in the store or as separate API calls

    // Combine documents and texts into a single array
    const combinedItems: CombinedItem[] = useMemo(() => {
      const documentsWithType = documents.map((doc) => ({ ...doc, itemType: 'document' as const }));
      const textsWithType = texts.map((text) => ({
        ...text,
        itemType: 'text' as const,
        source_type: 'gruenerierte_texte', // Mark texts as generated content
        full_content: text.content, // Map content field for preview modal
        type: text.document_type, // Map document_type to type for metadata display
        word_count: text.word_count || (text.content ? text.content.split(/\s+/).length : 0), // Calculate word count if missing
      }));
      return [...documentsWithType, ...textsWithType] as CombinedItem[];
    }, [documents, texts]);

    // Combined loading state - using single fetch now
    const combinedLoading = documentsLoading;

    const handleDocumentsRemoteSearch = useCallback(
      (q: string, mode: string) => {
        const searchMode = mode as 'intelligent' | 'fulltext';
        searchDocumentsApi(q, { limit: 10, mode: searchMode });
      },
      [searchDocumentsApi]
    );

    // Combined fetch handler using the new unified endpoint - defined early to be used in other handlers
    const handleCombinedFetch = useCallback(async () => {
      try {
        await fetchCombinedContent();
      } catch (error) {
        console.error('[DocumentsSection] Error fetching combined content:', error);
        onErrorMessage(
          'Fehler beim Aktualisieren der Inhalte: ' +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }, [fetchCombinedContent, onErrorMessage]);

    // =====================================================================
    // DOCUMENTS FUNCTIONALITY
    // =====================================================================

    // Document handlers
    const handleDocumentDelete = async (documentId: string) => {
      try {
        await deleteDocument(documentId);
        onSuccessMessage('Dokument wurde erfolgreich gelöscht.');
      } catch (error) {
        console.error('[DocumentsSection] Error deleting document:', error);
        onErrorMessage(
          'Fehler beim Löschen des Dokuments: ' +
            (error instanceof Error ? error.message : String(error))
        );
        throw error;
      }
    };

    const handleDocumentEdit = (document: CombinedItem) => {
      onSuccessMessage('Dokumentbearbeitung wird bald verfügbar sein.');
    };

    // Text handlers
    const handleTextEdit = (text: CombinedItem) => {
      window.open(`/editor/collab/${text.id}`, '_blank');
    };

    const handleTextTitleUpdate = async (textId: string, newTitle: string) => {
      try {
        // Direct API call for text title update
        await apiClient.put(`/auth/saved-texts/${textId}/title`, { title: newTitle });

        // Refresh combined content after update
        await handleCombinedFetch();
      } catch (error) {
        console.error('[DocumentsSection] Error updating text title:', error);
        onErrorMessage(
          'Fehler beim Aktualisieren des Texttitels: ' +
            (error instanceof Error ? error.message : String(error))
        );
        throw error;
      }
    };

    const handleTextDelete = async (textId: string) => {
      try {
        // Use apiClient for proper backend URL handling
        await apiClient.delete(`/auth/saved-texts/${textId}`);

        onSuccessMessage('Text wurde erfolgreich gelöscht.');
        // Refresh combined content after deletion
        await handleCombinedFetch();
      } catch (error) {
        console.error('[DocumentsSection] Error deleting text:', error);
        onErrorMessage(
          'Fehler beim Löschen des Texts: ' +
            (error instanceof Error ? error.message : String(error))
        );
        throw error;
      }
    };

    const handleCombinedEdit = (item: {
      id: string;
      itemType?: string;
      [key: string]: unknown;
    }) => {
      if (item.itemType === 'text') {
        handleTextEdit(item as CombinedItem);
      } else {
        handleDocumentEdit(item as CombinedItem);
      }
    };

    const handleCombinedTitleUpdate = async (
      itemId: string,
      newTitle: string,
      item: CombinedItem
    ) => {
      if (item.itemType === 'text') {
        await handleTextTitleUpdate(itemId, newTitle);
      } else {
        await handleDocumentTitleUpdate(itemId, newTitle);
      }
    };

    const handleCombinedDelete = async (itemId: string, item: CombinedItem) => {
      if (item.itemType === 'text') {
        await handleTextDelete(itemId);
      } else {
        await handleDocumentDelete(itemId);
      }
    };

    const handleDocumentTitleUpdate = async (documentId: string, newTitle: string) => {
      try {
        await updateDocumentTitle(documentId, newTitle);
      } catch (error) {
        console.error('[DocumentsSection] Error updating document title:', error);
        onErrorMessage(
          'Fehler beim Aktualisieren des Dokumenttitels: ' +
            (error instanceof Error ? error.message : String(error))
        );
        throw error;
      }
    };

    const handleDocumentRefresh = async (documentId: string) => {
      try {
        await refreshDocument(documentId);
      } catch (error) {
        console.error('[DocumentsSection] Error refreshing document:', error);
        onErrorMessage(
          'Fehler beim Aktualisieren des Dokumentstatus: ' +
            (error instanceof Error ? error.message : String(error))
        );
        throw error;
      }
    };

    const handleBulkDeleteDocuments = async (documentIds: string[]): Promise<void> => {
      try {
        const result = (await documentAndTextUtils.bulkDeleteDocuments(
          documentIds
        )) as BulkDeleteResult;
        fetchDocuments();
        if (result.message) {
          if (result.hasErrors) {
            onErrorMessage(result.message);
          } else {
            onSuccessMessage(result.message);
          }
        }
      } catch (error) {
        console.error('[DocumentsSection] Error in bulk delete documents:', error);
        onErrorMessage(error instanceof Error ? error.message : String(error));
        throw error;
      }
    };

    // Upload handlers
    const handleUploadComplete = useCallback(
      (document: { title?: string }) => {
        onSuccessMessage(
          `Dokument "${document.title}" wurde erfolgreich hochgeladen und wird verarbeitet.`
        );
      },
      [onSuccessMessage]
    );

    const handleDeleteComplete = useCallback(() => {
      onSuccessMessage('Dokument wurde erfolgreich gelöscht.');
    }, [onSuccessMessage]);

    const handleModalUploadComplete = useCallback(
      (result: unknown) => {
        if (result && typeof result === 'object' && 'title' in result) {
          handleUploadComplete(result as { title?: string });
        }
        setShowUploadForm(false);
      },
      [handleUploadComplete]
    );

    // Delete all handlers
    const handleToggleDeleteAllForm = useCallback(() => {
      setShowDeleteAllForm(!showDeleteAllForm);
      if (!showDeleteAllForm) {
        setDeleteConfirmText('');
        setDeleteAllError('');
      }
    }, [showDeleteAllForm]);

    const handleDeleteAllSubmit = useCallback(
      async (e: FormEvent) => {
        e.preventDefault();
        setDeleteAllError('');
        onErrorMessage('');

        const expectedText = 'alles löschen';
        if ((deleteConfirmText || '').trim().toLowerCase() !== expectedText) {
          const msg = `Bitte gib "${expectedText}" zur Bestätigung ein.`;
          setDeleteAllError(msg);
          onErrorMessage(msg);
          return;
        }

        setIsDeletingAll(true);
        try {
          // 1. Delete all documents
          const allDocIds = documents.map((d: { id: string }) => d.id);
          if (allDocIds.length > 0) {
            await handleBulkDeleteDocuments(allDocIds);
          }

          // 2. Delete all texts
          const allTextIds = texts.map((t: { id: string }) => t.id);
          for (const textId of allTextIds) {
            await handleTextDelete(textId);
          }

          // 3. Disable all Wolke auto-sync
          if (syncStatuses && syncStatuses.length > 0) {
            for (const status of syncStatuses) {
              if (status.auto_sync_enabled) {
                await setAutoSync(status.share_link_id, '', false);
              }
            }
          }

          // 4. Refresh all data
          await handleCombinedFetch();
          if (fetchShareLinks) {
            await fetchShareLinks();
          }

          onSuccessMessage(
            'Alle Inhalte wurden erfolgreich gelöscht und Wolke-Synchronisation deaktiviert.'
          );
          setShowDeleteAllForm(false);
          setDeleteConfirmText('');
        } catch (error) {
          console.error('[DocumentsSection] Error in delete all:', error);
          const msg =
            (error instanceof Error ? error.message : String(error)) ||
            'Fehler beim Löschen aller Inhalte.';
          setDeleteAllError(msg);
          onErrorMessage(msg);
        } finally {
          setIsDeletingAll(false);
        }
      },
      [
        deleteConfirmText,
        documents,
        texts,
        syncStatuses,
        handleBulkDeleteDocuments,
        handleTextDelete,
        setAutoSync,
        handleCombinedFetch,
        fetchShareLinks,
        onSuccessMessage,
        onErrorMessage,
      ]
    );

    // =====================================================================
    // WOLKE SYNC FUNCTIONALITY
    // =====================================================================

    // Wolke sync handlers
    const handleWolkeSyncComplete = useCallback(() => {
      // Refresh documents after Wolke sync completes
      fetchDocuments();
      onSuccessMessage('Wolke-Synchronisation erfolgreich abgeschlossen.');
    }, [fetchDocuments, onSuccessMessage]);

    const handleRefreshWolkeShareLinks = useCallback(
      async (forceRefresh = false) => {
        try {
          await fetchShareLinks();
        } catch (error) {
          console.error('[DocumentsSection] Error refreshing Wolke share links:', error);
          onErrorMessage(
            'Fehler beim Aktualisieren der Wolke-Verbindungen: ' +
              (error instanceof Error ? error.message : String(error))
          );
        }
      },
      [fetchShareLinks, onErrorMessage]
    );

    // =====================================================================
    // EFFECTS
    // =====================================================================

    // Handle errors
    useEffect(() => {
      if (documentsError) {
        console.error('[DocumentsSection] Fehler beim Laden der Dokumente:', documentsError);
        onErrorMessage('Fehler beim Laden der Dokumente: ' + documentsError);
      }
    }, [documentsError, onErrorMessage]);

    // Text errors are now handled by the combined fetch (documentsError)

    // Handle Wolke errors
    useEffect(() => {
      if (wolkeError) {
        console.error('[DocumentsSection] Fehler beim Laden der Wolke-Daten:', wolkeError);
        onErrorMessage('Fehler beim Laden der Wolke-Verbindungen: ' + wolkeError);
      }
    }, [wolkeError, onErrorMessage]);

    // Fetch combined content when tab becomes active - use ref to prevent loops
    const fetchCombinedRef = useRef<typeof handleCombinedFetch | null>(null);
    fetchCombinedRef.current = handleCombinedFetch;

    useEffect(() => {
      if (isActive) {
        fetchCombinedRef.current?.();
        // Also fetch Wolke share links when tab becomes active
        if (!wolkeInitialized) {
          handleRefreshWolkeShareLinks();
        }
      }
    }, [isActive, wolkeInitialized, handleRefreshWolkeShareLinks]);

    // =====================================================================
    // RENDER METHODS
    // =====================================================================

    // Render Documents content with mode selector
    const renderDocumentsContent = () => (
      <div role="tabpanel" id="documents-panel" aria-labelledby="documents-tab" tabIndex={-1}>
        {/* Conditional content based on mode */}
        {modeLoading ? (
          <div className="flex items-center justify-center py-xl" />
        ) : (
          <>
            {/* Wolke Sync Manager Section - Hidden for now */}
            {/* <WolkeSyncManager
                        wolkeShareLinks={wolkeShareLinks}
                        onRefreshShareLinks={handleRefreshWolkeShareLinks}
                        onSyncComplete={handleWolkeSyncComplete}
                    /> */}

            <DocumentOverview
              documents={
                combinedItems as Array<{
                  id: string;
                  title?: string;
                  status?: string;
                  [key: string]: unknown;
                }>
              }
              loading={combinedLoading}
              onFetch={handleCombinedFetch}
              onDelete={(itemId: string, item: unknown) =>
                handleCombinedDelete(itemId, item as CombinedItem)
              }
              onBulkDelete={handleBulkDeleteDocuments}
              onUpdateTitle={async (itemId: string, newTitle: string) => {
                // Find the item to determine its type
                const item = combinedItems.find((i) => i.id === itemId);
                if (item) {
                  await handleCombinedTitleUpdate(itemId, newTitle, item);
                }
              }}
              onEdit={handleCombinedEdit}
              onRefreshDocument={handleDocumentRefresh}
              onShare={(item: unknown) => {
                const typedItem = item as CombinedItem;
                if (onShareToGroup) {
                  onShareToGroup(typedItem.itemType, typedItem.id, typedItem.title || '');
                }
              }}
              documentTypes={DOCUMENT_TYPES}
              emptyStateConfig={{
                noDocuments: 'Keine Inhalte vorhanden.',
                createMessage:
                  'Lade dein erstes Dokument hoch oder erstelle einen Text um loszulegen. Alle Inhalte werden als durchsuchbare Vektoren gespeichert.',
              }}
              searchPlaceholder="Alle Inhalte durchsuchen..."
              title="Meine Inhalte"
              onSuccessMessage={onSuccessMessage}
              onErrorMessage={onErrorMessage}
              enableGrouping={true}
              remoteSearchEnabled={true}
              onRemoteSearch={handleDocumentsRemoteSearch}
              isRemoteSearching={isDocumentsSearching}
              remoteResults={documentSearchResults as SearchResultWithIndex[]}
              onClearRemoteSearch={clearSearchResults}
              headerActions={
                <div className="flex gap-xs">
                  <ProfileIconButton
                    action="refresh"
                    onClick={handleCombinedFetch}
                    disabled={combinedLoading}
                    ariaLabel="Alle Inhalte aktualisieren"
                    title="Aktualisieren"
                  />
                  <ProfileActionButton
                    action="add"
                    onClick={() => setShowUploadForm(true)}
                    disabled={combinedLoading}
                    ariaLabel="Neuen Inhalt hinzufügen"
                    title="Inhalt hinzufügen"
                    size="s"
                  />
                </div>
              }
            />

            {/* Delete all button at the end for better UX */}
            {!showDeleteAllForm && combinedItems.length > 0 && (
              <div className="flex justify-center p-md border-t border-grey-200 dark:border-grey-700 mt-sm">
                <Button
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
                  onClick={() => setShowDeleteAllForm(true)}
                  disabled={documentsLoading}
                  aria-label="Alle Inhalte löschen"
                >
                  Alle Inhalte löschen
                </Button>
              </div>
            )}

            {/* Delete all confirmation form */}
            {showDeleteAllForm && (
              <Card className="p-lg border-red-200 dark:border-red-800 mt-md">
                <form onSubmit={handleDeleteAllSubmit}>
                  <div className="flex flex-col gap-sm">
                    <div className="text-base font-semibold text-red-700 dark:text-red-400">
                      Alle Inhalte löschen
                    </div>
                    <p className="text-sm text-grey-600 dark:text-grey-400">
                      <strong>Warnung:</strong> Diese Aktion löscht:
                    </p>
                    <ul className="text-sm text-grey-600 dark:text-grey-400 list-disc pl-md">
                      <li>{documents.length} Dokumente</li>
                      <li>{texts.length} Grünerierte Texte</li>
                      <li>
                        {syncStatuses ? syncStatuses.filter((s) => s.auto_sync_enabled).length : 0}{' '}
                        aktive Wolke-Synchronisationen
                      </li>
                    </ul>
                    <p className="text-sm text-grey-600 dark:text-grey-400">
                      Diese Aktion kann <strong>nicht rückgängig</strong> gemacht werden!
                    </p>

                    {deleteAllError && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                        {deleteAllError}
                      </div>
                    )}

                    <div className="flex flex-col gap-xxs">
                      <label htmlFor="deleteConfirmText">
                        Um fortzufahren, gib &quot;alles löschen&quot; ein:
                      </label>
                      <TextInput
                        id="deleteConfirmText"
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setDeleteConfirmText(e.target.value)
                        }
                        placeholder="alles löschen"
                        aria-label="Bestätigung: alles löschen"
                        disabled={isDeletingAll}
                      />
                    </div>
                  </div>

                  <div className="flex gap-sm justify-end mt-md">
                    <Button variant="destructive" type="submit" disabled={isDeletingAll}>
                      {isDeletingAll ? <Spinner size="small" /> : 'Alles unwiderruflich löschen'}
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={handleToggleDeleteAllForm}
                      disabled={isDeletingAll}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Upload form modal/overlay */}
            {showUploadForm && (
              <DocumentUpload
                onUploadComplete={handleModalUploadComplete}
                onDeleteComplete={handleDeleteComplete}
                showDocumentsList={false}
                showTitle={false}
                forceShowUploadForm={true}
                showAsModal={true}
              />
            )}
          </>
        )}
      </div>
    );

    return <div className="flex flex-col gap-md">{renderDocumentsContent()}</div>;
  }
);

DocumentsSection.displayName = 'DocumentsSection';

export default DocumentsSection;
