'use client';

import { createContext, useContext } from 'react';

/**
 * True where an assistant answer may be turned into an Explainable ("Einfach
 * erklären"). Set by the surface, not by the message: only notebook answers are
 * persisted with the sources the backend copies into the explainable.
 */
const ExplainableActionContext = createContext(false);

export const ExplainableActionProvider = ExplainableActionContext.Provider;

export function useExplainableActionEnabled(): boolean {
  return useContext(ExplainableActionContext);
}
