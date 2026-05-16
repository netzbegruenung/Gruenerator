'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { type ModelId } from '@gruenerator/shared/models';

export interface ModelPreferencesContextValue {
  enabledModelIds: ReadonlySet<ModelId> | null;
}

const ModelPreferencesContext = createContext<ModelPreferencesContextValue>({
  enabledModelIds: null,
});

interface ModelPreferencesProviderProps {
  children: ReactNode;
  enabledModelIds?: ReadonlySet<ModelId> | null;
}

export function ModelPreferencesProvider({
  children,
  enabledModelIds = null,
}: ModelPreferencesProviderProps) {
  const value = useMemo<ModelPreferencesContextValue>(
    () => ({ enabledModelIds: enabledModelIds ?? null }),
    [enabledModelIds]
  );
  return (
    <ModelPreferencesContext.Provider value={value}>{children}</ModelPreferencesContext.Provider>
  );
}

export function useModelPreferencesContext(): ModelPreferencesContextValue {
  return useContext(ModelPreferencesContext);
}
