import { useCallback, useRef, useEffect } from 'react';
import { debounce } from 'lodash';

/**
 * Focus-aware autosave hook with field-level change tracking
 * 
 * Features:
 * - No saves while user is actively editing (focus-aware)
 * - Only saves fields that actually changed
 * - Event-driven instead of polling
 * - Silent operation (no loading states)
 * - Configurable debounce timing
 * - Smart retry logic
 * 
 * @param {Object} options Configuration options
 * @param {Function} options.saveFunction Function to call when saving changes
 * @param {Object} options.formRef React Hook Form methods (getValues, watch, etc.)
 * @param {number} options.debounceMs Debounce delay in milliseconds (default: 2000)
 * @param {boolean} options.enabled Whether autosave is enabled (default: true)
 * @param {Function} options.onError Optional error callback
 * @param {Function} options.getFieldsToTrack Function returning array of field names to track
 * @returns {Object} { triggerSave, resetTracking }
 */
export const useAutosave = ({
  saveFunction,
  formRef,
  debounceMs = 2000,
  enabled = true,
  onError = null,
  getFieldsToTrack = () => []
}) => {
  const lastSavedValues = useRef({});
  const saveInProgress = useRef(false);
  const retryCount = useRef(0);
  const maxRetries = 3;

  // Check if any field is currently focused (user actively editing)
  const isAnyFieldFocused = useCallback(() => {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    
    // Check if active element is an input, textarea, or contenteditable
    const isInputElement = activeElement.matches('input, textarea, [contenteditable="true"]');
    
    // Also check if it's within a form (to catch custom form components)
    const isInForm = activeElement.closest('form') !== null;
    
    return isInputElement || isInForm;
  }, []);

  // Compare field values to detect changes
  const getChangedFields = useCallback(() => {
    if (!formRef?.getValues || !enabled) return {};
    
    const currentValues = formRef.getValues();
    const fieldsToTrack = getFieldsToTrack();
    const changedFields = {};
    
    // If no specific fields to track, track all current values
    const fieldsToCheck = fieldsToTrack.length > 0 ? fieldsToTrack : Object.keys(currentValues);
    
    fieldsToCheck.forEach(fieldName => {
      const currentValue = getNestedValue(currentValues, fieldName);
      const lastValue = getNestedValue(lastSavedValues.current, fieldName);
      
      // Deep comparison for objects/arrays, shallow for primitives
      if (!isEqual(currentValue, lastValue)) {
        setNestedValue(changedFields, fieldName, currentValue);
      }
    });
    
    return changedFields;
  }, [formRef, enabled, getFieldsToTrack]);

  // Update tracking with current values
  const updateTracking = useCallback(() => {
    if (!formRef?.getValues || !enabled) return;
    
    const currentValues = formRef.getValues();
    lastSavedValues.current = deepClone(currentValues);
  }, [formRef, enabled]);

  // Reset tracking (call this after successful save)
  const resetTracking = useCallback(() => {
    if (!formRef?.getValues || !enabled) return;
    
    const currentValues = formRef.getValues();
    lastSavedValues.current = deepClone(currentValues);
    retryCount.current = 0;
  }, [formRef, enabled]);

  // Debounced save function
  const debouncedSave = useCallback(
    debounce(async () => {
      // Don't save if user is actively editing
      if (isAnyFieldFocused()) {
        // Reschedule the save for later
        setTimeout(() => debouncedSave(), 1000);
        return;
      }

      // Don't save if already saving
      if (saveInProgress.current) return;

      // Check what fields have changed
      const changedFields = getChangedFields();
      const changedFieldNames = Object.keys(changedFields);
      
      if (changedFieldNames.length === 0) return;

      try {
        saveInProgress.current = true;
        
        // Call the save function with only changed fields
        await saveFunction(changedFields);
        
        // Update tracking on successful save
        updateTracking();
        retryCount.current = 0;
        
      } catch (error) {
        retryCount.current += 1;
        
        // Retry logic
        if (retryCount.current <= maxRetries) {
          const retryDelay = Math.min(1000 * retryCount.current, 5000);
          setTimeout(() => debouncedSave(), retryDelay);
        } else {
          // Max retries reached, call error callback if provided
          if (onError) {
            onError(error, changedFields);
          } else {
            console.error('Autosave failed after max retries:', error);
          }
        }
      } finally {
        saveInProgress.current = false;
      }
    }, debounceMs),
    [saveFunction, isAnyFieldFocused, getChangedFields, updateTracking, onError, debounceMs]
  );

  // Manual trigger for immediate save (bypasses focus check)
  const triggerSave = useCallback(async (force = false) => {
    if (!enabled) return;

    if (!force && isAnyFieldFocused()) {
      // Schedule for later if user is editing
      setTimeout(() => triggerSave(true), 1000);
      return;
    }

    const changedFields = getChangedFields();
    if (Object.keys(changedFields).length === 0) return;

    try {
      saveInProgress.current = true;
      await saveFunction(changedFields);
      updateTracking();
    } catch (error) {
      if (onError) {
        onError(error, changedFields);
      }
      throw error;
    } finally {
      saveInProgress.current = false;
    }
  }, [enabled, isAnyFieldFocused, getChangedFields, saveFunction, updateTracking, onError]);

  // Set up form subscription and event listeners
  useEffect(() => {
    if (!enabled || !formRef?.watch) return;

    // Watch for form changes
    const subscription = formRef.watch(() => {
      debouncedSave();
    });

    // Also listen for focus/blur events to trigger saves when user stops editing
    const handleFocusOut = () => {
      // Small delay to check if focus moved to another form field
      setTimeout(() => {
        if (!isAnyFieldFocused()) {
          debouncedSave();
        }
      }, 100);
    };

    // Listen on document level to catch all form interactions
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      subscription?.unsubscribe();
      document.removeEventListener('focusout', handleFocusOut);
      debouncedSave.cancel();
    };
  }, [enabled, formRef, debouncedSave, isAnyFieldFocused]);

  return {
    triggerSave,
    resetTracking,
    isAutoSaveInProgress: () => saveInProgress.current
  };
};

// Utility functions

/**
 * Get nested object value by path (supports 'field.subfield' notation)
 */
function getNestedValue(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  
  return path.split('.').reduce((current, key) => {
    return current?.[key];
  }, obj);
}

/**
 * Set nested object value by path (supports 'field.subfield' notation)
 */
function setNestedValue(obj, path, value) {
  if (!obj || typeof path !== 'string') return;
  
  const keys = path.split('.');
  const lastKey = keys.pop();
  
  const target = keys.reduce((current, key) => {
    if (!(key in current) || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  
  target[lastKey] = value;
}

/**
 * Deep equality comparison
 */
function isEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }
  
  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(key => isEqual(a[key], b[key]));
  }
  
  return false;
}

/**
 * Deep clone utility
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (Array.isArray(obj)) return obj.map(deepClone);
  
  const cloned = {};
  Object.keys(obj).forEach(key => {
    cloned[key] = deepClone(obj[key]);
  });
  
  return cloned;
}

export default useAutosave;