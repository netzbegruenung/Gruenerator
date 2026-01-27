import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface UseTabManagerOptions<T extends string> {
  /** Default tab to show */
  defaultTab: T;
  /** Valid tab IDs for validation */
  validTabs: readonly T[];
  /** URL query parameter name for persistence (optional) */
  urlParam?: string;
  /** LocalStorage key for persistence (optional) */
  storageKey?: string;
  /** Callback when tab changes */
  onChange?: (tab: T) => void;
}

export interface UseTabManagerResult<T extends string> {
  /** Currently active tab */
  activeTab: T;
  /** Set the active tab */
  setActiveTab: (tab: T) => void;
  /** Check if a tab is active */
  isActive: (tab: T) => boolean;
}

/**
 * Generic hook for managing tab state with optional URL and localStorage persistence.
 *
 * @example
 * ```tsx
 * const { activeTab, setActiveTab } = useTabManager({
 *   defaultTab: 'home',
 *   validTabs: ['home', 'settings', 'profile'] as const,
 *   urlParam: 'tab',
 *   storageKey: 'app-tab',
 * });
 * ```
 */
export function useTabManager<T extends string>({
  defaultTab,
  validTabs,
  urlParam,
  storageKey,
  onChange,
}: UseTabManagerOptions<T>): UseTabManagerResult<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  const isValidTab = useCallback(
    (tab: string | null): tab is T => {
      return tab !== null && validTabs.includes(tab as T);
    },
    [validTabs]
  );

  const getInitialTab = useCallback((): T => {
    // Priority 1: URL parameter
    if (urlParam) {
      const urlTab = searchParams.get(urlParam);
      if (isValidTab(urlTab)) {
        return urlTab;
      }
    }

    // Priority 2: LocalStorage
    if (storageKey) {
      try {
        const storedTab = localStorage.getItem(storageKey);
        if (isValidTab(storedTab)) {
          return storedTab;
        }
      } catch {
        // localStorage might be unavailable
      }
    }

    // Fallback: default tab
    return defaultTab;
  }, [urlParam, storageKey, defaultTab, searchParams, isValidTab]);

  const [activeTab, setActiveTabState] = useState<T>(getInitialTab);

  const setActiveTab = useCallback(
    (tab: T) => {
      if (!isValidTab(tab)) return;

      setActiveTabState(tab);

      // Persist to URL
      if (urlParam) {
        setSearchParams(
          (prev) => {
            const newParams = new URLSearchParams(prev);
            if (tab === defaultTab) {
              newParams.delete(urlParam);
            } else {
              newParams.set(urlParam, tab);
            }
            return newParams;
          },
          { replace: true }
        );
      }

      // Persist to localStorage
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, tab);
        } catch {
          // localStorage might be unavailable
        }
      }

      // Callback
      onChange?.(tab);
    },
    [isValidTab, urlParam, storageKey, defaultTab, setSearchParams, onChange]
  );

  // Sync with URL changes (e.g., browser back/forward)
  useEffect(() => {
    if (urlParam) {
      const urlTab = searchParams.get(urlParam);
      if (isValidTab(urlTab) && urlTab !== activeTab) {
        setActiveTabState(urlTab);
      } else if (!urlTab && activeTab !== defaultTab) {
        // URL param removed, could reset to default
        // Keeping current tab for better UX
      }
    }
  }, [searchParams, urlParam, isValidTab, activeTab, defaultTab]);

  const isActive = useCallback((tab: T) => tab === activeTab, [activeTab]);

  return {
    activeTab,
    setActiveTab,
    isActive,
  };
}

export default useTabManager;
