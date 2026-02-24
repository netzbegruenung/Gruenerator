import { useEffect } from 'react';

import { useGeneratorSelectionStore } from '../../../../stores/core/generatorSelectionStore';
import { useDocumentsStore } from '../../../../stores/documentsStore';

interface KnowledgeSelection {
  selectedDocumentIds: string[];
  selectedTextIds: string[];
  useAutomaticSearch: boolean;
  useNotebookEnrich: boolean;
}

const useKnowledgeSystem = (
  generatorType: string | null,
  componentName: string | null,
  disableKnowledgeSystem: boolean,
  defaultMode: unknown
): KnowledgeSelection => {
  const { setUIConfig, setAvailableDocuments, setAvailableTexts } = useGeneratorSelectionStore();
  const {
    fetchCombinedContent,
    documents: documentsFromStore,
    texts: textsFromStore,
  } = useDocumentsStore();

  const selectionStore = useGeneratorSelectionStore();

  // Initialize knowledge system UI config + deferred data fetch
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem) {
      setUIConfig({
        enableKnowledge: true,
        enableDocuments: true,
        enableTexts: true,
        enableSourceSelection: true,
      });

      const idleCallbackId =
        'requestIdleCallback' in window
          ? window.requestIdleCallback(
              () => {
                fetchCombinedContent().catch((error: unknown) => {
                  console.error('[useKnowledgeSystem] Failed to fetch combined content:', error);
                });
              },
              { timeout: 2000 }
            )
          : setTimeout(() => {
              fetchCombinedContent().catch((error: unknown) => {
                console.error('[useKnowledgeSystem] Failed to fetch combined content:', error);
              });
            }, 100);

      return () => {
        if ('requestIdleCallback' in window && typeof idleCallbackId === 'number') {
          window.cancelIdleCallback(idleCallbackId);
        } else {
          clearTimeout(idleCallbackId as unknown as number);
        }
      };
    }
  }, [generatorType, disableKnowledgeSystem, setUIConfig, fetchCombinedContent]);

  // Sync documents from documentsStore to generatorSelectionStore
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem && documentsFromStore) {
      setAvailableDocuments(
        documentsFromStore as unknown as Parameters<typeof setAvailableDocuments>[0]
      );
    }
  }, [generatorType, disableKnowledgeSystem, documentsFromStore, setAvailableDocuments]);

  // Sync texts from documentsStore to generatorSelectionStore
  useEffect(() => {
    if (generatorType && !disableKnowledgeSystem && textsFromStore) {
      setAvailableTexts(textsFromStore as unknown as Parameters<typeof setAvailableTexts>[0]);
    }
  }, [generatorType, disableKnowledgeSystem, textsFromStore, setAvailableTexts]);

  // Track component switches and apply default modes
  useEffect(() => {
    if (componentName && generatorType) {
      const { setActiveComponent } = useGeneratorSelectionStore.getState();
      setActiveComponent(
        componentName,
        defaultMode as unknown as ('privacy' | 'pro' | 'ultra' | 'balanced') | null | undefined
      );
    }
  }, [componentName, generatorType]);

  // Conditionally extract values based on knowledge system status
  const isDisabled = !generatorType || disableKnowledgeSystem;

  return {
    selectedDocumentIds: isDisabled ? [] : selectionStore.selectedDocumentIds,
    selectedTextIds: isDisabled ? [] : selectionStore.selectedTextIds,
    useAutomaticSearch: isDisabled ? false : selectionStore.useAutomaticSearch,
    useNotebookEnrich: isDisabled ? false : selectionStore.useNotebookEnrich,
  };
};

export default useKnowledgeSystem;
