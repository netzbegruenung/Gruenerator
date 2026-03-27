'use client';

import { type ReactNode, useMemo, useCallback, useRef } from 'react';
import {
  AuiProvider,
  AssistantRuntimeProvider,
  useAui,
  useLocalRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { VoxtralDictationAdapter } from '@gruenerator/voice';
import {
  createNotebookModelAdapter,
  type NotebookAdapterConfig,
  type NotebookMessageMetadata,
} from './NotebookModelAdapter';

interface NotebookCollection {
  id: string;
  name: string;
  linkType?: string;
}

export interface NotebookChatProviderProps {
  children: ReactNode;
  collections: NotebookCollection[];
  locale?: string;
  filters?: Record<string, unknown>;
  extraParams?: Record<string, unknown>;
  initialMessages?: readonly ThreadMessageLike[];
  onComplete?: (metadata: NotebookMessageMetadata) => void;
  onThreadCreated?: (threadId: string) => void;
  mode?: 'fast' | 'deep';
  endpoint?: string;
  documentIds?: string[];
  threadId?: string | null;
  provider?: string;
  model?: string;
}

/**
 * Resets the AUI context so useLocalRuntime creates a standalone runtime
 * instead of detecting the parent GrueneratorChatProvider and entering
 * nesting mode (which leaves thread list methods unimplemented).
 */
function NotebookAuiReset({ children }: { children: ReactNode }) {
  const freshAui = useAui({}, { parent: null });
  return <AuiProvider value={freshAui}>{children}</AuiProvider>;
}

function NotebookChatProviderInner({
  children,
  collections,
  locale,
  filters,
  extraParams,
  initialMessages,
  onComplete,
  onThreadCreated,
  mode,
  endpoint,
  documentIds,
  threadId: initialThreadId,
  provider,
  model,
}: NotebookChatProviderProps) {
  const isMulti = collections.length > 1;
  // Use a ref for threadId so adapter is not recreated when it changes mid-conversation
  const threadIdRef = useRef<string | null>(initialThreadId || null);

  const handleThreadCreated = useCallback(
    (newThreadId: string) => {
      threadIdRef.current = newThreadId;
      onThreadCreated?.(newThreadId);
    },
    [onThreadCreated]
  );

  const getConfig = useCallback(
    (): NotebookAdapterConfig => ({
      ...(isMulti
        ? { collectionIds: collections.map((c) => c.id) }
        : { collectionId: collections[0]?.id }),
      collectionLinkType: isMulti ? 'url' : collections[0]?.linkType,
      filters,
      locale,
      extraParams,
      mode,
      endpoint,
      documentIds,
      threadId: threadIdRef.current,
      provider,
      model,
    }),
    [
      collections,
      isMulti,
      filters,
      locale,
      extraParams,
      mode,
      endpoint,
      documentIds,
      provider,
      model,
    ]
  );

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stableOnComplete = useCallback((metadata: NotebookMessageMetadata) => {
    onCompleteRef.current?.(metadata);
  }, []);

  const handleThreadCreatedRef = useRef(handleThreadCreated);
  handleThreadCreatedRef.current = handleThreadCreated;

  const stableOnThreadCreated = useCallback((tid: string) => {
    handleThreadCreatedRef.current(tid);
  }, []);

  const adapter = useMemo(
    () =>
      createNotebookModelAdapter(getConfig, {
        onComplete: stableOnComplete,
        onThreadCreated: stableOnThreadCreated,
      }),
    [getConfig, stableOnComplete, stableOnThreadCreated]
  );

  const prevAdapterRef = useRef(adapter);
  if (prevAdapterRef.current !== adapter) {
    console.debug('[Notebook] ⚠ Adapter RECREATED — will reinitialize runtime');
    prevAdapterRef.current = adapter;
  }

  const dictationAdapter = useMemo(() => new VoxtralDictationAdapter(), []);

  const runtime = useLocalRuntime(adapter, {
    initialMessages,
    adapters: { dictation: dictationAdapter },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

export function NotebookChatProvider(props: NotebookChatProviderProps) {
  return (
    <NotebookAuiReset>
      <NotebookChatProviderInner {...props} />
    </NotebookAuiReset>
  );
}
