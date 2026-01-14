import { useEffect, useRef, useCallback } from 'react';
import { useSaveToLibrary } from './useSaveToLibrary';
import useGeneratedTextStore from '../stores/core/generatedTextStore';
import { getDocumentType } from '../utils/documentTypeMapper';
import { extractTitleFromContent } from '../utils/titleExtractor';

/**
 * Options for useTextAutoSave hook
 */
export interface UseTextAutoSaveOptions {
  componentName: string;
  enabled?: boolean;
  debounceMs?: number;
  onSaveSuccess?: (data: unknown) => void;
  onSaveError?: (error: Error) => void;
}

/**
 * Hook return type
 */
export interface UseTextAutoSaveReturn {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved: number | null;
  error: string | null;
  triggerManualSave: () => Promise<void>;
}

/**
 * Auto-save hook for text generators
 * Watches generated text content and automatically saves after debounce period
 *
 * @param options - Configuration options
 * @returns Auto-save status and manual trigger function
 */
export function useTextAutoSave(options: UseTextAutoSaveOptions): UseTextAutoSaveReturn {
  const {
    componentName,
    enabled = true,
    debounceMs = 3000,
    onSaveSuccess,
    onSaveError
  } = options;

  // Get store functions and content
  const content = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const metadata = useGeneratedTextStore(state => state.getGeneratedTextMetadata(componentName));
  const setAutoSaveStatus = useGeneratedTextStore(state => state.setAutoSaveStatus);
  const setLastAutoSaveTime = useGeneratedTextStore(state => state.setLastAutoSaveTime);
  const status = useGeneratedTextStore(state => state.getAutoSaveStatus(componentName));
  const lastSaved = useGeneratedTextStore(state => state.getLastAutoSaveTime(componentName));

  // Save to library hook
  const { saveToLibrary, isLoading, error: saveError } = useSaveToLibrary();

  // Track last saved content to prevent duplicate saves
  const lastSavedContentRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  /**
   * Perform the actual save operation
   */
  const performSave = useCallback(async (contentToSave: string) => {
    if (!contentToSave || contentToSave.trim().length < 50) {
      console.log('[useTextAutoSave] Content too short, skipping save');
      return;
    }

    // Skip if content hasn't changed
    if (contentToSave === lastSavedContentRef.current) {
      console.log('[useTextAutoSave] Content unchanged, skipping save');
      return;
    }

    try {
      console.log('[useTextAutoSave] Starting save for', componentName);
      setAutoSaveStatus(componentName, 'saving');

      // Extract title from content or metadata
      const title = (metadata as { title?: string })?.title || extractTitleFromContent(contentToSave);

      // Get document type from component name
      const documentType = getDocumentType(componentName);

      // Save to library
      const result = await saveToLibrary(contentToSave, title, documentType);

      if (isMountedRef.current) {
        setAutoSaveStatus(componentName, 'saved');
        setLastAutoSaveTime(componentName, Date.now());
        lastSavedContentRef.current = contentToSave;

        console.log('[useTextAutoSave] Save successful for', componentName);

        if (onSaveSuccess && result) {
          onSaveSuccess(result);
        }
      }
    } catch (error) {
      console.error('[useTextAutoSave] Save failed:', error);

      if (isMountedRef.current) {
        setAutoSaveStatus(componentName, 'error');

        if (onSaveError && error instanceof Error) {
          onSaveError(error);
        }
      }
    }
  }, [componentName, metadata, saveToLibrary, setAutoSaveStatus, setLastAutoSaveTime, onSaveSuccess, onSaveError]);

  /**
   * Manual save trigger (no debounce)
   */
  const triggerManualSave = useCallback(async () => {
    if (!enabled) {
      console.log('[useTextAutoSave] Auto-save is disabled');
      return;
    }

    // Cancel any pending auto-save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (typeof content === 'string') {
      await performSave(content);
    }
  }, [enabled, content, performSave]);

  /**
   * Debounced auto-save effect
   */
  useEffect(() => {
    if (!enabled || !content || typeof content !== 'string') {
      return;
    }

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      performSave(content);
    }, debounceMs);

    // Cleanup
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [enabled, content, debounceMs, performSave]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Clear any pending save on unmount
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Update status based on loading state from useSaveToLibrary
   */
  useEffect(() => {
    if (isLoading && status !== 'saving') {
      setAutoSaveStatus(componentName, 'saving');
    }
  }, [isLoading, status, componentName, setAutoSaveStatus]);

  return {
    status,
    lastSaved,
    error: saveError,
    triggerManualSave
  };
}
