import React, { useState, useCallback, useMemo } from 'react';
import { HiDocumentText, HiExternalLink, HiCollection } from 'react-icons/hi';
import { CitationModal } from '../../components/common/Citation';
import ChatWorkbenchLayout from '../../components/common/Chat/ChatWorkbenchLayout';
import ErrorBoundary from '../../components/ErrorBoundary';
import useMultiCollectionNotebook from './hooks/useMultiCollectionNotebook';
import NotebookChatMessage from './components/NotebookChatMessage';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import '../../assets/styles/features/notebook/notebook-chat.css';

const COLLECTION_NAME = 'Frag Grünerator';
const START_PAGE_TITLE = 'Was möchtest du wissen?';

const EXAMPLE_QUESTIONS = [
  { icon: '🌍', text: 'Was sagen die Grünen zum Klimaschutz?' },
  { icon: '🇪🇺', text: 'Wie ist die grüne Position zur EU?' },
  { icon: '⚡', text: 'Was steht zur Energiewende in den Programmen?' }
];

const COLLECTIONS = [
  {
    id: 'grundsatz-system',
    name: 'Grundsatzprogramme',
    icon: HiDocumentText,
    description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
    documentCount: '3 Programme',
    linkType: 'vectorDocument'
  },
  {
    id: 'bundestagsfraktion-system',
    name: 'Bundestagsfraktion',
    icon: HiDocumentText,
    description: 'Fachtexte, Ziele und einfache Erklärungen',
    documentCount: '542 Artikel',
    externalUrl: 'https://www.gruene-bundestag.de',
    linkType: 'url'
  }
];

const GrueneratorNotebookPage = () => {
  const [selectedIds, setSelectedIds] = useState(() => COLLECTIONS.map(c => c.id));

  const selectedCollections = useMemo(
    () => COLLECTIONS.filter(c => selectedIds.includes(c.id)),
    [selectedIds]
  );

  const sources = useMemo(
    () => COLLECTIONS.map(c => ({
      id: c.id,
      name: c.name,
      count: c.documentCount,
      selected: selectedIds.includes(c.id)
    })),
    [selectedIds]
  );

  const handleSourceToggle = useCallback((sourceId) => {
    setSelectedIds(prev => {
      if (prev.includes(sourceId)) {
        return prev.filter(id => id !== sourceId);
      }
      return [...prev, sourceId];
    });
  }, []);

  const {
    chatMessages, inputValue, submitLoading, activeCollections, isMobileView,
    setInputValue, handleSubmitQuestion
  } = useMultiCollectionNotebook({
    collections: selectedCollections
  });

  const effectiveMode = 'chat';

  const renderInfoPanel = () => (
    <div className="qa-collection-info">
      <div className="qa-collection-info-header">
        <HiCollection className="qa-collection-info-icon" />
        <h3>{COLLECTION_NAME}</h3>
      </div>
      <div className="qa-collection-info-description">
        Durchsucht automatisch mehrere Quellen parallel und kombiniert die Ergebnisse.
      </div>

      <div className="qa-collection-info-documents">
        <h4>Verfügbare Quellen:</h4>
        {COLLECTIONS.map((collection) => (
          <div key={collection.id} className="qa-multi-collection-item">
            <div className="qa-multi-collection-header">
              <collection.icon className="document-icon" />
              <span className="qa-multi-collection-name">{collection.name}</span>
              <span className="qa-multi-collection-count">{collection.documentCount}</span>
            </div>
            <div className="qa-multi-collection-description">
              {collection.description}
            </div>
            {collection.externalUrl && (
              <a
                href={collection.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="qa-multi-collection-link"
              >
                <HiExternalLink className="source-icon" />
                <span>{collection.externalUrl.replace('https://', '').replace('www.', '')}</span>
              </a>
            )}
          </div>
        ))}
      </div>

      {submitLoading && activeCollections.length > 0 && (
        <div className="qa-collection-info-loading">
          <div className="qa-loading-indicator">
            Durchsuche {activeCollections.length} Quellen...
          </div>
          <div className="qa-loading-collections">
            {activeCollections.map((name, i) => (
              <span key={i} className="qa-loading-collection-badge">{name}</span>
            ))}
          </div>
        </div>
      )}
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
        placeholder="Stell deine Frage zu grüner Politik..."
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
        sources={sources}
        onSourceToggle={handleSourceToggle}
      />
    </ErrorBoundary>
  );
};

export default withAuthRequired(GrueneratorNotebookPage, {
  title: 'Frag Grünerator'
});
