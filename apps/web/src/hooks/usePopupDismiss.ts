import { useCallback, useEffect, useRef } from 'react';

import {
  useSetUserDefault,
  useUserDefaultsQuery,
} from '../features/user-defaults/userDefaultsQueries';
import { useAuthStore } from '../stores/authStore';

const POPUP_GENERATOR = 'popups' as const;

/**
 * Registry of all popup storageKeys that participate in cross-device sync.
 * When adding a new popup with `usePopupDismiss`, register its storageKey here
 * so that dismiss state is synced to the server via `user_defaults` on login.
 */
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

  const query = useUserDefaultsQuery();
  const mutation = useSetUserDefault<typeof POPUP_GENERATOR, string>();

  const popups = query.data?.[POPUP_GENERATOR];
  const isHydratedForAuth = isAuthenticated ? query.isSuccess : true;

  const localDismissed =
    typeof window !== 'undefined' && localStorage.getItem(storageKey) === 'true';
  const serverDismissed =
    isAuthenticated && query.isSuccess ? Boolean(popups?.[storageKey]) : false;

  const isDismissed = localDismissed || serverDismissed;

  const dismiss = useCallback(() => {
    localStorage.setItem(storageKey, 'true');

    if (isAuthenticated) {
      mutation.mutate({
        generator: POPUP_GENERATOR,
        key: storageKey,
        value: true,
      });
    }
  }, [storageKey, isAuthenticated, mutation]);

  useEffect(() => {
    const wasAuthenticated = prevAuthRef.current;
    prevAuthRef.current = isAuthenticated;

    if (!wasAuthenticated && isAuthenticated && query.isSuccess) {
      for (const key of POPUP_KEYS) {
        const localValue = localStorage.getItem(key);
        const serverValue = Boolean(popups?.[key]);

        if (localValue === 'true' && !serverValue) {
          mutation.mutate({
            generator: POPUP_GENERATOR,
            key,
            value: true,
          });
        }
      }
    }
  }, [isAuthenticated, query.isSuccess, popups, mutation]);

  return { isDismissed, dismiss, isHydrated: isHydratedForAuth };
};

export default usePopupDismiss;
