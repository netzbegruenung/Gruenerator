'use client';

import {
  AuiProvider,
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { VoxtralDictationAdapter } from '@gruenerator/voice';
import { type ReactNode, useMemo, useState } from 'react';

import { createNotebookHistoryAdapter } from '../adapters/notebookHistoryAdapter';
import { ExplainableActionProvider } from '../context/ExplainableActionContext';
import { handleDictationError } from '../lib/dictationErrorHandler';

import { GrueneratorAttachmentAdapter } from './GrueneratorAttachmentAdapter';
import { MESSAGE_QUEUE_ENABLED } from './messageQueueFlag';
import { type SharepicContextConfig } from './NotebookModelAdapter';
import { useFeedbackAdapter } from './useFeedbackAdapter';
import { type NotebookChatAdapterOptions, useNotebookChatAdapter } from './useNotebookChatAdapter';

/**
 * Re-exported from NotebookModelAdapter so consumers can import the type
 * alongside `NotebookChatProvider`. Used by the canvas-editor's in-section
 * chat to auto-include the rendered sharepic image, structured text, and a
 * custom system prompt on every message.
 */
export type SharepicContext = SharepicContextConfig;

export interface NotebookChatProviderProps extends NotebookChatAdapterOptions {
  children: ReactNode;
  initialMessages?: readonly ThreadMessageLike[];
  /** Offer "Einfach erklären" under persisted answers (the notebook page, not embedded chats). */
  offerExplainable?: boolean;
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
  initialMessages,
  threadId: initialThreadId,
  offerExplainable = false,
  ...adapterOptions
}: NotebookChatProviderProps) {
  const adapter = useNotebookChatAdapter({ ...adapterOptions, threadId: initialThreadId });

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
    initialThreadId ? createNotebookHistoryAdapter(initialThreadId, adapter.resume) : null
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
      <ExplainableActionProvider value={offerExplainable}>{children}</ExplainableActionProvider>
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
