/* eslint-disable react-hooks/refs, no-console --
   Dev-only render counter: intentionally reads and mutates a ref during render and
   logs via console.debug. No-ops in production (early return below). */
import { useRef } from 'react';

export const useRenderCount = (name: string) => {
  const count = useRef(0);
  if (import.meta.env.PROD) return;
  count.current++;
  if (count.current > 1) {
    console.debug(`[render] ${name} #${count.current}`);
  }
};
