import { useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { useAiEditStore } from '../stores/aiEditStore';
import { applyChangesToEditor } from '../lib/aiEditUtils';
import { apiClient } from '../lib/apiClient';

interface AiEditResult {
  success: boolean;
  summary?: string;
  appliedCount?: number;
  error?: string;
}

export const useAiEdit = (documentId: string, editor: Editor | null) => {
  const { commitAiEdit, setProcessing, setError } = useAiEditStore();
  const isProcessing = useAiEditStore((state) => state.getIsProcessing(documentId));

  const applyAiEdit = useCallback(
    async (instruction: string): Promise<AiEditResult> => {
      if (!editor || !instruction.trim()) {
        return { success: false, error: 'Kein Editor oder keine Anweisung' };
      }

      setProcessing(documentId, true);
      setError(documentId, null);

      try {
        // 1. Get current text snapshot
        const beforeContent = editor.getText();

        // 2. Call API (reuse existing endpoint)
        const response = await apiClient.post('/claude_suggest_edits', {
          instruction: instruction.trim(),
          currentText: beforeContent,
          componentName: `doc-${documentId}`,
        });

        const { changes, summary } = response.data;

        if (!changes || !Array.isArray(changes)) {
          throw new Error('Ungültige Antwort vom Server');
        }

        if (changes.length === 0) {
          return {
            success: false,
            error: 'Keine Änderungen vorgeschlagen',
          };
        }

        // 3. Apply changes to editor
        const result = applyChangesToEditor(editor, changes);

        if (result.appliedCount > 0) {
          // 4. Get after snapshot
          const afterContent = editor.getText();

          // 5. Commit to history
          commitAiEdit(documentId, {
            id: `ai-${Date.now()}`,
            documentId,
            instruction,
            changes,
            beforeContent,
            afterContent,
            timestamp: Date.now(),
            summary: summary || `${result.appliedCount} Änderungen angewendet`,
          });

          return {
            success: true,
            summary: summary || `✅ ${result.appliedCount} Änderungen angewendet`,
            appliedCount: result.appliedCount,
          };
        }

        return {
          success: false,
          error: 'Keine Änderungen konnten angewendet werden',
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Fehler bei der KI-Bearbeitung';
        setError(documentId, errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setProcessing(documentId, false);
      }
    },
    [editor, documentId, commitAiEdit, setProcessing, setError]
  );

  return { applyAiEdit, isProcessing };
};
