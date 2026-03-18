import { useCallback, useRef, useSyncExternalStore } from 'react';

import type { HocuspocusProvider } from '@hocuspocus/provider';

type AwarenessStates = Map<number, Record<string, unknown>>;

const EMPTY_SNAPSHOT = { states: new Map() as AwarenessStates, localClientId: 0 };

/**
 * Subscribe to Hocuspocus awareness state changes using useSyncExternalStore.
 * Replaces the manual useEffect + setTimeout(0) + diffing pattern.
 *
 * The selector receives all awareness states and the local client ID,
 * and should return the derived value. Results are compared with isEqual
 * to avoid unnecessary re-renders.
 */
export function useAwarenessState<T>(
  provider: HocuspocusProvider | null,
  selector: (states: AwarenessStates, localClientId: number) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const cachedRef = useRef<{ value: T; initialized: boolean }>({
    value: undefined as T,
    initialized: false,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const awareness = provider?.awareness;
      if (!awareness) return () => {};

      awareness.on('change', onStoreChange);
      return () => {
        awareness.off('change', onStoreChange);
      };
    },
    [provider]
  );

  const getSnapshot = useCallback(() => {
    const awareness = provider?.awareness;
    if (!awareness) {
      if (!cachedRef.current.initialized) {
        cachedRef.current.value = selector(EMPTY_SNAPSHOT.states, 0);
        cachedRef.current.initialized = true;
      }
      return cachedRef.current.value;
    }

    const next = selector(awareness.getStates(), awareness.clientID);

    if (cachedRef.current.initialized && isEqual(cachedRef.current.value, next)) {
      return cachedRef.current.value;
    }

    cachedRef.current.value = next;
    cachedRef.current.initialized = true;
    return next;
  }, [provider, selector, isEqual]);

  const getServerSnapshot = useCallback(() => {
    return selector(EMPTY_SNAPSHOT.states, 0);
  }, [selector]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
