import React, { useState, useCallback, useEffect, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { HiDocumentText, HiChip, HiInformationCircle } from 'react-icons/hi';
import { NotebookIcon } from '../../config/icons';
const ReactMarkdown = lazy(() => import('react-markdown'));
import ChatWorkbenchLayout from '../../components/common/Chat/ChatWorkbenchLayout';
import useApiSubmit from '../../components/hooks/useApiSubmit';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';
import ErrorBoundary from '../../components/ErrorBoundary';
import { CitationModal, CitationSourcesDisplay } from '../../components/common/Citation';
import DisplaySection from '../../components/common/Form/BaseForm/DisplaySection';
import FormStateProvider from '../../components/common/Form/FormStateProvider';
import ContentRenderer from '../../components/common/Form/BaseForm/ContentRenderer';
import { useOptimizedAuth } from '../../hooks/useAuth';
import '../../assets/styles/features/qa/qa-chat.css';

const AskGrundsatzPage = () => {
  const componentName = 'ask-grundsatz';
  const navigate = useNavigate();
  const { user } = useOptimizedAuth();
  const collectionId = 'grundsatz-system';
  const { submitForm, loading: submitLoading } = useApiSubmit(`/auth/qa/${collectionId}/ask`);
  const { setGeneratedText, setGeneratedTextMetadata, getGeneratedTextMetadata, getLinkConfig } = useGeneratedTextStore();
  const [chatMessages, setChatMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [mode, setMode] = useState('dossier'); // 'dossier' or 'chat'
  const [loading, setLoading] = useState(false);

  const storeGeneratedText = useGeneratedTextStore(state => state.getGeneratedText(componentName));

  // Initialize chat with welcome message
  useEffect(() => {
    const welcomeMessage = {
      type: 'assistant',
      content: 'Willkommen im Grünen Notebook! Ich beantworte deine Fragen zu den Grundsatzprogrammen von Bündnis 90/Die Grünen. Du kannst mich zu allen Inhalten des Grundsatzprogramms 2020, EU-Wahlprogramms 2024 und Regierungsprogramms 2025 fragen.',
      timestamp: Date.now()
    };
    setChatMessages([welcomeMessage]);
  }, []);

  const handleSubmitQuestion = useCallback(async (question) => {
    const userMessage = {
      type: 'user',
      content: question,
      timestamp: Date.now(),
      userName: user?.user_metadata?.firstName || user?.email || 'Du'
    };

    // Add user message to chat
    setChatMessages(prev => [...prev, userMessage]);
    setInputValue("");

    try {
      const result = await submitForm({ 
        question, 
        mode,
        search_user_id: '00000000-0000-0000-0000-000000000000' // SYSTEM user ID for Grundsatz documents
      });
      
      if (result && result.answer) {
        // Add assistant response to chat
        const assistantMessage = {
          type: 'assistant',
          content: 'Hier ist meine Antwort aus dem Grünen Notebook:',
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
      console.error('[AskGrundsatzPage] Error submitting question:', error);
      const errorMessage = {
        type: 'error',
        content: 'Entschuldigung, es gab einen Fehler beim Verarbeiten deiner Frage. Bitte versuche es erneut.',
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    }
  }, [submitForm, user, mode, setGeneratedText, setGeneratedTextMetadata, componentName]);

  // Get sources and citations from store metadata
  const metadata = getGeneratedTextMetadata(componentName);
  const sources = metadata?.sources || [];
  const citations = metadata?.citations || [];
  const linkConfig = getLinkConfig(componentName);

  // Mode configuration for the mode selector
  const modes = {
    dossier: {
      label: 'Dossier-Modus',
      icon: HiDocumentText,
      title: 'Zum Chat-Modus wechseln'
    },
    chat: {
      label: 'Chat-Modus', 
      icon: NotebookIcon,
      title: 'Zum Dossier-Modus wechseln'
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
  };

  // Custom message renderer for chat mode with inline citations
  const renderChatMessage = (msg, index) => (
    <motion.div 
      key={msg.timestamp || index}
      className={`chat-message ${msg.type} ${mode === 'chat' ? 'chat-message-with-citations' : ''}`}
      initial={{ opacity: 0, y: 2, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -1, scale: 0.995, transition: { duration: 0.2, ease: "easeOut" } }}
      transition={{ type: "tween", ease: "easeOut", duration: 0.35 }}
    >
      {msg.type === 'user' && msg.userName && (
        <div className="chat-message-user-name">{msg.userName}</div>
      )}
      {msg.type === 'assistant' && mode === 'chat' && (
        <div className="chat-message-user-name">Grünes Notebook</div>
      )}
      {msg.type === 'assistant' && <HiChip className="assistant-icon" />}
      
      <div className="chat-message-content">
        {msg.type === 'assistant' && msg.content === 'Hier ist meine Antwort aus dem Grünen Notebook:' && storeGeneratedText ? (
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
        {msg.type === 'assistant' && mode === 'chat' && sources.length > 0 && (
          <div className="chat-message-sources">
            <CitationSourcesDisplay
              sources={sources}
              citations={citations}
              linkConfig={linkConfig}
              title="Quellen"
              className="qa-citation-sources-inline"
            />
          </div>
        )}
      </div>
    </motion.div>
  );

  // Render sources using shared component
  const renderSourcesDisplay = () => {
    if (!storeGeneratedText || sources.length === 0) return null;

    return (
      <CitationSourcesDisplay
        sources={sources}
        citations={citations}
        linkConfig={linkConfig}
        title="Quellen aus Grundsatzprogrammen"
        className="qa-citation-sources"
      />
    );
  };

  // Render info panel about Grundsatzprogramme
  const renderGrundsatzInfo = () => {
    return (
      <div className={`qa-collection-info qa-collection-info-${mode}`}>
        <div className="qa-collection-info-header">
          <HiInformationCircle className="qa-collection-info-icon" />
          <h3>Grünes Notebook</h3>
        </div>

        <div className="qa-collection-info-description">
          Durchsuchbar sind die offiziellen Grundsatzprogramme von Bündnis 90/Die Grünen.
        </div>
        
        <div className="qa-collection-info-documents">
          <h4>Verfügbare Dokumente:</h4>
          <ul>
            <li>
              <HiDocumentText className="document-icon" />
              <span>Grundsatzprogramm 2020 (136 Seiten)</span>
            </li>
            <li>
              <HiDocumentText className="document-icon" />
              <span>EU-Wahlprogramm 2024 (114 Seiten)</span>
            </li>
            <li>
              <HiDocumentText className="document-icon" />
              <span>Regierungsprogramm 2025 (160 Seiten)</span>
            </li>
          </ul>
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    if (!storeGeneratedText) {
      return renderGrundsatzInfo();
    }

    return (
      <div className="qa-chat-answer">
        <FormStateProvider 
          formId={`grundsatz-chat`}
          initialState={{
            loading: false,
            error: null
          }}
        >
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
        </FormStateProvider>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <CitationModal />
      <ChatWorkbenchLayout
        mode={mode}
        modes={modes}
        onModeChange={handleModeChange}
        title="Grünes Notebook"
        messages={chatMessages}
        onSubmit={handleSubmitQuestion}
        isProcessing={submitLoading}
        placeholder="Stell deine Frage zu den Grundsatzprogrammen..."
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={submitLoading}
        renderMessage={renderChatMessage}
        rightPanelContent={renderRightPanel()}
        infoPanelContent={renderGrundsatzInfo()}
        enableVoiceInput={true}
        hideHeader={true}
      />
    </ErrorBoundary>
  );
};

export default AskGrundsatzPage;