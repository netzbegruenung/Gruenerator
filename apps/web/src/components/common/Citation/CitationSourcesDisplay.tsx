import { type JSX, useCallback, type KeyboardEvent } from 'react';

import useCitationStore, { type LinkConfig } from '../../../stores/citationStore';
import { cn } from '../../../utils/cn';

export interface Source {
  document_id?: string;
  document_title?: string;
  url?: string;
  source_url?: string;
  similarity_score?: number;
  chunk_text?: string;
  [key: string]: unknown;
}

export interface Citation {
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
    <div className={cn('ask-sources-section', className)}>
      <div className="flex justify-between items-center mb-md">
        <h4 className="text-[1.1rem] font-semibold text-foreground-heading m-0">{title}</h4>
      </div>

      <div className="flex flex-col gap-md">
        {documentGroups.map((group, index) => (
          <div
            key={group.documentId || group.documentTitle || `doc-${index}`}
            className="p-md border border-[var(--border-subtle)] rounded-sm"
          >
            <div className="flex justify-between items-center mb-sm">
              <h5 className="font-semibold text-foreground-heading m-0 flex-1 text-[0.95rem]">
                {group.url ? (
                  <a
                    href={group.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-inherit no-underline transition-all duration-200 hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 focus-visible:rounded-sm"
                  >
                    {group.documentTitle}
                  </a>
                ) : (
                  group.documentTitle
                )}
              </h5>
              {group.relevance && (
                <span className="text-[0.85rem] text-disabled">
                  {Math.round(group.relevance * 100)}%
                </span>
              )}
            </div>

            {group.citations.length > 0 && (
              <div className="flex flex-col">
                {group.citations.map((citation: Citation, idx: number) => {
                  const isClickable = citation.document_id && citation.chunk_index !== undefined;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'flex gap-sm p-xxs ml-xs max-sm:block max-sm:p-xs max-sm:ml-0',
                        isClickable &&
                          'cursor-pointer transition-all duration-200 rounded-sm hover:bg-background-alt focus:outline-2 focus:outline-accent focus:outline-offset-2 active:scale-[0.99]'
                      )}
                      onClick={isClickable ? () => handleCitationClick(citation) : undefined}
                      onKeyDown={
                        isClickable ? (e) => handleCitationKeyDown(e, citation) : undefined
                      }
                      tabIndex={isClickable ? 0 : undefined}
                      role={isClickable ? 'button' : undefined}
                      title={isClickable ? 'Im Kontext anzeigen' : undefined}
                    >
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-accent dark:bg-primary-400 text-white text-[0.7rem] font-semibold rounded-[10px] shrink-0 max-sm:min-w-auto max-sm:inline max-sm:mr-xxs">
                        {citation.index}
                      </span>
                      <span className="text-foreground italic leading-[1.6] p-md rounded-sm bg-background-alt text-[clamp(0.9rem,1.5vw,1rem)] max-sm:inline max-sm:break-words max-sm:bg-transparent max-sm:p-0 max-sm:rounded-none">
                        "{citation.cited_text?.replace(/\*\*/g, '') || ''}"
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {group.hasAdditionalContext && group.additionalContent && (
              <details className="[&_summary]:cursor-pointer [&_summary]:text-disabled [&_summary]:text-[0.9rem] [&_summary]:my-sm [&_summary]:mb-xs [&_summary:hover]:text-link">
                <summary>Weitere Inhalte aus diesem Dokument</summary>
                <p className="text-foreground leading-[1.4] text-[0.9rem] ml-md">
                  {group.additionalContent}
                </p>
              </details>
            )}
          </div>
        ))}
      </div>

      {additionalSourceGroups.length > 1 && (
        <details className="mt-lg border-t border-grey-200 dark:border-grey-700 pt-md [&[open]_summary]:mb-sm">
          <summary className="flex items-center gap-sm cursor-pointer py-sm text-foreground text-[0.9rem] transition-all duration-200 hover:text-accent">
            <span className="font-medium">Weitere Quellen</span>
            <span className="text-disabled text-[0.85rem]">({additionalSourceGroups.length})</span>
          </summary>
          <div className="flex flex-col gap-sm">
            {additionalSourceGroups.map((source, idx) => (
              <div
                key={source.document_id || source.document_title || `additional-${idx}`}
                className="p-[var(--spacing-small)_var(--spacing-medium)] bg-background-alt rounded-sm border border-grey-200 dark:border-grey-700"
              >
                <div className="flex justify-between items-center mb-xs">
                  <span className="font-medium text-foreground-heading text-[0.9rem]">
                    {source.url ? (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-inherit no-underline transition-all duration-200 hover:text-link hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 focus-visible:rounded-sm"
                      >
                        {source.document_title}
                      </a>
                    ) : (
                      source.document_title
                    )}
                  </span>
                  {source.maxScore > 0 && (
                    <span className="text-[0.8rem] text-disabled">
                      {Math.round(source.maxScore * 100)}%
                    </span>
                  )}
                </div>
                {source.chunks[0] && (
                  <p className="text-foreground text-[0.85rem] leading-[1.4] m-0 opacity-85">
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
