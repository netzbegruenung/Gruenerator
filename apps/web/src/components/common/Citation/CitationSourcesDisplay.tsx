import { type JSX, useCallback, type KeyboardEvent } from 'react';

import useCitationStore, { type LinkConfig } from '../../../stores/citationStore';

interface Source {
  document_id?: string;
  document_title?: string;
  url?: string;
  source_url?: string;
  similarity_score?: number;
  chunk_text?: string;
  [key: string]: unknown;
}

interface Citation {
  document_id?: string;
  document_title?: string;
  url?: string;
  source_url?: string;
  similarity_score?: number;
  cited_text?: string;
  index?: number;
  chunk_index?: number;
  collection_id?: string;
  collection_name?: string;
  [key: string]: unknown;
}

interface CitationSourcesDisplayProps {
  sources?: Source[];
  citations?: Citation[];
  additionalSources?: Source[];
  linkConfig?: LinkConfig;
  title?: string;
  className?: string;
}

interface AdditionalSourceGroup {
  document_id?: string;
  document_title?: string;
  url?: string;
  chunks: string[];
  maxScore: number;
}

const DEFAULT_LINK_CONFIG: LinkConfig = { type: 'none' };

const CitationSourcesDisplay = ({
  sources = [],
  citations = [],
  additionalSources = [],
  linkConfig = DEFAULT_LINK_CONFIG,
  title = 'Quellen und Zitate',
  className = '',
}: CitationSourcesDisplayProps): JSX.Element | null => {
  const { fetchChunkContext } = useCitationStore();

  // Pass linkConfig to store when opening citation
  const handleCitationClick = useCallback(
    (citation: Citation) => {
      if (citation.document_id && citation.chunk_index !== undefined) {
        void fetchChunkContext(citation.document_id, citation.chunk_index, citation, linkConfig);
      }
    },
    [fetchChunkContext, linkConfig]
  );

  const handleCitationKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, citation: Citation) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCitationClick(citation);
      }
    },
    [handleCitationClick]
  );

  // Create document groups that merge sources and citations
  const createDocumentGroups = useCallback(() => {
    const groupMap = new Map();

    sources.forEach((source) => {
      const docId =
        source.document_id || (linkConfig.linkKey ? source[linkConfig.linkKey] : undefined);
      const docTitle =
        (linkConfig.titleKey ? source[linkConfig.titleKey] : undefined) || source.document_title;
      const docUrl =
        source.url ||
        source.source_url ||
        (linkConfig.urlKey ? source[linkConfig.urlKey] : undefined) ||
        null;

      if (!groupMap.has(docId)) {
        groupMap.set(docId, {
          documentId: docId,
          documentTitle: docTitle,
          url: docUrl,
          relevance: source.similarity_score,
          citations: [],
          additionalContent: source.chunk_text,
          hasAdditionalContext: false,
        });
      }
    });

    citations.forEach((citation) => {
      const docId = citation.document_id;

      if (!groupMap.has(docId)) {
        groupMap.set(docId, {
          documentId: docId,
          documentTitle: citation.document_title,
          url: citation.url || citation.source_url || null,
          relevance: citation.similarity_score,
          citations: [],
          additionalContent: '',
          hasAdditionalContext: false,
        });
      }

      const group = groupMap.get(docId);
      group.citations.push(citation);

      if (
        group.additionalContent &&
        citation.cited_text &&
        !group.additionalContent.includes(citation.cited_text.substring(0, 50))
      ) {
        group.hasAdditionalContext = true;
      }
    });

    groupMap.forEach((group) => {
      group.citations.sort((a: Citation, b: Citation) => (a.index || 0) - (b.index || 0));
    });

    return Array.from(groupMap.values()).sort(
      (a: { citations: Citation[] }, b: { citations: Citation[] }) => {
        const aMinIndex =
          a.citations.length > 0
            ? Math.min(...a.citations.map((c: Citation) => c.index || 0))
            : Infinity;
        const bMinIndex =
          b.citations.length > 0
            ? Math.min(...b.citations.map((c: Citation) => c.index || 0))
            : Infinity;
        return aMinIndex - bMinIndex;
      }
    );
  }, [sources, citations, linkConfig]);

  if (sources.length === 0 && citations.length === 0 && additionalSources.length === 0) return null;

  const documentGroups = createDocumentGroups();

  // Group additional sources (handle both ExpandedChunkResult and Source property names)
  const additionalGrouped = additionalSources.reduce(
    (acc: Map<string, AdditionalSourceGroup>, source) => {
      const docTitle = source.document_title || (source.title as string) || '';
      const docUrl = source.url || (source.source_url as string);
      const chunkText = source.chunk_text || (source.snippet as string);
      const score = source.similarity_score ?? (source.similarity as number) ?? 0;

      const key = source.document_id || docTitle || '';
      if (!acc.has(key)) {
        acc.set(key, {
          document_id: source.document_id,
          document_title: docTitle,
          url: docUrl,
          chunks: [],
          maxScore: score,
        });
      }
      const group = acc.get(key);
      if (group && chunkText) {
        group.chunks.push(chunkText);
        group.maxScore = Math.max(group.maxScore, score);
      }
      return acc;
    },
    new Map<string, AdditionalSourceGroup>()
  );

  const additionalSourceGroups = Array.from(additionalGrouped.values()).sort(
    (a, b) => b.maxScore - a.maxScore
  );

  return (
    <div className={`ask-sources-section ${className}`}>
      <div className="ask-sources-header">
        <h4 className="ask-sources-title">{title}</h4>
      </div>

      <div className="ask-document-groups">
        {documentGroups.map((group, index) => (
          <div
            key={group.documentId || group.documentTitle || `doc-${index}`}
            className="ask-document-group"
          >
            <div className="ask-document-header">
              <h5 className="ask-document-title">
                {group.url ? (
                  <a
                    href={group.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ask-document-title-link"
                  >
                    {group.documentTitle}
                  </a>
                ) : (
                  group.documentTitle
                )}
              </h5>
              {group.relevance && (
                <span className="ask-document-relevance">{Math.round(group.relevance * 100)}%</span>
              )}
            </div>

            {group.citations.length > 0 && (
              <div className="ask-document-citations">
                {group.citations.map((citation: Citation, idx: number) => {
                  const isClickable = citation.document_id && citation.chunk_index !== undefined;
                  return (
                    <div
                      key={idx}
                      className={`ask-citation-inline ${isClickable ? 'clickable' : ''}`}
                      onClick={isClickable ? () => handleCitationClick(citation) : undefined}
                      onKeyDown={
                        isClickable ? (e) => handleCitationKeyDown(e, citation) : undefined
                      }
                      tabIndex={isClickable ? 0 : undefined}
                      role={isClickable ? 'button' : undefined}
                      title={isClickable ? 'Im Kontext anzeigen' : undefined}
                    >
                      <span className="citation-number">{citation.index}</span>
                      <span className="citation-text">
                        "{citation.cited_text?.replace(/\*\*/g, '') || ''}"
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {group.hasAdditionalContext && group.additionalContent && (
              <details className="ask-document-context">
                <summary>Weitere Inhalte aus diesem Dokument</summary>
                <p className="ask-document-excerpt">{group.additionalContent}</p>
              </details>
            )}
          </div>
        ))}
      </div>

      {additionalSourceGroups.length > 1 && (
        <details className="ask-additional-sources">
          <summary className="ask-additional-sources-header">
            <span className="ask-additional-sources-title">Weitere Quellen</span>
            <span className="ask-additional-sources-count">({additionalSourceGroups.length})</span>
          </summary>
          <div className="ask-additional-sources-list">
            {additionalSourceGroups.map((source, idx) => (
              <div
                key={source.document_id || source.document_title || `additional-${idx}`}
                className="ask-additional-source-item"
              >
                <div className="ask-additional-source-header">
                  <span className="ask-additional-source-title">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ask-additional-source-title-link"
                      >
                        {source.document_title}
                      </a>
                    ) : (
                      source.document_title
                    )}
                  </span>
                  {source.maxScore > 0 && (
                    <span className="ask-additional-source-score">
                      {Math.round(source.maxScore * 100)}%
                    </span>
                  )}
                </div>
                {source.chunks[0] && (
                  <p className="ask-additional-source-snippet">
                    {source.chunks[0].slice(0, 150)}...
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

export default CitationSourcesDisplay;
