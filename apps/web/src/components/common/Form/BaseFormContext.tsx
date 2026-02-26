import { createContext, useContext } from 'react';

interface BaseFormContextValue {
  isStartMode: boolean;
  hasContent: boolean;
}

const BaseFormContext = createContext<BaseFormContextValue>({
  isStartMode: false,
  hasContent: false,
});

export const BaseFormProvider = BaseFormContext.Provider;

export function useBaseFormContext(): BaseFormContextValue {
  return useContext(BaseFormContext);
}
