import { lazy } from 'react';

import { isChunkLoadError } from './chunkErrors';

import type { ComponentType } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error instanceof Error ? error : null)) {
        await new Promise((r) => setTimeout(r, 500));
        return factory();
      }
      throw error;
    }
  });
}
