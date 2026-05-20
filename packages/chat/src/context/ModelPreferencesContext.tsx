'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { type TextModelId } from '@gruenerator/shared/models';

export interface ModelPreferencesContextValue {
  enabledModelIds: ReadonlySet<TextModelId> | null;
}

const ModelPreferencesContext = createContext<ModelPreferencesContextValue>({
  enabledModelIds: null,
});

interface ModelPreferencesProviderProps {
  children: ReactNode;
  enabledModelIds?: ReadonlySet<TextModelId> | null;
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
