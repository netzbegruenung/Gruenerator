import { useCallback, useRef, useEffect, Ref } from 'react';

interface FormRef {
  getValues: () => Record<string, unknown>;
  watch: (callback: (value: Record<string, unknown>, { name }: { name?: string }) => void) => {
    unsubscribe?: () => void;
  };
}

interface UseAutosaveConfig {
  saveFunction: (changedFields: Record<string, unknown>) => Promise<void>;
  formRef?: FormRef;
  enabled?: boolean;
  debounceMs?: number;
  getFieldsToTrack?: () => string[];
  onError?: (error: unknown) => void;
}

interface UseAutosaveReturn {
  triggerSave: () => Promise<void>;
  resetTracking: () => void;
  isAutoSaveInProgress: () => boolean;
}

/**
 * Autosave hook that tracks form changes and triggers save after debounced period
 * @param config - Configuration object
 * @param config.saveFunction - Async function to save changes
 * @param config.formRef - Reference to form methods (getValues, watch)
 * @param config.enabled - Whether autosave is enabled
 * @param config.debounceMs - Debounce delay in milliseconds
 * @param config.getFieldsToTrack - Returns array of field names to track
 * @param config.onError - Error handler callback
 */
export const useAutosave = ({
  saveFunction,
  formRef,
  enabled = true,
  debounceMs = 2000,
  getFieldsToTrack,
  onError
}: UseAutosaveConfig): UseAutosaveReturn => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedValuesRef = useRef<Record<string, unknown>>({});
  const isSavingRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);

  // Reset tracking to current form values
  const resetTracking = useCallback((): void => {
    if (!formRef?.getValues) {
      return;
    }

    const currentValues = formRef.getValues();
    const fieldsToTrack = getFieldsToTrack ? getFieldsToTrack() : Object.keys(currentValues);

    const trackedValues: Record<string, unknown> = {};
    fieldsToTrack.forEach((field: string) => {
      trackedValues[field] = currentValues[field];
    });

    lastSavedValuesRef.current = trackedValues;
    isInitializedRef.current = true;
  }, [formRef, getFieldsToTrack, enabled]);

  // Get changed fields by comparing current values with last saved
  const getChangedFields = useCallback((): Record<string, unknown> | null => {
    if (!formRef?.getValues || !isInitializedRef.current) {
      return null;
    }

    const currentValues = formRef.getValues();
    const fieldsToTrack = getFieldsToTrack ? getFieldsToTrack() : Object.keys(currentValues);
    const changes: Record<string, unknown> = {};
    let hasChanges = false;

    fieldsToTrack.forEach((field: string) => {
      const currentValue = currentValues[field];
      const lastValue = lastSavedValuesRef.current[field];

      // Deep comparison for arrays and objects
      const isEqual = JSON.stringify(currentValue) === JSON.stringify(lastValue);

      if (!isEqual) {
        changes[field] = currentValue;
        hasChanges = true;
      }
    });

    return hasChanges ? changes : null;
  }, [formRef, getFieldsToTrack]);

  // Trigger save with the changed fields
  const triggerSave = useCallback(async (): Promise<void> => {
    if (!enabled || !isInitializedRef.current || isSavingRef.current) {
      return;
    }

    const changedFields = getChangedFields();
    if (!changedFields) {
      return;
    }

    isSavingRef.current = true;

    try {
      await saveFunction(changedFields);

      // Update last saved values on success
      Object.keys(changedFields).forEach((field: string) => {
        lastSavedValuesRef.current[field] = changedFields[field];
      });
    } catch (error) {
      if (onError) {
        onError(error);
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [enabled, saveFunction, getChangedFields, onError]);

  // Debounced save handler
  const handleFieldChange = useCallback((): void => {
    if (!enabled || !isInitializedRef.current) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(() => {
      triggerSave();
    }, debounceMs);
  }, [enabled, debounceMs, triggerSave]);

  // Watch form changes
  useEffect((): (() => void) | undefined => {
    if (!enabled || !formRef?.watch || !isInitializedRef.current) {
      return;
    }

    const fieldsToTrack = getFieldsToTrack ? getFieldsToTrack() : undefined;

    // Watch specific fields or all fields
    const subscription = formRef.watch((value: Record<string, unknown>, { name }: { name?: string }) => {
      if (fieldsToTrack && name && !fieldsToTrack.includes(name)) {
        return;
      }

      handleFieldChange();
    });

    return (): void => {
      // Only unsubscribe if subscription exists and has unsubscribe method
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [enabled, formRef, getFieldsToTrack, handleFieldChange]);

  // Cleanup on unmount
  useEffect((): (() => void) => {
    return (): void => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const isAutoSaveInProgress = useCallback((): boolean => {
    return isSavingRef.current;
  }, []);

  return {
    triggerSave,
    resetTracking,
    isAutoSaveInProgress
  };
};

export default useAutosave;
