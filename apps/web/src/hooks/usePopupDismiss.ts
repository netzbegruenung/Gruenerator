import { useCallback, useEffect, useRef } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useUserDefaultsStore } from '../stores/userDefaultsStore';

const POPUP_GENERATOR = 'popups';

const POPUP_KEYS = ['termsAccepted', 'austriaLaunchVideo2025Shown'] as const;

interface UsePopupDismissReturn {
  isDismissed: boolean;
  dismiss: () => void;
  isHydrated: boolean;
}

/**
 * Hook for persistent popup dismiss state.
 *
 * - localStorage is always the immediate source of truth (sync, works for anonymous users)
 * - For authenticated users, dismiss state is also synced to the server via user_defaults
 * - On login, any locally dismissed popups are pushed to the server
 */
export const usePopupDismiss = (storageKey: string): UsePopupDismissReturn => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const prevAuthRef = useRef(isAuthenticated);

  const { defaults, isHydrated, hydrate, setDefault, getDefault } = useUserDefaultsStore();

  const localDismissed =
    typeof window !== 'undefined' && localStorage.getItem(storageKey) === 'true';
  const serverDismissed =
    isAuthenticated && isHydrated ? getDefault<boolean>(POPUP_GENERATOR, storageKey, false) : false;

  const isDismissed = localDismissed || serverDismissed;

  const dismiss = useCallback(() => {
    localStorage.setItem(storageKey, 'true');

    if (isAuthenticated) {
      setDefault(POPUP_GENERATOR, storageKey, true).catch(() => {
        // Non-critical: localStorage already has the value
      });
    }
  }, [storageKey, isAuthenticated, setDefault]);

  // Hydrate user defaults when authenticated
  useEffect(() => {
    if (isAuthenticated && !isHydrated) {
      hydrate();
    }
  }, [isAuthenticated, isHydrated, hydrate]);

  // Sync localStorage dismissals to server on login transition
  useEffect(() => {
    const wasAuthenticated = prevAuthRef.current;
    prevAuthRef.current = isAuthenticated;

    if (!wasAuthenticated && isAuthenticated && isHydrated) {
      for (const key of POPUP_KEYS) {
        const localValue = localStorage.getItem(key);
        const serverValue = getDefault<boolean>(POPUP_GENERATOR, key, false);

        if (localValue === 'true' && !serverValue) {
          setDefault(POPUP_GENERATOR, key, true).catch(() => {
            // Non-critical
          });
        }
      }
    }
  }, [isAuthenticated, isHydrated, defaults, getDefault, setDefault]);

  return { isDismissed, dismiss, isHydrated: !isAuthenticated || isHydrated };
};

export default usePopupDismiss;
