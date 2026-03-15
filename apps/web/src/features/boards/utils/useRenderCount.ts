import { useRef } from 'react';

export const useRenderCount = (name: string) => {
  const count = useRef(0);
  if (import.meta.env.PROD) return;
  count.current++;
  if (count.current > 1) {
    console.debug(`[render] ${name} #${count.current}`);
  }
};
