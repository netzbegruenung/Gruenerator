import { useState, useCallback } from 'react';

import apiClient from '../../components/utils/apiClient';

import useTextEditActions from './useTextEditActions';

interface ApplyResult {
  success: boolean;
  summary?: string;
  error?: string;
}

const useApplyAiEdit = (componentName: string) => {
  const { getEditableText, applyEdits } = useTextEditActions(componentName);
  const [isProcessing, setIsProcessing] = useState(false);

  const applyInstruction = useCallback(
    async (instruction: string): Promise<ApplyResult> => {
      const currentText = getEditableText();
      if (!currentText) return { success: false, error: 'Kein Text vorhanden.' };

      setIsProcessing(true);
      try {
        const response = await apiClient.post('/claude_suggest_edits', {
          instruction,
          currentText,
          componentName,
        });

        let data = response?.data;

        // Frontend JSON repair fallback (same pattern as UniversalEditForm)
        if (data?.needsFrontendParsing && data?.raw) {
          try {
            const cleaned = data.raw
              .replace(/```json\s*|\s*```/g, '')
              .replace(/(\*\*|__|~~)\s*"/g, '"')
              .replace(/"\s*(\*\*|__|~~)/g, '"')
              .trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.changes && Array.isArray(parsed.changes)) data = parsed;
          } catch {
            /* use original data */
          }
        }

        const changes = data?.changes || [];
        if (!Array.isArray(changes) || changes.length === 0) {
          return { success: false, error: 'Keine Änderungen vorgeschlagen.' };
        }

        const result = applyEdits(changes);
        return {
          success: result.appliedCount > 0,
          summary: data?.summary || `${result.appliedCount} Änderung(en) angewendet.`,
        };
      } catch (err) {
        const error = err as { response?: { data?: { error?: string } }; message?: string };
        return {
          success: false,
          error: error.response?.data?.error || error.message || 'Fehler.',
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [componentName, getEditableText, applyEdits]
  );

  return { applyInstruction, isProcessing };
};

export default useApplyAiEdit;
