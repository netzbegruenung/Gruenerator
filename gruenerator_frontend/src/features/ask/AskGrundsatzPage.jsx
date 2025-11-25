import React from 'react';
import { HiDocumentText, HiInformationCircle } from 'react-icons/hi';
import { CitationModal } from '../../components/common/Citation';
import ChatWorkbenchLayout from '../../components/common/Chat/ChatWorkbenchLayout';
import ResultsDeck from '../chat/components/ResultsDeck';
import ErrorBoundary from '../../components/ErrorBoundary';
import useQAChatLogic from '../qa/hooks/useQAChatLogic.jsx';
import QAChatMessage from '../qa/components/QAChatMessage';
import { QA_CHAT_MODES } from '../qa/config/qaChatModes';
import '../../assets/styles/features/qa/qa-chat.css';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const COLLECTION_NAME = 'Grünes Notebook';
const WELCOME_MESSAGE = 'Willkommen im Grünen Notebook! Ich beantworte deine Fragen zu den Grundsatzprogrammen von Bündnis 90/Die Grünen. Du kannst mich zu allen Inhalten des Grundsatzprogramms 2020, EU-Wahlprogramms 2024 und Regierungsprogramms 2025 fragen.';

const AskGrundsatzPage = () => {
  const {
    chatMessages, inputValue, viewMode, qaResults, submitLoading,
    setInputValue, setViewMode, handleSubmitQuestion, clearResults
  } = useQAChatLogic({
    collectionId: 'grundsatz-system',
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
        placeholder="Stell deine Frage zu den Grundsatzprogrammen..."
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

export default AskGrundsatzPage;
