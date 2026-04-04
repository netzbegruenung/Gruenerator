import { useCallback, useState } from 'react';

export function usePersistentDismiss(storageKey: string) {
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // localStorage unavailable
    }
  }, [storageKey]);

  return { isDismissed, dismiss };
}
