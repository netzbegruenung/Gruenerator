import {
  type NotebookAnswerMode,
  type NotebookDepth,
  type NotebookSourceTier,
} from '@gruenerator/contracts';
import { useCallback, useMemo, useRef } from 'react';

import {
  createNotebookModelAdapter,
  type NotebookAdapterConfig,
  type NotebookMessageMetadata,
  type SharepicContextConfig,
} from './NotebookModelAdapter';

export interface NotebookCollection {
  id: string;
  name: string;
  linkType?: string;
}

export interface NotebookChatAdapterOptions {
  collections: NotebookCollection[];
  locale?: string;
  filters?: Record<string, unknown>;
  /** Getter that reads filters directly from the store at request time — bypasses React render pipeline */
  getFilters?: () => Record<string, unknown> | undefined;
  extraParams?: Record<string, unknown>;
  /** Dynamic extras evaluated per-request — used for values that must be fresh (e.g. canvas snapshot). */
  getExtraParams?: () => Record<string, unknown> | undefined;
  onComplete?: (metadata: NotebookMessageMetadata) => void;
  onThreadCreated?: (threadId: string) => void;
  mode?: NotebookDepth;
  /** Source tier sent with each request; omitted ⇒ the server ranks every source equally. */
  sourceTier?: NotebookSourceTier;
  /** Answer mode sent with each request; omitted ⇒ the server answers in chat mode. */
  answerMode?: NotebookAnswerMode;
  /** Magic Search: a first question with `auto` goes out as `chat`. */
  magicSearch?: boolean;
  endpoint?: string;
  documentIds?: string[];
  threadId?: string | null;
  /** Optional sharepic context auto-attached to every message (canvas-editor chat). */
  sharepicContext?: SharepicContextConfig;
  /** Called for SSE events the adapter does not recognize (e.g. canvas_operations). */
  onCustomEvent?: (event: string, data: unknown) => void;
}

/**
 * The notebook model adapter, platform-free: web's `NotebookChatProvider` and
 * mobile's notebook chat wrap it in their own assistant-ui runtime.
 */
export function useNotebookChatAdapter({
  collections,
  locale,
  filters,
  getFilters,
  extraParams,
  getExtraParams,
  onComplete,
  onThreadCreated,
  mode,
  sourceTier,
  answerMode,
  magicSearch,
  endpoint,
  documentIds,
  threadId: initialThreadId,
  sharepicContext,
  onCustomEvent,
}: NotebookChatAdapterOptions) {
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
  const sourceTierRef = useRef(sourceTier);
  sourceTierRef.current = sourceTier;
  const answerModeRef = useRef(answerMode);
  answerModeRef.current = answerMode;
  const magicSearchRef = useRef(magicSearch);
  magicSearchRef.current = magicSearch;
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
      ...(sourceTierRef.current ? { sourceTier: sourceTierRef.current } : {}),
      ...(answerModeRef.current ? { answerMode: answerModeRef.current } : {}),
      ...(magicSearchRef.current ? { magicSearch: true } : {}),
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

  return adapter;
}
