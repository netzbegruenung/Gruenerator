'use client';

import {
  AuiProvider,
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { type NotebookDepth } from '@gruenerator/contracts';
import { VoxtralDictationAdapter } from '@gruenerator/voice';
import { type ReactNode, useMemo, useCallback, useRef, useState } from 'react';

import { createNotebookHistoryAdapter } from '../adapters/notebookHistoryAdapter';
import { MarkdownStreamingProvider } from '../context/MarkdownStreamingContext';
import { handleDictationError } from '../lib/dictationErrorHandler';

import { GrueneratorAttachmentAdapter } from './GrueneratorAttachmentAdapter';
import { MESSAGE_QUEUE_ENABLED } from './messageQueueFlag';
import {
  createNotebookModelAdapter,
  type NotebookAdapterConfig,
  type NotebookMessageMetadata,
  type SharepicContextConfig,
} from './NotebookModelAdapter';
import { useFeedbackAdapter } from './useFeedbackAdapter';

interface NotebookCollection {
  id: string;
  name: string;
  linkType?: string;
}

/**
 * Re-exported from NotebookModelAdapter so consumers can import the type
 * alongside `NotebookChatProvider`. Used by the canvas-editor's in-section
 * chat to auto-include the rendered sharepic image, structured text, and a
 * custom system prompt on every message.
 */
export type SharepicContext = SharepicContextConfig;

export interface NotebookChatProviderProps {
  children: ReactNode;
  collections: NotebookCollection[];
  locale?: string;
  filters?: Record<string, unknown>;
  /** Getter that reads filters directly from the store at request time — bypasses React render pipeline */
  getFilters?: () => Record<string, unknown> | undefined;
  extraParams?: Record<string, unknown>;
  /** Dynamic extras evaluated per-request — used for values that must be fresh (e.g. canvas snapshot). */
  getExtraParams?: () => Record<string, unknown> | undefined;
  initialMessages?: readonly ThreadMessageLike[];
  onComplete?: (metadata: NotebookMessageMetadata) => void;
  onThreadCreated?: (threadId: string) => void;
  mode?: NotebookDepth;
  endpoint?: string;
  documentIds?: string[];
  threadId?: string | null;
  /** Optional sharepic context auto-attached to every message (canvas-editor chat). */
  sharepicContext?: SharepicContext;
  /** Called for SSE events the adapter does not recognize (e.g. canvas_operations). */
  onCustomEvent?: (event: string, data: unknown) => void;
}

/**
 * Resets the AUI context so useLocalRuntime creates a standalone runtime
 * instead of detecting the parent GrueneratorChatProvider and entering
 * nesting mode (which leaves thread list methods unimplemented).
 */
function NotebookAuiReset({ children }: { children: ReactNode }) {
  return <AuiProvider value={null}>{children}</AuiProvider>;
}

function NotebookChatProviderInner({
  children,
  collections,
  locale,
  filters,
  getFilters,
  extraParams,
  getExtraParams,
  initialMessages,
  onComplete,
  onThreadCreated,
  mode,
  endpoint,
  documentIds,
  threadId: initialThreadId,
  sharepicContext,
  onCustomEvent,
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
  const sharepicContextRef = useRef(sharepicContext);
  sharepicContextRef.current = sharepicContext;
  const getExtraParamsRef = useRef(getExtraParams);
  getExtraParamsRef.current = getExtraParams;
  const onCustomEventRef = useRef(onCustomEvent);
  onCustomEventRef.current = onCustomEvent;

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
    const stableGetExtraParams = (): Record<string, unknown> | undefined =>
      getExtraParamsRef.current?.();
    const stableOnCustomEvent = (event: string, data: unknown): void => {
      onCustomEventRef.current?.(event, data);
    };
    return {
      ...(multi ? { collectionIds: cs.map((c) => c.id) } : { collectionId: cs[0]?.id }),
      collectionLinkType: multi ? 'url' : cs[0]?.linkType,
      filters: getFiltersRef.current?.() ?? filtersRef.current,
      locale: localeRef.current,
      extraParams: extraParamsRef.current,
      getExtraParams: stableGetExtraParams,
      mode: modeRef.current,
      endpoint: endpointRef.current,
      documentIds: documentIdsRef.current,
      threadId: threadIdRef.current,
      sharepicContext: sharepicContextRef.current,
      onCustomEvent: stableOnCustomEvent,
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

  const dictationAdapter = useMemo(
    () => new VoxtralDictationAdapter({ onError: handleDictationError }),
    []
  );
  const attachmentAdapter = useMemo(() => new GrueneratorAttachmentAdapter(), []);
  // AssistantMessage shows the thumbs whenever the turn carries a traceId, and
  // assistant-ui throws "Feedback adapter not configured" without this.
  const feedbackAdapter = useFeedbackAdapter();

  // Only the mount value matters: the runtime loads history exactly once, when
  // it is created. A thread minted later in this session already has its
  // messages in the runtime, so there is nothing to load for it.
  const [historyAdapter] = useState(() =>
    initialThreadId ? createNotebookHistoryAdapter(initialThreadId) : null
  );

  const runtime = useLocalRuntime(adapter, {
    initialMessages,
    unstable_enableMessageQueue: MESSAGE_QUEUE_ENABLED,
    adapters: {
      dictation: dictationAdapter,
      attachments: attachmentAdapter,
      feedback: feedbackAdapter,
      ...(historyAdapter ? { history: historyAdapter } : {}),
    },
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
