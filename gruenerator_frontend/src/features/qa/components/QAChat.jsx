import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { HiDocumentText, HiInformationCircle } from 'react-icons/hi';
import { CitationModal } from '../../../components/common/Citation';
import ChatWorkbenchLayout from '../../../components/common/Chat/ChatWorkbenchLayout';
import ResultsDeck from '../../chat/components/ResultsDeck';
import useQAStore from '../stores/qaStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useQAChatLogic from '../hooks/useQAChatLogic.jsx';
import QAChatMessage from './QAChatMessage';
import { QA_CHAT_MODES } from '../config/qaChatModes';
import '../../../assets/styles/features/qa/qa-chat.css';

const QAChat = () => {
  const { id } = useParams();
  const { user } = useOptimizedAuth();
  const { getQACollection, fetchQACollections, qaCollections, loading: storeLoading } = useQAStore();
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
    chatMessages, inputValue, viewMode, qaResults, submitLoading,
    setInputValue, setViewMode, handleSubmitQuestion, clearResults
  } = useQAChatLogic({
    collectionId: id,
    collectionName: collection?.name,
    welcomeMessage: collection ? `Hallo! Ich bin bereit, Fragen zu Ihrem Notebook "${collection.name}" zu beantworten. Stellen Sie mir gerne eine Frage zu den Dokumenten.` : null
  });

  if (loading) return <div className="qa-chat-error"><p>Notebook wird geladen...</p></div>;

  if (!collection) {
    return (
      <div className="qa-chat-error">
        <p>Notebook nicht gefunden oder Sie haben keine Berechtigung darauf zuzugreifen.</p>
        <p>Collection ID: {id}</p>
        <p>User ID: {user?.id}</p>
        <p>Store Loading: {storeLoading ? 'Yes' : 'No'}</p>
        <p>Collections in Store: {qaCollections?.length || 0}</p>
        <p>Available Collection IDs: {qaCollections?.map(c => c.id).join(', ') || 'None'}</p>
      </div>
    );
  }

  const documents = collection.documents || collection.qa_collection_documents?.map(qcd => qcd.documents) || [];

  const renderInfoPanel = () => (
    <div className={`qa-collection-info qa-collection-info-${viewMode}`}>
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

  return (
    <>
      <CitationModal />
      <ChatWorkbenchLayout
        mode={viewMode}
        modes={QA_CHAT_MODES}
        onModeChange={setViewMode}
        title={collection.name}
        messages={chatMessages}
        onSubmit={handleSubmitQuestion}
        isProcessing={submitLoading}
        placeholder="Stellen Sie eine Frage zu den Dokumenten..."
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={submitLoading}
        renderMessage={(msg, i) => <QAChatMessage msg={msg} index={i} viewMode={viewMode} assistantName={collection.name} />}
        rightPanelContent={qaResults.length > 0 ? <ResultsDeck results={qaResults} onClear={clearResults} /> : renderInfoPanel()}
        infoPanelContent={renderInfoPanel()}
        enableVoiceInput={true}
        hideHeader={true}
      />
    </>
  );
};

export default QAChat;
