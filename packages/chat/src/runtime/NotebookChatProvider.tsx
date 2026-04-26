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
import { MarkdownStreamingProvider } from '../context/MarkdownStreamingContext';
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
  /** Getter that reads filters directly from the store at request time — bypasses React render pipeline */
  getFilters?: () => Record<string, unknown> | undefined;
  extraParams?: Record<string, unknown>;
  initialMessages?: readonly ThreadMessageLike[];
  onComplete?: (metadata: NotebookMessageMetadata) => void;
  onThreadCreated?: (threadId: string) => void;
  mode?: 'fast' | 'deep';
  endpoint?: string;
  documentIds?: string[];
  threadId?: string | null;
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
  getFilters,
  extraParams,
  initialMessages,
  onComplete,
  onThreadCreated,
  mode,
  endpoint,
  documentIds,
  threadId: initialThreadId,
}: NotebookChatProviderProps) {
  const isMulti = collections.length > 1;
  // Refs for all config inputs so the adapter — and therefore the AUI runtime
  // — is created exactly once per provider mount. Without this, any prop
  // identity churn upstream (e.g. config.collections rebuilt by getNotebookConfig
  // on every render, or a fresh documentIds array) recreates the adapter,
  // reinitializes assistant-ui's runtime, and resets scroll/streaming state.
  const threadIdRef = useRef<string | null>(initialThreadId || null);
  const getFiltersRef = useRef(getFilters);
  getFiltersRef.current = getFilters;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const collectionsRef = useRef(collections);
  collectionsRef.current = collections;
  const isMultiRef = useRef(isMulti);
  isMultiRef.current = isMulti;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const extraParamsRef = useRef(extraParams);
  extraParamsRef.current = extraParams;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;
  const documentIdsRef = useRef(documentIds);
  documentIdsRef.current = documentIds;

  const handleThreadCreated = useCallback(
    (newThreadId: string) => {
      threadIdRef.current = newThreadId;
      onThreadCreated?.(newThreadId);
    },
    [onThreadCreated]
  );

  const getConfig = useCallback((): NotebookAdapterConfig => {
    const cs = collectionsRef.current;
    const multi = isMultiRef.current;
    return {
      ...(multi ? { collectionIds: cs.map((c) => c.id) } : { collectionId: cs[0]?.id }),
      collectionLinkType: multi ? 'url' : cs[0]?.linkType,
      filters: getFiltersRef.current?.() ?? filtersRef.current,
      locale: localeRef.current,
      extraParams: extraParamsRef.current,
      mode: modeRef.current,
      endpoint: endpointRef.current,
      documentIds: documentIdsRef.current,
      threadId: threadIdRef.current,
    };
  }, []);

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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <MarkdownStreamingProvider smooth={false}>{children}</MarkdownStreamingProvider>
    </AssistantRuntimeProvider>
  );
}

export function NotebookChatProvider(props: NotebookChatProviderProps) {
  return (
    <NotebookAuiReset>
      <NotebookChatProviderInner {...props} />
    </NotebookAuiReset>
  );
}
