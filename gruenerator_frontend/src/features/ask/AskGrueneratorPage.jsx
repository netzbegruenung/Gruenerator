import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HiDocumentText, HiExternalLink, HiCollection } from 'react-icons/hi';
import { CitationModal } from '../../components/common/Citation';
import ChatWorkbenchLayout from '../../components/common/Chat/ChatWorkbenchLayout';
import ResultsDeck from '../chat/components/ResultsDeck';
import ErrorBoundary from '../../components/ErrorBoundary';
import useMultiCollectionQA from '../qa/hooks/useMultiCollectionQA';
import QAChatMessage from '../qa/components/QAChatMessage';
import { QA_CHAT_MODES } from '../qa/config/qaChatModes';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import '../../assets/styles/features/qa/qa-chat.css';

const COLLECTION_NAME = 'Grünerator Notebook';
const WELCOME_MESSAGE = 'Willkommen im Grünerator Notebook! Ich durchsuche für dich verschiedene Quellen parallel – Grundsatzprogramme, Inhalte der Bundestagsfraktion und mehr. Stelle mir eine Frage und ich finde die relevantesten Informationen aus allen verfügbaren Quellen.';

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

const MultiCollectionSourcesDisplay = ({ sourcesByCollection, citations }) => {
  const navigate = useNavigate();

  const handleDocumentClick = (documentId, url, linkType) => {
    if (linkType === 'vectorDocument' && documentId) {
      navigate(`/documents/${documentId}`);
    } else if ((linkType === 'url' || linkType === 'external') && url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!sourcesByCollection || Object.keys(sourcesByCollection).length === 0) {
    return null;
  }

  return (
    <div className="ask-sources-section multi-collection-sources">
      {Object.entries(sourcesByCollection).map(([collectionId, collectionData]) => {
        const collectionConfig = COLLECTIONS.find(c => c.id === collectionId);
        const linkType = collectionConfig?.linkType || 'none';
        const sources = collectionData.sources || [];
        const allSources = collectionData.allSources || [];

        if (sources.length === 0 && allSources.length === 0) return null;

        return (
          <div key={collectionId} className="multi-collection-section">
            <h4 className="multi-collection-section-title">
              Quellen ({collectionData.name})
            </h4>

            <div className="ask-document-groups">
              {sources.map((source, index) => (
                <div key={source.document_id || index} className="ask-document-group">
                  <div className="ask-document-header">
                    <h5
                      className={`ask-document-title ${linkType !== 'none' ? 'clickable-link' : ''}`}
                      onClick={() => linkType !== 'none' && handleDocumentClick(source.document_id, source.url, linkType)}
                    >
                      {source.document_title}
                    </h5>
                    {source.similarity_score && (
                      <span className="ask-document-relevance">
                        {Math.round(source.similarity_score * 100)}%
                      </span>
                    )}
                  </div>

                  {source.citations && source.citations.length > 0 && (
                    <div className="ask-document-citations">
                      {source.citations.map((citation, idx) => (
                        <div key={idx} className="ask-citation-inline">
                          <span className="citation-number">[{citation.index}]</span>
                          <span className="citation-text">"{citation.cited_text?.replace(/\*\*/g, '').slice(0, 200) || ''}..."</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {linkType !== 'none' && (source.document_id || source.url) && (
                    <button
                      className="ask-document-link"
                      onClick={() => handleDocumentClick(source.document_id, source.url, linkType)}
                    >
                      {linkType === 'url' ? 'Artikel öffnen →' : 'Dokument öffnen →'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {allSources.length > 0 && (
              <details className="ask-additional-sources">
                <summary className="ask-additional-sources-header">
                  <span className="ask-additional-sources-title">Weitere Quellen</span>
                  <span className="ask-additional-sources-count">({allSources.length})</span>
                </summary>
                <div className="ask-additional-sources-list">
                  {allSources.slice(0, 5).map((source, idx) => (
                    <div key={source.document_id || idx} className="ask-additional-source-item">
                      <div className="ask-additional-source-header">
                        <span
                          className={`ask-additional-source-title ${linkType !== 'none' ? 'clickable-link' : ''}`}
                          onClick={() => linkType !== 'none' && handleDocumentClick(source.document_id, source.url, linkType)}
                        >
                          {source.document_title}
                        </span>
                        {source.similarity_score > 0 && (
                          <span className="ask-additional-source-score">
                            {Math.round(source.similarity_score * 100)}%
                          </span>
                        )}
                      </div>
                      {source.chunk_text && (
                        <p className="ask-additional-source-snippet">
                          {source.chunk_text.slice(0, 150)}...
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
};

const AskGrueneratorPage = () => {
  const {
    chatMessages, inputValue, viewMode, qaResults, submitLoading, activeCollections,
    setInputValue, setViewMode, handleSubmitQuestion, clearResults
  } = useMultiCollectionQA({
    collections: COLLECTIONS,
    welcomeMessage: WELCOME_MESSAGE
  });

  const renderInfoPanel = () => (
    <div className={`qa-collection-info qa-collection-info-${viewMode}`}>
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

  const resultsWithSources = qaResults.map(result => ({
    ...result,
    displayActions: result.sourcesByCollection ? (
      <MultiCollectionSourcesDisplay
        sourcesByCollection={result.sourcesByCollection}
        citations={result.citations}
      />
    ) : null
  }));

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
        placeholder="Stell deine Frage zu grüner Politik..."
        inputValue={inputValue}
        onInputChange={setInputValue}
        disabled={submitLoading}
        renderMessage={(msg, i) => <QAChatMessage msg={msg} index={i} viewMode={viewMode} assistantName={COLLECTION_NAME} />}
        rightPanelContent={resultsWithSources.length > 0 ? <ResultsDeck results={resultsWithSources} onClear={clearResults} /> : renderInfoPanel()}
        infoPanelContent={renderInfoPanel()}
        enableVoiceInput={true}
        hideHeader={true}
      />
    </ErrorBoundary>
  );
};

export default withAuthRequired(AskGrueneratorPage, {
  title: 'Grünerator Notebook'
});
