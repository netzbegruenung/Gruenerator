'use client';

import { createContext, useContext } from 'react';

/**
 * True inside a read-only transcript view (the shared thread archive).
 * Message components consult it to hide mutating affordances — the user
 * message edit button, regenerate, feedback thumbs — that would either
 * throw on the no-op runtime or write into someone else's thread.
 */
export const ReadonlyModeContext = createContext(false);

export function useReadonlyMode(): boolean {
  return useContext(ReadonlyModeContext);
}
