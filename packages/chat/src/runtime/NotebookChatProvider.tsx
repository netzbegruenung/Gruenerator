'use client';

import { type ReactNode, useMemo, useCallback, useRef } from 'react';
import {
  AuiProvider,
  AssistantRuntimeProvider,
  useAui,
  useLocalRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
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
}: NotebookChatProviderProps) {
  const isMulti = collections.length > 1;

  const getConfig = useCallback(
    (): NotebookAdapterConfig => ({
      ...(isMulti
        ? { collectionIds: collections.map((c) => c.id) }
        : { collectionId: collections[0]?.id }),
      collectionLinkType: isMulti ? 'url' : collections[0]?.linkType,
      filters,
      locale,
      extraParams,
    }),
    [collections, isMulti, filters, locale, extraParams]
  );

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stableOnComplete = useCallback((metadata: NotebookMessageMetadata) => {
    onCompleteRef.current?.(metadata);
  }, []);

  const adapter = useMemo(
    () => createNotebookModelAdapter(getConfig, { onComplete: stableOnComplete }),
    [getConfig, stableOnComplete]
  );

  const runtime = useLocalRuntime(adapter, { initialMessages });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}

export function NotebookChatProvider(props: NotebookChatProviderProps) {
  return (
    <NotebookAuiReset>
      <NotebookChatProviderInner {...props} />
    </NotebookAuiReset>
  );
}
