import { ThreadPrimitive } from '@assistant-ui/react';
import {
  NotebookChatProvider,
  NotebookComposer,
  UserMessage,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

import { CitationModal } from '../../../components/common/Citation';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { type NotebookCollection } from '../../../types/notebook';
import { useNotebookChatBridge } from '../hooks/useNotebookChatBridge';
import useNotebookStore from '../stores/notebookStore';

import { NotebookAssistantMessage } from './NotebookAssistantMessage';
import { NotebookStartPage } from './NotebookStartPage';

import '../../../assets/styles/features/notebook/notebook-chat.css';
import '../../../components/common/Chat/ChatStartPage.css';

const NotebookChat = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useOptimizedAuth();
  const {
    getQACollection,
    fetchQACollections,
    qaCollections,
    loading: storeLoading,
  } = useNotebookStore();
  const [collection, setCollection] = useState<NotebookCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCollection = async () => {
      if (!id) return;
      setLoading(true);
      let found = getQACollection(id);
      if (!found) {
        await fetchQACollections();
        found = getQACollection(id);
      }
      setCollection(found || null);
      setLoading(false);
    };
    if (id && user) void loadCollection();
  }, [id, getQACollection, fetchQACollections, user, qaCollections]);

  const collections = collection ? [{ id: collection.id, name: collection.name }] : [];

  const { initialMessages, onComplete } = useNotebookChatBridge({
    collections,
    welcomeMessage: collection
      ? `Hallo! Ich bin bereit, Fragen zu Ihrem Notebook "${collection.name}" zu beantworten. Stellen Sie mir gerne eine Frage zu den Dokumenten.`
      : undefined,
    persistMessages: true,
  });

  if (loading)
    return (
      <div className="notebook-chat-error">
        <p>Notebook wird geladen...</p>
      </div>
    );

  if (!collection) {
    return (
      <div className="notebook-chat-error">
        <p>Notebook nicht gefunden oder Sie haben keine Berechtigung darauf zuzugreifen.</p>
        <p>Collection ID: {id}</p>
        <p>User ID: {user?.id}</p>
        <p>Store Loading: {storeLoading ? 'Yes' : 'No'}</p>
        <p>Collections in Store: {qaCollections?.length || 0}</p>
        <p>
          Available Collection IDs:{' '}
          {qaCollections?.map((c: NotebookCollection) => c.id).join(', ') || 'None'}
        </p>
      </div>
    );
  }

  return (
    <>
      <CitationModal />
      <NotebookChatProvider
        collections={[
          {
            id: collection.id,
            name: collection.name,
            linkType: (collection as NotebookCollection & { linkType?: string }).linkType,
          },
        ]}
        initialMessages={initialMessages}
        onComplete={onComplete as (metadata: NotebookMessageMetadata) => void}
      >
        <div className="qa-chat-container">
          <ThreadPrimitive.Root className="flex h-full flex-col">
            <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto px-4">
              <ThreadPrimitive.Empty>
                <NotebookStartPage title={`Fragen zu "${collection.name || 'Notebook'}"`} />
              </ThreadPrimitive.Empty>
              <div className="mx-auto w-full max-w-3xl flex flex-col gap-4 py-4">
                <ThreadPrimitive.Messages
                  components={{
                    UserMessage,
                    AssistantMessage: NotebookAssistantMessage,
                  }}
                />
              </div>
            </ThreadPrimitive.Viewport>
            <NotebookComposer placeholder="Stellen Sie eine Frage zu den Dokumenten..." />
          </ThreadPrimitive.Root>
        </div>
      </NotebookChatProvider>
    </>
  );
};

export default withAuthRequired(NotebookChat, {
  title: 'Q&A Notebook',
});
