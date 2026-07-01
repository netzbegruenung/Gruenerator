import { lazy } from 'react';

// Lazy so recharts (heavy) only enters the bundle chunk when a message actually
// contains a ```chart block — mirrors the on-demand load of the mermaid library.
export const LazyChatChart = lazy(async () => {
  const { ChatChart } = await import('@gruenerator/ui');
  return { default: ChatChart };
});
