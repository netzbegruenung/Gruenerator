import { useCallback, useRef, useEffect } from 'react';

/**
 * Autosave hook that tracks form changes and triggers save after debounced period
 * @param {Object} config - Configuration object
 * @param {Function} config.saveFunction - Async function to save changes
 * @param {Object} config.formRef - Reference to form methods (getValues, watch)
 * @param {boolean} config.enabled - Whether autosave is enabled
 * @param {number} config.debounceMs - Debounce delay in milliseconds
 * @param {Function} config.getFieldsToTrack - Returns array of field names to track
 * @param {Function} config.onError - Error handler callback
 */
export const useAutosave = ({
  saveFunction,
  formRef,
  enabled = true,
  debounceMs = 2000,
  getFieldsToTrack,
  onError
}) => {
  const saveTimeoutRef = useRef(null);
  const lastSavedValuesRef = useRef({});
  const isSavingRef = useRef(false);
  const isInitializedRef = useRef(false);

  // Reset tracking to current form values
  const resetTracking = useCallback(() => {
    if (!formRef?.getValues) {
      return;
    }

    const currentValues = formRef.getValues();
    const fieldsToTrack = getFieldsToTrack ? getFieldsToTrack() : Object.keys(currentValues);

    const trackedValues = {};
    fieldsToTrack.forEach(field => {
      trackedValues[field] = currentValues[field];
    });

    lastSavedValuesRef.current = trackedValues;
    isInitializedRef.current = true;
  }, [formRef, getFieldsToTrack, enabled]);

  // Get changed fields by comparing current values with last saved
  const getChangedFields = useCallback(() => {
    if (!formRef?.getValues || !isInitializedRef.current) {
      return null;
    }

    const currentValues = formRef.getValues();
    const fieldsToTrack = getFieldsToTrack ? getFieldsToTrack() : Object.keys(currentValues);
    const changes = {};
    let hasChanges = false;

    fieldsToTrack.forEach(field => {
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
  const triggerSave = useCallback(async () => {
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
      Object.keys(changedFields).forEach(field => {
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
  const handleFieldChange = useCallback(() => {
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
  useEffect(() => {
    if (!enabled || !formRef?.watch || !isInitializedRef.current) {
      return;
    }

    const fieldsToTrack = getFieldsToTrack ? getFieldsToTrack() : undefined;

    // Watch specific fields or all fields
    const subscription = formRef.watch((value, { name }) => {
      if (fieldsToTrack && name && !fieldsToTrack.includes(name)) {
        return;
      }

      handleFieldChange();
    });

    return () => {
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
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const isAutoSaveInProgress = useCallback(() => {
    return isSavingRef.current;
  }, []);

  return {
    triggerSave,
    resetTracking,
    isAutoSaveInProgress
  };
};

export default useAutosave;
