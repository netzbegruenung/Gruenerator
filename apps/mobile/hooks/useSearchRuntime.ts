import { useLocalRuntime } from '@assistant-ui/react-native';
import {
  createGrueneratorModelAdapter,
  useChatConfigStore,
  createChatApiClient,
  type GrueneratorAdapterConfig,
} from '@gruenerator/chat';
import { useCallback, useMemo } from 'react';

type SearchMode = 'web' | 'deep';

export function useSearchRuntime(searchMode: SearchMode) {
  const getConfig = useCallback(
    (): GrueneratorAdapterConfig => ({
      threadMode: 'search',
      searchMode,
    }),
    [searchMode]
  );

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const apiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  const callbacks = useMemo(() => ({}), []);
  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, callbacks),
    [getConfig, callbacks]
  );

  return useLocalRuntime(modelAdapter);
}
