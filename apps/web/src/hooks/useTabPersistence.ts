import { useEffect, useRef, useCallback } from 'react';
import { useDesktopTabsStore } from '../stores/desktopTabsStore';
import { saveTabs, loadTabs } from '../utils/tabPersistence';
import { isDesktopApp } from '../utils/platform';

const SAVE_DEBOUNCE_MS = 1000;

export const useTabPersistence = () => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialized = useRef(false);
  const { tabs, activeTabId, restoreTabs } = useDesktopTabsStore();

  const initializeTabs = useCallback(async () => {
    if (!isDesktopApp() || isInitialized.current) return;
    isInitialized.current = true;

    try {
      const savedState = await loadTabs();
      if (savedState && savedState.tabs.length > 0) {
        restoreTabs(savedState.tabs, savedState.activeTabId);
      }
    } catch (error) {
      console.error('[TabPersistence] Failed to restore tabs:', error);
    }
  }, [restoreTabs]);

  useEffect(() => {
    initializeTabs();
  }, [initializeTabs]);

  useEffect(() => {
    if (!isDesktopApp() || !isInitialized.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveTabs(tabs, activeTabId).catch(error => {
        console.error('[TabPersistence] Failed to save tabs:', error);
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!isDesktopApp()) return;

    const handleBeforeUnload = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const state = useDesktopTabsStore.getState();
      saveTabs(state.tabs, state.activeTabId);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
};
