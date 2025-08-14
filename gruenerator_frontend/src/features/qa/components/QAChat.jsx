import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { HiOutlineQuestionMarkCircle, HiDocumentText, HiChatAlt2, HiInformationCircle, HiChip } from 'react-icons/hi';
import ReactMarkdown from 'react-markdown';
import ChatUI from '../../../components/common/Chat/ChatUI';
import ModeSelector from '../../../components/common/Chat/ModeSelector';
import { CitationModal, CitationSourcesDisplay } from '../../../components/common/Citation';
import DisplaySection from '../../../components/common/Form/BaseForm/DisplaySection';
import ContentRenderer from '../../../components/common/Form/BaseForm/ContentRenderer';
import useQAStore from '../stores/qaStore';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import useGeneratedTextStore from '../../../stores/core/generatedTextStore';

const QAChat = () => {
  const { id } = useParams();
  const { user } = useOptimizedAuth();
  const { getQACollection, fetchQACollections, qaCollections, loading: storeLoading } = useQAStore();
  const [chatMessages, setChatMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('dossier'); // 'dossier' or 'chat'
  
  const componentName = `qa-${id}`;
  const { setGeneratedText, setGeneratedTextMetadata, getGeneratedTextMetadata, getLinkConfig } = useGeneratedTextStore();
  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  
  const { submitForm, loading: submitLoading } = useApiSubmit(`/auth/qa/${id}/ask`);

  // Load Q&A collection on mount
  useEffect(() => {
    const loadCollection = async () => {
      try {
        setLoading(true);
        console.log('[QAChat] Loading collection with ID:', id);
        console.log('[QAChat] User authenticated:', !!user);
        console.log('[QAChat] Current collections in store:', qaCollections);
        
        // First try to get from store
        let foundCollection = getQACollection(id);
        console.log('[QAChat] Found collection in store:', foundCollection);
        
        // If not in store, fetch all collections
        if (!foundCollection) {
          console.log('[QAChat] Collection not in store, fetching all collections...');
          await fetchQACollections();
          foundCollection = getQACollection(id);
          console.log('[QAChat] Found collection after fetch:', foundCollection);
        }
        
        if (foundCollection) {
          setCollection(foundCollection);
          
          // Initialize chat with welcome message
          const welcomeMessage = {
            type: 'assistant',
            content: `Hallo! Ich bin bereit, Fragen zu Ihrer Q&A-Sammlung "${foundCollection.name}" zu beantworten. Stellen Sie mir gerne eine Frage zu den Dokumenten.`,
            timestamp: Date.now()
          };
          setChatMessages([welcomeMessage]);
        } else {
          console.log('[QAChat] Collection not found after fetch');
        }
      } catch (error) {
        console.error('[QAChat] Error loading collection:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id && user) {
      loadCollection();
    }
  }, [id, getQACollection, fetchQACollections, user, qaCollections]);

  const handleSubmitQuestion = useCallback(async (question) => {
    const userMessage = {
      type: 'user',
      content: question,
      timestamp: Date.now(),
      userName: user?.user_metadata?.firstName || user?.email || 'Sie'
    };

    // Add user message to chat
    setChatMessages(prev => [...prev, userMessage]);
    setInputValue("");

    try {
      const result = await submitForm({ question, mode: viewMode });
      
      if (result && result.answer) {
        // Add assistant response to chat
        const assistantMessage = {
          type: 'assistant',
          content: 'Hier ist meine Antwort basierend auf Ihren Dokumenten:',
          timestamp: Date.now()
        };
        setChatMessages(prev => [...prev, assistantMessage]);

        // Store answer and metadata in generatedTextStore
        setGeneratedText(componentName, result.answer);
        setGeneratedTextMetadata(componentName, { 
          sources: result.sources || [],
          citations: result.citations || []
        });
      }
    } catch (error) {
      console.error('[QAChat] Error submitting question:', error);
      const errorMessage = {
        type: 'error',
        content: 'Entschuldigung, es gab einen Fehler beim Verarbeiten Ihrer Frage. Bitte versuchen Sie es erneut.',
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  }, [submitForm, user, viewMode, setGeneratedText, setGeneratedTextMetadata, componentName]);

  // Mode configuration for the mode selector
  const modes = {
    dossier: {
      label: 'Dossier-Modus',
      icon: HiDocumentText,
      title: 'Zum Chat-Modus wechseln'
    },
    chat: {
      label: 'Chat-Modus', 
      icon: HiChatAlt2,
      title: 'Zum Dossier-Modus wechseln'
    }
  };

  const handleModeChange = (newMode) => {
    setViewMode(newMode);
  };

  // Custom message renderer for chat mode with inline citations
  const renderChatMessage = (msg, index) => (
    <motion.div 
      key={msg.timestamp || index}
      className={`chat-message ${msg.type} ${viewMode === 'chat' ? 'chat-message-with-citations' : ''}`}
      initial={{ opacity: 0, y: 2, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: "easeOut" } }}
      transition={{ type: "tween", ease: "easeOut", duration: 0.35 }}
    >
      {msg.type === 'user' && msg.userName && (
        <div className="chat-message-user-name">{msg.userName}</div>
      )}
      {msg.type === 'assistant' && viewMode === 'chat' && (
        <div className="chat-message-user-name">{collection.name}</div>
      )}
      {msg.type === 'assistant' && <HiChip className="assistant-icon" />}
      
      <div className="chat-message-content">
        {msg.type === 'assistant' && msg.content === 'Hier ist meine Antwort basierend auf Ihren Dokumenten:' && storeGeneratedText ? (
          <ContentRenderer
            value={storeGeneratedText}
            generatedContent={storeGeneratedText}
            isEditing={false}
            useMarkdown={true}
            componentName={componentName}
          />
        ) : (
          <ReactMarkdown 
            components={{
              a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
        
        {/* Show sources inline for chat mode */}
        {msg.type === 'assistant' && viewMode === 'chat' && sources.length > 0 && (
          <div className="chat-message-sources">
            <CitationSourcesDisplay
              sources={sources}
              citations={citations}
              linkConfig={linkConfig || {
                type: 'vectorDocument',
                linkKey: 'document_id',
                titleKey: 'document_title'
              }}
              title="Quellen"
              className="qa-citation-sources-inline"
              crossReferenceMessage="Basierend auf den verfügbaren Dokumenten"
            />
          </div>
        )}
      </div>
    </motion.div>
  );

  // Get sources and citations from store metadata
  const metadata = getGeneratedTextMetadata(componentName);
  const sources = metadata?.sources || [];
  const citations = metadata?.citations || [];
  const linkConfig = getLinkConfig(componentName);

  // Render sources using shared component
  const renderSourcesDisplay = () => {
    if (!storeGeneratedText || sources.length === 0) return null;
    
    return (
      <CitationSourcesDisplay
        sources={sources}
        citations={citations}
        linkConfig={linkConfig || {
          type: 'vectorDocument',
          linkKey: 'document_id',
          titleKey: 'document_title'
        }}
        title="Quellen aus Q&A-Sammlung"
        className="qa-citation-sources"
        crossReferenceMessage="Mehrere Dokumente aus der Sammlung bestätigen diese Informationen"
      />
    );
  };

  // Render collection info panel
  const renderCollectionInfo = () => {
    const documents = collection.documents || collection.qa_collection_documents?.map(qcd => qcd.documents) || [];
    
    return (
      <div className={`qa-collection-info qa-collection-info-${viewMode}`}>
        <div className="qa-collection-info-header">
          <HiInformationCircle className="qa-collection-info-icon" />
          <h3>{collection.name}</h3>
        </div>
        
        {collection.description && (
          <div className="qa-collection-info-description">
            {collection.description}
          </div>
        )}
        
        <div className="qa-collection-info-documents">
          <h4>Enthaltene Dokumente:</h4>
          <ul>
            {documents.map((doc, index) => (
              <li key={doc.id || index}>
                <HiDocumentText className="document-icon" />
                <span>{doc.title || doc.name || `Dokument ${index + 1}`}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  // Custom floating input renderer for chat mode
  const renderFloatingInput = () => {
    const handleSubmit = (e) => {
      e.preventDefault();
      if (inputValue.trim() && !submitLoading) {
        handleSubmitQuestion(inputValue.trim());
      }
    };

    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    };

    return (
      <form onSubmit={handleSubmit} className="qa-chat-floating-input">
        <ModeSelector
          currentMode={viewMode}
          modes={modes}
          onModeChange={handleModeChange}
          className="qa-chat-mode-selector"
        />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Stellen Sie eine Frage zu den Dokumenten..."
          disabled={submitLoading}
          className="qa-floating-input"
        />
        <button 
          type="submit" 
          disabled={!inputValue.trim() || submitLoading}
          className="qa-floating-submit"
        >
          ➤
        </button>
      </form>
    );
  };

  const renderRightPanel = () => {
    if (!storeGeneratedText) {
      return renderCollectionInfo();
    }

    return (
      <div className="qa-chat-answer">
        <DisplaySection
          title="Antwort"
          generatedContent={storeGeneratedText}
          isEditing={false}
          allowEditing={false}
          hideEditButton={true}
          useMarkdown={true}
          componentName={componentName}
          handleToggleEditMode={() => {}}
          getExportableContent={() => storeGeneratedText}
          displayActions={renderSourcesDisplay()}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="qa-chat-error">
        <p>Q&A-Sammlung wird geladen...</p>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="qa-chat-error">
        <p>Q&A-Sammlung nicht gefunden oder Sie haben keine Berechtigung darauf zuzugreifen.</p>
        <p>Collection ID: {id}</p>
        <p>User ID: {user?.id}</p>
        <p>Store Loading: {storeLoading ? 'Yes' : 'No'}</p>
        <p>Collections in Store: {qaCollections?.length || 0}</p>
        <p>Available Collection IDs: {qaCollections?.map(c => c.id).join(', ') || 'None'}</p>
      </div>
    );
  }

  const renderDossierMode = () => (
    <div className="qa-chat-main qa-chat-dossier">
      <div className="qa-chat-left-panel">
        <div className="qa-chat-header">
          <div className="qa-chat-header-content">
            <h2>{collection.name}</h2>
          </div>
        </div>
        
        <ChatUI
          messages={chatMessages}
          onSubmit={handleSubmitQuestion}
          isProcessing={submitLoading}
          placeholder="Stellen Sie eine Frage zu den Dokumenten..."
          inputValue={inputValue}
          onInputChange={setInputValue}
          disabled={submitLoading}
          className="qa-chat-ui"
          renderInput={() => (
            <div className="qa-chat-dossier-input-wrapper">
              <ModeSelector
                currentMode={viewMode}
                modes={modes}
                onModeChange={handleModeChange}
                className="qa-chat-mode-selector"
              />
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Stellen Sie eine Frage zu den Dokumenten..."
                disabled={submitLoading}
              />
              <button 
                type="submit" 
                disabled={!inputValue.trim() || submitLoading}
              >
                ➤
              </button>
            </div>
          )}
        />
      </div>
      
      <div className="qa-chat-right-panel">
        {renderRightPanel()}
      </div>
    </div>
  );

  const renderChatMode = () => (
    <div className="qa-chat-main qa-chat-fullscreen">
      <div className="qa-chat-fullscreen-content">
        <ChatUI
          messages={chatMessages}
          onSubmit={handleSubmitQuestion}
          isProcessing={submitLoading}
          placeholder="Stellen Sie eine Frage zu den Dokumenten..."
          inputValue={inputValue}
          onInputChange={setInputValue}
          disabled={submitLoading}
          className="qa-chat-ui qa-chat-ui-fullscreen"
          fullScreen={true}
          renderMessage={(msg, index) => renderChatMessage(msg, index)}
          renderInput={() => null} // Hide the default input
        />
        
        {/* Render floating input within the chat container */}
        {renderFloatingInput()}
      </div>
      
      {/* Render collection info as a persistent element in chat mode */}
      {renderCollectionInfo()}
    </div>
  );

  return (
    <motion.div 
      className={`qa-chat-container qa-chat-${viewMode}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <CitationModal />
      {viewMode === 'dossier' ? renderDossierMode() : renderChatMode()}
    </motion.div>
  );
};

export default QAChat;