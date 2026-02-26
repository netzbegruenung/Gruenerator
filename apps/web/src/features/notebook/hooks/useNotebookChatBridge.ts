import { type ThreadMessageLike } from '@assistant-ui/react';
import { type NotebookMessageMetadata } from '@gruenerator/chat';
import { useMemo, useCallback, useEffect, useRef } from 'react';

import { useOptimizedAuth } from '../../../hooks/useAuth';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';
import { useNotebookChatStore, type NotebookChatMessage } from '../stores/notebookChatStore';

interface Collection {
  id: string;
  name: string;
  linkType?: string;
}

interface UseNotebookChatBridgeOptions {
  collections: Collection[];
  persistMessages?: boolean;
  welcomeMessage?: string;
  freshConversation?: boolean;
}

function convertToThreadMessages(messages: NotebookChatMessage[]): ThreadMessageLike[] {
  return messages.map((msg) => {
    if (msg.type === 'user') {
      return {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: msg.content }],
        id: msg.id,
      };
    }

    const custom: Record<string, unknown> = {};
    if (msg.resultData) {
      custom.citations = msg.resultData.citations || [];
      custom.chatCitations = msg.resultData.chatCitations || [];
      custom.sources = msg.resultData.sources || [];
      custom.additionalSources = msg.resultData.additionalSources || [];
      custom.linkConfig = msg.resultData.linkConfig;
      custom.question = msg.resultData.question || '';
      custom.resultId = msg.resultData.resultId || '';
      if (msg.resultData.sourcesByCollection) {
        custom.sourcesByCollection = msg.resultData.sourcesByCollection;
      }
      console.debug(
        '[Notebook] Restoring message: citations=%d, chatCitations=%d',
        (custom.citations as unknown[])?.length ?? 0,
        (custom.chatCitations as unknown[])?.length ?? 0
      );
    }

    return {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: msg.content }],
      id: msg.id,
      ...(Object.keys(custom).length > 0 ? { metadata: { custom } } : {}),
    };
  });
}

export function useNotebookChatBridge({
  collections,
  persistMessages = true,
  welcomeMessage,
  freshConversation,
}: UseNotebookChatBridgeOptions) {
  const { user } = useOptimizedAuth();
  const { setGeneratedText, setGeneratedTextMetadata } = useGeneratedTextStore();

  const isMulti = collections.length > 1;
  const collectionKey = useMemo(() => {
    return isMulti
      ? `multi:${collections
          .map((c) => c.id)
          .sort()
          .join('+')}`
      : collections[0]?.id || 'unknown';
  }, [collections, isMulti]);

  const addMessage = useNotebookChatStore((state) => state.addMessage);
  const clearMessagesStore = useNotebookChatStore((state) => state.clearMessages);

  const freshHandled = useRef(false);
  useEffect(() => {
    if (freshConversation && !freshHandled.current) {
      freshHandled.current = true;
      clearMessagesStore(collectionKey);
      window.history.replaceState({}, '');
    }
  }, [freshConversation, collectionKey, clearMessagesStore]);

  // Read store imperatively — initialMessages is a seed value, not a live subscription.
  // This breaks the feedback loop: onComplete → addMessage → store update no longer
  // triggers initialMessages recalculation → no runtime reinitialization.
  const initialMessages = useMemo(() => {
    if (freshConversation && !freshHandled.current) return [];
    if (!persistMessages) return [];
    const stored = useNotebookChatStore.getState().chats[collectionKey]?.messages || [];
    if (stored.length === 0 && welcomeMessage) {
      return convertToThreadMessages([
        {
          type: 'assistant',
          content: welcomeMessage,
          timestamp: Date.now(),
          id: `welcome_${collectionKey}`,
        },
      ]);
    }
    return convertToThreadMessages(stored);
  }, [persistMessages, collectionKey, welcomeMessage, freshConversation]);

  const onComplete = useCallback(
    (metadata: NotebookMessageMetadata) => {
      if (!persistMessages) return;

      const t0 = performance.now();
      const userName = (user?.user_metadata?.firstName as string) || user?.email || 'Sie';
      const answerText = metadata.answerText.replace(/\[cite:(\d+)\]/g, '[$1]');

      addMessage(collectionKey, {
        type: 'user',
        content: metadata.question,
        userName,
      });

      const resultId = metadata.resultId;
      addMessage(collectionKey, {
        type: 'assistant',
        content: answerText,
        resultData: {
          resultId,
          question: metadata.question,
          citations: metadata.citations,
          chatCitations: metadata.chatCitations as unknown as Array<Record<string, unknown>>,
          sources: metadata.sources,
          additionalSources: metadata.additionalSources as Array<Record<string, unknown>>,
          linkConfig: metadata.linkConfig,
          ...(metadata.sourcesByCollection && {
            sourcesByCollection: metadata.sourcesByCollection,
          }),
        },
      });
      console.debug('[Notebook] ⏱ onComplete store writes: %.1fms', performance.now() - t0);

      setGeneratedText(resultId, answerText);
      setGeneratedTextMetadata(resultId, {
        sources: metadata.sources,
        citations: metadata.citations,
        additionalSources: metadata.additionalSources,
        ...(isMulti &&
          metadata.sourcesByCollection && {
            sourcesByCollection: metadata.sourcesByCollection,
            collections: collections.map((c) => c.id),
          }),
      });
    },
    [
      persistMessages,
      collectionKey,
      user,
      isMulti,
      collections,
      addMessage,
      setGeneratedText,
      setGeneratedTextMetadata,
    ]
  );

  const clearMessages = useCallback(() => {
    if (persistMessages) {
      clearMessagesStore(collectionKey);
    }
  }, [persistMessages, clearMessagesStore, collectionKey]);

  return {
    initialMessages,
    onComplete,
    clearMessages,
    collectionKey,
    isMulti,
  };
}
