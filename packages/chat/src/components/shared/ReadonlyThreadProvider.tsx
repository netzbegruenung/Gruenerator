'use client';

import {
  AuiProvider,
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { type ReactNode } from 'react';

import { MarkdownStreamingProvider } from '../../context/MarkdownStreamingContext';
import { ReadonlyModeContext } from '../../context/ReadonlyModeContext';
import { useFeedbackAdapter } from '../../runtime/useFeedbackAdapter';

export interface ReadonlyThreadProviderProps {
  /** The finished transcript, e.g. from convertToThreadMessageLike(). */
  messages: readonly ThreadMessageLike[];
  children: ReactNode;
}

/**
 * Isolated, immutable runtime for rendering a finished transcript — the
 * shared thread archive ("assistant-ui shared conversation" pattern, built
 * from our own components).
 *
 * `<AuiProvider value={null}>` resets the AUI context so useLocalRuntime
 * creates a standalone runtime instead of nesting under a surrounding
 * GrueneratorChatProvider (same trick as NotebookChatProvider). The model
 * adapter is unreachable: no composer is rendered and ReadonlyModeContext
 * hides every mutating affordance.
 */
export function ReadonlyThreadProvider({ messages, children }: ReadonlyThreadProviderProps) {
  return (
    <AuiProvider value={null}>
      <ReadonlyThreadProviderInner messages={messages}>{children}</ReadonlyThreadProviderInner>
    </AuiProvider>
  );
}

const readonlyAdapter: ChatModelAdapter = {
  run() {
    throw new Error('Dieser Chat ist schreibgeschützt.');
  },
};

function ReadonlyThreadProviderInner({ messages, children }: ReadonlyThreadProviderProps) {
  // ReadonlyModeContext hides the thumbs, but the guard in
  // useFeedbackAdapter.vitest.ts requires every local runtime to register the
  // adapter — assistant-ui throws "Feedback adapter not configured" the moment
  // a feedback control renders, and surfaces have been missed twice before.
  const feedbackAdapter = useFeedbackAdapter();
  const runtime = useLocalRuntime(readonlyAdapter, {
    initialMessages: messages,
    adapters: { feedback: feedbackAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReadonlyModeContext.Provider value={true}>
        <MarkdownStreamingProvider smooth={false}>{children}</MarkdownStreamingProvider>
      </ReadonlyModeContext.Provider>
    </AssistantRuntimeProvider>
  );
}
