import React from 'react';
import { HiDocumentText, HiInformationCircle } from 'react-icons/hi';
import { CitationModal } from '../../components/common/Citation';
import ChatWorkbenchLayout from '../../components/common/Chat/ChatWorkbenchLayout';
import ErrorBoundary from '../../components/ErrorBoundary';
import useNotebookChatLogic from './hooks/useNotebookChatLogic.jsx';
import NotebookChatMessage from './components/NotebookChatMessage';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import '../../assets/styles/features/notebook/notebook-chat.css';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const COLLECTION_NAME = 'Frag Bündnis 90/Die Grünen';
const START_PAGE_TITLE = 'Was möchtest du über die Grundsatzprogramme wissen?';

const EXAMPLE_QUESTIONS = [
  { icon: '🌍', text: 'Was steht im Grundsatzprogramm zu Klimaschutz?' },
  { icon: '🇪🇺', text: 'Wie positionieren sich die Grünen zur EU?' },
  { icon: '🏛️', text: 'Was sagt das Regierungsprogramm zu Bildung?' }
];

const SOURCES = [
  { name: 'Grundsatzprogramme', count: '3 Programme' }
];

const GrueneNotebookPage = () => {
  const {
    chatMessages, inputValue, submitLoading, isMobileView,
    setInputValue, handleSubmitQuestion
  } = useNotebookChatLogic({
    collectionId: 'grundsatz-system',
    extraApiParams: { search_user_id: SYSTEM_USER_ID }
  });

  const effectiveMode = 'chat';

  const renderInfoPanel = () => (
    <div className="qa-collection-info">
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
        mode={effectiveMode}
        onModeChange={() => {}}
        title={COLLECTION_NAME}
        messages={chatMessages}
        onSubmit={handleSubmitQuestion}
        isProcessing={submitLoading}
        placeholder="Stell deine Frage zu den Grundsatzprogrammen..."
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={submitLoading}
        renderMessage={(msg, i) => <NotebookChatMessage key={msg.timestamp || `msg-${i}`} msg={msg} index={i} />}
        infoPanelContent={isMobileView ? null : renderInfoPanel()}
        enableVoiceInput={true}
        hideHeader={true}
        hideModeSelector={true}
        singleLine={true}
        showStartPage={true}
        startPageTitle={START_PAGE_TITLE}
        exampleQuestions={EXAMPLE_QUESTIONS}
        sources={SOURCES}
      />
    </ErrorBoundary>
  );
};

export default withAuthRequired(GrueneNotebookPage, {
  title: 'Frag Bündnis 90/Die Grünen'
});
