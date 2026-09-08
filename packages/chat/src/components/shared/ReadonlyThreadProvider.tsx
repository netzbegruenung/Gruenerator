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
  const runtime = useLocalRuntime(readonlyAdapter, { initialMessages: messages });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReadonlyModeContext.Provider value={true}>
        <MarkdownStreamingProvider smooth={false}>{children}</MarkdownStreamingProvider>
      </ReadonlyModeContext.Provider>
    </AssistantRuntimeProvider>
  );
}
