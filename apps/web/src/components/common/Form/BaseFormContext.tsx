import { createContext, useContext } from 'react';

interface BaseFormContextValue {
  isStartMode: boolean;
}

const BaseFormContext = createContext<BaseFormContextValue>({ isStartMode: false });

export const BaseFormProvider = BaseFormContext.Provider;

export function useBaseFormContext(): BaseFormContextValue {
  return useContext(BaseFormContext);
}
