import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { HiDocumentText, HiInformationCircle } from 'react-icons/hi';
import { CitationModal } from '../../../components/common/Citation';
import ChatWorkbenchLayout from '../../../components/common/Chat/ChatWorkbenchLayout';
import useNotebookStore from '../stores/notebookStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useNotebookChatLogic from '../hooks/useNotebookChatLogic.jsx';
import NotebookChatMessage from './NotebookChatMessage';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import '../../../assets/styles/features/notebook/notebook-chat.css';

const NotebookChat = () => {
  const { id } = useParams();
  const { user } = useOptimizedAuth();
  const { getQACollection, fetchQACollections, qaCollections, loading: storeLoading } = useNotebookStore();
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCollection = async () => {
      setLoading(true);
      let found = getQACollection(id);
      if (!found) {
        await fetchQACollections();
        found = getQACollection(id);
      }
      setCollection(found);
      setLoading(false);
    };
    if (id && user) loadCollection();
  }, [id, getQACollection, fetchQACollections, user, qaCollections]);

  const {
    chatMessages, inputValue, submitLoading, isMobileView,
    setInputValue, handleSubmitQuestion
  } = useNotebookChatLogic({
    collectionId: id,
    welcomeMessage: collection ? `Hallo! Ich bin bereit, Fragen zu Ihrem Notebook "${collection.name}" zu beantworten. Stellen Sie mir gerne eine Frage zu den Dokumenten.` : null
  });

  if (loading) return <div className="notebook-chat-error"><p>Notebook wird geladen...</p></div>;

  if (!collection) {
    return (
      <div className="notebook-chat-error">
        <p>Notebook nicht gefunden oder Sie haben keine Berechtigung darauf zuzugreifen.</p>
        <p>Collection ID: {id}</p>
        <p>User ID: {user?.id}</p>
        <p>Store Loading: {storeLoading ? 'Yes' : 'No'}</p>
        <p>Collections in Store: {qaCollections?.length || 0}</p>
        <p>Available Collection IDs: {qaCollections?.map(c => c.id).join(', ') || 'None'}</p>
      </div>
    );
  }

  const documents = collection.documents || collection.notebook_collection_documents?.map(qcd => qcd.documents) || [];

  const renderInfoPanel = () => (
    <div className="qa-collection-info">
      <div className="qa-collection-info-header">
        <HiInformationCircle className="qa-collection-info-icon" />
        <h3>{collection.name}</h3>
      </div>
      {collection.description && <div className="qa-collection-info-description">{collection.description}</div>}
      <div className="qa-collection-info-documents">
        <h4>Enthaltene Dokumente:</h4>
        <ul>
          {documents.map((doc, i) => (
            <li key={doc.id || i}>
              <HiDocumentText className="document-icon" />
              <span>{doc.title || doc.name || `Dokument ${i + 1}`}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const effectiveMode = 'chat';

  const renderMessage = useCallback((msg, i) => (
    <NotebookChatMessage key={msg.timestamp || `msg-${i}`} msg={msg} index={i} />
  ), []);

  return (
    <>
      <CitationModal />
      <ChatWorkbenchLayout
        mode={effectiveMode}
        onModeChange={() => {}}
        title={collection.name}
        messages={chatMessages}
        onSubmit={handleSubmitQuestion}
        isProcessing={submitLoading}
        placeholder="Stellen Sie eine Frage zu den Dokumenten..."
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={submitLoading}
        renderMessage={renderMessage}
        infoPanelContent={isMobileView ? null : renderInfoPanel()}
        enableVoiceInput={true}
        hideHeader={true}
        hideModeSelector={true}
        singleLine={true}
      />
    </>
  );
};

export default withAuthRequired(NotebookChat, {
  title: 'Q&A Notebook'
});
