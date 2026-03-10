import { useState, useCallback } from 'react';

export interface UseCanvasBackgroundLockReturn {
  isBackgroundLocked: boolean;
  toggleBackgroundLock: () => void;
  setIsBackgroundLocked: (locked: boolean) => void;
  handleLockRestore: (state: Record<string, unknown>) => void;
  collectLockState: () => { isBackgroundLocked: boolean };
}

/**
 * useCanvasBackgroundLock - Manages the locked state of the canvas background
 * Includes helpers for state collection and restoration for the history system
 */
export function useCanvasBackgroundLock(initialLocked = true): UseCanvasBackgroundLockReturn {
  const [isBackgroundLocked, setIsBackgroundLocked] = useState(initialLocked);

  const toggleBackgroundLock = useCallback(() => {
    setIsBackgroundLocked((prev) => !prev);
  }, []);

  const handleLockRestore = useCallback((state: Record<string, unknown>) => {
    if (state.isBackgroundLocked !== undefined) {
      setIsBackgroundLocked(state.isBackgroundLocked as boolean);
    }
  }, []);

  const collectLockState = useCallback(
    () => ({
      isBackgroundLocked,
    }),
    [isBackgroundLocked]
  );

  return {
    isBackgroundLocked,
    toggleBackgroundLock,
    setIsBackgroundLocked,
    handleLockRestore,
    collectLockState,
  };
}
