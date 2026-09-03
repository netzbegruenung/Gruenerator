import { useEffect, useState } from 'react';

/**
 * Copied from apps/web/src/components/hooks/useDebounce.ts — packages/chat
 * cannot import from an app, and @gruenerator/shared has no debounce hook.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}
