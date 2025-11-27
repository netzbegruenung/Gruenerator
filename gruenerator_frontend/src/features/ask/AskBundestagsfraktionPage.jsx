import React from 'react';
import { HiDocumentText, HiInformationCircle, HiExternalLink } from 'react-icons/hi';
import { CitationModal } from '../../components/common/Citation';
import ChatWorkbenchLayout from '../../components/common/Chat/ChatWorkbenchLayout';
import ResultsDeck from '../chat/components/ResultsDeck';
import ErrorBoundary from '../../components/ErrorBoundary';
import useQAChatLogic from '../qa/hooks/useQAChatLogic.jsx';
import QAChatMessage from '../qa/components/QAChatMessage';
import { QA_CHAT_MODES } from '../qa/config/qaChatModes';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import '../../assets/styles/features/qa/qa-chat.css';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const COLLECTION_NAME = 'Grüne Bundestagsfraktion';
const WELCOME_MESSAGE = 'Willkommen! Ich beantworte deine Fragen zu den Inhalten der Grünen Bundestagsfraktion. Du kannst mich zu Fachtexten, politischen Zielen und Positionen fragen – alle Informationen stammen direkt von gruene-bundestag.de.';

const AskBundestagsfraktionPage = () => {
  const {
    chatMessages, inputValue, viewMode, qaResults, submitLoading,
    setInputValue, setViewMode, handleSubmitQuestion, clearResults
  } = useQAChatLogic({
    collectionId: 'bundestagsfraktion-system',
    collectionName: COLLECTION_NAME,
    welcomeMessage: WELCOME_MESSAGE,
    extraApiParams: { search_user_id: SYSTEM_USER_ID }
  });

  const renderInfoPanel = () => (
    <div className={`qa-collection-info qa-collection-info-${viewMode}`}>
      <div className="qa-collection-info-header">
        <HiInformationCircle className="qa-collection-info-icon" />
        <h3>{COLLECTION_NAME}</h3>
      </div>
      <div className="qa-collection-info-description">
        Durchsuchbar sind die offiziellen Inhalte von gruene-bundestag.de – Fachtexte, politische Ziele und einfache Erklärungen.
      </div>
      <div className="qa-collection-info-documents">
        <h4>Verfügbare Inhalte:</h4>
        <ul>
          <li>
            <HiDocumentText className="document-icon" />
            <span>Fachtexte (468 Artikel)</span>
          </li>
          <li>
            <HiDocumentText className="document-icon" />
            <span>Unsere Ziele (50 Themengebiete)</span>
          </li>
          <li>
            <HiDocumentText className="document-icon" />
            <span>Einfach erklärt (24 Artikel)</span>
          </li>
        </ul>
      </div>
      <div className="qa-collection-info-source">
        <a href="https://www.gruene-bundestag.de" target="_blank" rel="noopener noreferrer" className="source-link">
          <HiExternalLink className="source-icon" />
          <span>gruene-bundestag.de</span>
        </a>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <CitationModal />
      <ChatWorkbenchLayout
        mode={viewMode}
        modes={QA_CHAT_MODES}
        onModeChange={setViewMode}
        title={COLLECTION_NAME}
        messages={chatMessages}
        onSubmit={handleSubmitQuestion}
        isProcessing={submitLoading}
        placeholder="Stell deine Frage zur Grünen Bundestagsfraktion..."
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={submitLoading}
        renderMessage={(msg, i) => <QAChatMessage msg={msg} index={i} viewMode={viewMode} assistantName={COLLECTION_NAME} />}
        rightPanelContent={qaResults.length > 0 ? <ResultsDeck results={qaResults} onClear={clearResults} /> : renderInfoPanel()}
        infoPanelContent={renderInfoPanel()}
        enableVoiceInput={true}
        hideHeader={true}
      />
    </ErrorBoundary>
  );
};

export default withAuthRequired(AskBundestagsfraktionPage, {
  title: 'Grüne Bundestagsfraktion'
});
