import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react-native';
import {
  convertNotebookLoadedMessages,
  createThreadHistoryAdapter,
  toNotebookAnswerMode,
  transformMessageLike,
  useNotebookChatAdapter,
} from '@gruenerator/chat';
import { useAuth } from '@gruenerator/shared/hooks';
import { type ReactNode, useState } from 'react';

import { getResearchCollectionIds } from '../config/notebooksConfig';
import { getMobileChatApiClient } from '../services/chatConfig';
import { useNotebookFilterStore } from '../stores/notebookFilterStore';
import { usePreferencesStore } from '../stores/preferencesStore';

interface MobileNotebookChatProviderProps {
  children: ReactNode;
  /** Registry id of a system notebook, or the UUID of a user notebook. */
  notebookId: string;
  /** An existing conversation to continue; omitted for a new one. */
  threadId?: string | null;
}

/** The collections a notebook asks: system notebooks resolve to their
 *  `*-system` ids, a user notebook (UUID) is its own single collection. The
 *  source picker narrows an aggregate notebook while it belongs to this one. */
function readCollectionIds(notebookId: string): string[] {
  const filter = useNotebookFilterStore.getState();
  if (filter.notebookId === notebookId && filter.collectionIds) return filter.collectionIds;
  const research = getResearchCollectionIds(notebookId);
  return research.length > 0 ? research : [notebookId];
}

/**
 * Notebook QA on mobile — the same adapter web's `NotebookChatProvider` runs
 * (`/api/chat-service/notebook/stream`, Magic Search's first-turn intent,
 * citations), in a react-native runtime. Its config comes from the route and
 * is read at request time, never from the chat screen's agent store, so no
 * agent selected elsewhere can turn a notebook question into an agent chat.
 */
export function MobileNotebookChatProvider({
  children,
  notebookId,
  threadId,
}: MobileNotebookChatProviderProps) {
  const { locale } = useAuth();
  const answerMode = usePreferencesStore((s) => s.notebookAnswerMode);
  const depth = usePreferencesStore((s) => s.notebookDepth);

  const adapter = useNotebookChatAdapter({
    collections: readCollectionIds(notebookId).map((id) => ({ id, name: id })),
    locale: locale ?? 'de-DE',
    getFilters: () => {
      const filter = useNotebookFilterStore.getState();
      return filter.notebookId === notebookId ? filter.keywordFilters : undefined;
    },
    mode: depth,
    answerMode: toNotebookAnswerMode(answerMode),
    magicSearch: answerMode === 'auto',
    threadId: threadId ?? null,
  });

  // Only the mount value matters: the runtime loads history once, when it is
  // created; a thread minted later in this session already has its messages.
  const [historyAdapter] = useState(() =>
    threadId
      ? createThreadHistoryAdapter(
          threadId,
          getMobileChatApiClient(),
          convertNotebookLoadedMessages,
          transformMessageLike
        )
      : null
  );

  const runtime = useLocalRuntime(adapter, {
    ...(historyAdapter ? { adapters: { history: historyAdapter } } : {}),
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
