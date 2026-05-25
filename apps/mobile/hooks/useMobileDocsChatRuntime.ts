import { useLocalRuntime, type LocalRuntimeOptions } from '@assistant-ui/react-native';
import { createGrueneratorModelAdapter, type GrueneratorAdapterConfig } from '@gruenerator/chat';
import { useCallback, useMemo, useState } from 'react';

/**
 * Runtime for the in-document AI assistant. Deliberately does NOT read from the
 * global `useAgentStore` — that store drives the main chat screen, and sharing
 * it would cross-contaminate agent/model/thread between the two surfaces. The
 * config is baked (gruenerator-docs-editor, no editing in Phase 1) and the
 * created thread id is tracked in local state via onThreadCreated. The open
 * document's id/title/markdown are injected separately via a context provider
 * registered by MobileDocsChatProvider, keyed off the returned threadId.
 */
export function useMobileDocsChatRuntime() {
  // Track the server-created thread id locally (not in useAgentStore). null until
  // the first message creates a thread.
  const [threadId, setThreadId] = useState<string | null>(null);

  const getConfig = useCallback(
    (): GrueneratorAdapterConfig => ({
      agentId: 'gruenerator-docs-editor',
      modelId: '',
      enabledTools: {
        search: true,
        web: true,
        examples: true,
        pressemitteilung_examples: false,
        research: true,
      },
      threadId,
      threadMode: 'chat',
      searchMode: 'web',
      // Phase 1: Q&A only — no document editing.
      customEnabledTools: { edit_current_doc: false },
    }),
    [threadId]
  );

  const onThreadCreated = useCallback((newThreadId: string) => {
    setThreadId(newThreadId);
  }, []);

  const callbacks = useMemo(() => ({ onThreadCreated }), [onThreadCreated]);

  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, callbacks),
    [getConfig, callbacks]
  );

  const runtimeOptions: LocalRuntimeOptions = useMemo(
    () => ({
      unstable_humanToolNames: ['ask_human'],
    }),
    []
  );

  const runtime = useLocalRuntime(modelAdapter, runtimeOptions);

  return { runtime, threadId };
}
