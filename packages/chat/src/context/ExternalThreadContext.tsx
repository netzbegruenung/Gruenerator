'use client';

import { createContext, useContext } from 'react';

export interface ExternalThreadContextValue {
  onClick: (externalId: string) => void;
  activePath?: string;
}

const ExternalThreadContext = createContext<ExternalThreadContextValue | null>(null);

export const ExternalThreadProvider = ExternalThreadContext.Provider;

export function useExternalThread() {
  return useContext(ExternalThreadContext);
}
