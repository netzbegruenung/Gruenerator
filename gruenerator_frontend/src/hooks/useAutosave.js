import { useCallback } from 'react';

/**
 * No-op autosave hook. Retained for API compatibility but intentionally does nothing.
 */
export const useAutosave = () => {
  const triggerSave = useCallback(() => {}, []);
  const resetTracking = useCallback(() => {}, []);
  const isAutoSaveInProgress = useCallback(() => false, []);

  return {
    triggerSave,
    resetTracking,
    isAutoSaveInProgress
  };
};

export default useAutosave;
