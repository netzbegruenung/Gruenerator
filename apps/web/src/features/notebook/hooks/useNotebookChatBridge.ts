import { type ThreadMessageLike } from '@assistant-ui/react';
import { type NotebookMessageMetadata } from '@gruenerator/chat';
import { useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

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
      custom.sources = msg.resultData.sources || [];
      custom.additionalSources = msg.resultData.additionalSources || [];
      custom.linkConfig = msg.resultData.linkConfig;
      custom.question = msg.resultData.question || '';
      custom.resultId = msg.resultData.resultId || '';
      if (msg.resultData.sourcesByCollection) {
        custom.sourcesByCollection = msg.resultData.sourcesByCollection;
      }
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

  const chats = useNotebookChatStore(useShallow((state) => state.chats));
  const addMessage = useNotebookChatStore((state) => state.addMessage);
  const clearMessagesStore = useNotebookChatStore((state) => state.clearMessages);

  const initialMessages = useMemo(() => {
    if (!persistMessages) return [];
    const stored = chats[collectionKey]?.messages || [];
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
  }, [persistMessages, chats, collectionKey, welcomeMessage]);

  const onComplete = useCallback(
    (metadata: NotebookMessageMetadata) => {
      if (!persistMessages) return;

      const userName = (user?.user_metadata?.firstName as string) || user?.email || 'Sie';

      addMessage(collectionKey, {
        type: 'user',
        content: metadata.question,
        userName,
      });

      const resultId = metadata.resultId;
      addMessage(collectionKey, {
        type: 'assistant',
        content: metadata.answerText,
        resultData: {
          resultId,
          question: metadata.question,
          citations: metadata.citations,
          sources: metadata.sources,
          additionalSources: metadata.additionalSources as Array<Record<string, unknown>>,
          linkConfig: metadata.linkConfig,
          ...(metadata.sourcesByCollection && {
            sourcesByCollection: metadata.sourcesByCollection,
          }),
        },
      });

      setGeneratedText(resultId, metadata.answerText);
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
