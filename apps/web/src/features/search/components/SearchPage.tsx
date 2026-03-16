import { useState, useMemo, useCallback } from 'react';
import { FaFileWord } from 'react-icons/fa';

import ActionButtons from '../../../components/common/ActionButtons';
import { CitationModal, CitationSourcesDisplay } from '../../../components/common/Citation';
import ContentRenderer from '../../../components/common/Form/BaseForm/ContentRenderer';
import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../../components/ErrorBoundary';
import { useExportStore } from '../../../stores/core/exportStore';
import useSearch from '../hooks/useSearch';

import SearchBar from './SearchBar';

interface SourceListSource {
  url: string;
  title?: string;
  content_snippets?: string;
}

interface SourceListRecommendation {
  title: string;
  summary: string;
}

interface SourceListProps {
  sources: SourceListSource[];
  title: string;
  recommendations?: SourceListRecommendation[];
}

const extractMainDomain = (url: string) => {
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const SourceList = ({ sources, title, recommendations = [] }: SourceListProps) => (
  <div className="w-full">
    <h2 className="mb-4 text-xl font-medium text-foreground-heading md:px-4">{title}</h2>
    <div className="grid grid-cols-1 gap-4 px-0 md:grid-cols-2 md:px-4">
      {sources.map((source, index) => {
        const recommendation = source.title
          ? recommendations.find((r) => r.title === source.title)
          : undefined;
        const hasSnippets = source.content_snippets && source.content_snippets.trim().length > 0;

        return (
          <a
            key={index}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block h-full overflow-hidden rounded-lg bg-background-alt p-4 no-underline transition-colors duration-200 hover:bg-hover-alt max-md:rounded-xl max-md:p-3.5 dark:bg-hover-alt dark:hover:bg-hover-alt"
          >
            <h3 className="mb-2 text-base font-medium leading-snug text-foreground [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box] [overflow:hidden] max-md:mb-1.5 max-md:text-sm">
              {source.title || 'Unbenannte Quelle'}
            </h3>
            {recommendation && (
              <div className="my-2 text-sm text-foreground max-md:text-[13px]">
                <p className="m-0 leading-snug max-md:leading-tight">{recommendation.summary}</p>
              </div>
            )}
            {hasSnippets && source.content_snippets && (
              <div className="my-2.5 mb-2 rounded border-l-[3px] border-l-primary-500 bg-background px-3 py-2 dark:border-l-secondary-600 dark:bg-background-alt max-md:my-2 max-md:mb-1.5 max-md:px-2.5 max-md:py-1.5">
                <p className="m-0 break-words whitespace-pre-wrap text-[13px] leading-snug text-foreground/85 max-md:text-xs max-md:leading-tight">
                  {source.content_snippets.length > 200
                    ? `${source.content_snippets.substring(0, 200)}...`
                    : source.content_snippets}
                </p>
              </div>
            )}
            <span className="block w-full truncate text-sm text-foreground/70 max-md:text-xs">
              {extractMainDomain(source.url)}
            </span>
          </a>
        );
      })}
    </div>
  </div>
);

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState('web');
  const generateNotebookDOCX = useExportStore((state) => state.generateNotebookDOCX);
  const {
    results,
    usedSources,
    analysis,
    loading,
    error,
    deepSearch,
    webSearch,
    webResults,
    dossier,
    categorizedSources,
    sourceRecommendations = [],
    citations = [],
    citationSources = [],
    streamingText,
    isStreaming,
    progress,
    abort,
  } = useSearch();

  const hasCitations = citations.length > 0;

  const handleWebSearchDOCXExport = useCallback(async () => {
    if (!hasCitations || !webResults?.summary?.text) return;
    await generateNotebookDOCX(
      webResults.summary.text,
      'Web-Suche Zusammenfassung',
      citations,
      citationSources
    );
  }, [hasCitations, webResults, citations, citationSources, generateNotebookDOCX]);

  const handleDeepResearchDOCXExport = useCallback(async () => {
    if (!hasCitations || !dossier) return;
    await generateNotebookDOCX(dossier, 'Recherche-Dossier', citations, citationSources);
  }, [hasCitations, dossier, citations, citationSources, generateNotebookDOCX]);

  const webSearchExportOptions = useMemo(() => {
    if (!hasCitations) return [];
    return [
      {
        id: 'web-search-docx',
        label: 'Word mit Quellen',
        subtitle: 'Inkl. Quellenangaben',
        icon: <FaFileWord size={16} />,
        onClick: handleWebSearchDOCXExport,
      },
    ];
  }, [hasCitations, handleWebSearchDOCXExport]);

  const deepResearchExportOptions = useMemo(() => {
    if (!hasCitations) return [];
    return [
      {
        id: 'deep-research-docx',
        label: 'Word mit Quellen',
        subtitle: 'Inkl. Quellenangaben',
        icon: <FaFileWord size={16} />,
        onClick: handleDeepResearchDOCXExport,
      },
    ];
  }, [hasCitations, handleDeepResearchDOCXExport]);

  const handleSearch = (query?: string) => {
    if (!query) return;
    if (searchMode === 'deep') {
      deepSearch(query);
    } else {
      webSearch(query);
    }
  };

  const toggleDeepResearch = () => {
    setSearchMode((prev) => (prev === 'deep' ? 'web' : 'deep'));
  };

  // Berechne die nicht verwendeten Quellen
  const unusedSources = results.filter(
    (result) => !usedSources.some((used) => used.url === result.url)
  );

  return (
    <ErrorBoundary>
      <CitationModal />
      <div className="flex min-h-screen flex-col items-center bg-background p-5 transition-colors duration-300">
        <div className="mb-8 mt-24 flex w-full max-w-[1200px] flex-col items-center text-center max-md:mt-lg max-md:mb-md max-md:px-md">
          <h1 className="m-0 text-[56px] leading-tight tracking-tight text-foreground-heading max-md:text-4xl max-md:leading-snug dark:text-secondary-600">
            Grünerator Suche
          </h1>
          <p className="mt-3 text-xl font-normal text-foreground/80 max-md:mt-3 max-md:px-2 max-md:text-base">
            KI-Suche des Grünerators
          </p>
        </div>

        <SearchBar
          onSearch={handleSearch}
          loading={loading}
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={
            searchMode === 'deep'
              ? 'Thema für umfassende Recherche eingeben...'
              : 'Web-Suchbegriff eingeben...'
          }
          onDeepResearchToggle={toggleDeepResearch}
          isDeepResearchActive={searchMode === 'deep'}
          isStreaming={isStreaming}
          onAbort={abort}
        />

        {isStreaming && progress.message && (
          <div className="my-5 w-full max-w-[584px] rounded-lg border-l-4 border-l-primary-500 bg-background-alt p-4 max-md:mx-4 max-md:my-4 max-md:p-3 dark:bg-hover-alt">
            <p className="m-0 text-sm leading-snug text-foreground max-md:text-[13px]">
              {progress.message}
            </p>
          </div>
        )}

        {isStreaming && streamingText && (
          <div className="analysis-container relative mx-auto my-5 w-full max-w-[750px] rounded-lg bg-background-alt p-[35px] shadow-sm max-md:mx-4 max-md:my-4 max-md:p-4 dark:bg-hover-alt">
            <div className="analysis-content text-base leading-relaxed text-foreground [text-align:justify] [hyphens:auto] max-md:text-[15px] max-md:leading-relaxed">
              <h2 className="mb-4 text-xl font-medium text-foreground-heading">
                {searchMode === 'deep' ? 'Forschungsdossier' : 'AI-Zusammenfassung'}
              </h2>
              <ContentRenderer
                value={streamingText}
                useMarkdown={true}
                componentName={
                  searchMode === 'deep' ? 'deep-research-dossier' : 'web-search-summary'
                }
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 w-full max-w-[584px] rounded-lg border border-[var(--sonne)] bg-[rgba(255,241,122,0.2)] px-4 py-3 text-center text-foreground max-md:mx-4 max-md:max-w-[calc(100%-32px)] max-md:text-sm dark:bg-[rgba(255,241,122,0.1)]">
            {error}
          </div>
        )}

        {/* Web Search Results */}
        {!isStreaming && webResults && searchMode === 'web' && (
          <div>
            {webResults.summary && (
              <div className="analysis-container relative mx-auto my-5 w-full max-w-[750px] rounded-lg bg-background-alt p-[35px] shadow-sm max-md:mx-4 max-md:my-4 max-md:p-4 dark:bg-hover-alt">
                <div className="absolute right-6 top-6 z-[1] flex gap-2 max-md:right-4 max-md:top-4">
                  <ActionButtons
                    generatedContent={webResults.summary.text}
                    onEdit={() => {}}
                    isEditing={false}
                    allowEditing={false}
                    hideEditButton={true}
                    showExport={true}
                    customExportOptions={webSearchExportOptions}
                  />
                </div>
                <div className="analysis-content text-base leading-relaxed text-foreground [text-align:justify] [hyphens:auto] max-md:text-[15px] max-md:leading-relaxed">
                  <h2 className="mb-4 text-xl font-medium text-foreground-heading">
                    🤖 AI-Zusammenfassung
                  </h2>
                  <ContentRenderer
                    value={webResults.summary.text}
                    useMarkdown={true}
                    componentName="web-search-summary"
                  />
                </div>

                {searchMode === 'web' && citations.length > 0 && (
                  <div className="mt-4">
                    <CitationSourcesDisplay
                      sources={
                        citationSources as unknown as Array<{
                          url?: string;
                          title?: string;
                          [key: string]: unknown;
                        }>
                      }
                      citations={
                        citations as unknown as Array<{ id: string; [key: string]: unknown }>
                      }
                      linkConfig={{ type: 'none' }}
                      title="🔗 Quellen der Zusammenfassung"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              {webResults.results && webResults.results.length > 0 && (
                <div className="mx-auto my-5 flex w-full max-w-[800px] flex-col gap-8">
                  <SourceList
                    sources={webResults.results.map((result) => ({
                      url: result.url,
                      title: result.title,
                      content_snippets: result.snippet || '',
                    }))}
                    title={`🌐 Web-Suchergebnisse (${webResults.resultCount})`}
                  />
                </div>
              )}

              {webResults.suggestions && webResults.suggestions.length > 0 && (
                <div className="mx-auto my-5 w-full max-w-[800px] px-4">
                  <h3 className="mb-3 text-lg font-medium text-foreground-heading">
                    💡 Suchvorschläge
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {webResults.suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        className="rounded-full border border-grey-200 bg-background-alt px-3 py-1.5 text-sm text-foreground transition-colors duration-200 hover:border-primary-500 hover:text-primary-600 dark:border-grey-700"
                        onClick={() => handleSearch(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Deep Research Results */}
        {!isStreaming && dossier && searchMode === 'deep' && (
          <>
            <div className="dossier-container relative mx-auto my-5 w-full max-w-[900px] rounded-lg bg-background-alt p-10 shadow-sm max-md:mx-4 max-md:my-4 max-md:p-5 dark:bg-hover-alt">
              <div className="absolute right-6 top-6 z-[1] flex gap-2 max-md:right-4 max-md:top-4">
                <ActionButtons
                  generatedContent={dossier}
                  onEdit={() => {}}
                  isEditing={false}
                  allowEditing={false}
                  hideEditButton={true}
                  showExport={true}
                  customExportOptions={deepResearchExportOptions}
                />
              </div>
              <div className="dossier-content text-base leading-relaxed text-foreground max-md:text-[15px] max-md:leading-relaxed">
                <ContentRenderer
                  value={dossier}
                  useMarkdown={true}
                  componentName="deep-research-dossier"
                />
              </div>

              {searchMode === 'deep' && citations.length > 0 && (
                <div className="mt-4">
                  <CitationSourcesDisplay
                    sources={
                      citationSources as unknown as Array<{
                        url?: string;
                        title?: string;
                        [key: string]: unknown;
                      }>
                    }
                    citations={
                      citations as unknown as Array<{ id: string; [key: string]: unknown }>
                    }
                    linkConfig={{ type: 'none' }}
                    title="🔗 Quellen des Dossiers"
                  />
                </div>
              )}
            </div>

            {categorizedSources && Object.keys(categorizedSources).length > 0 && (
              <div className="mx-auto my-5 w-full max-w-[900px] max-md:mx-auto max-md:my-4">
                <h2 className="mb-6 text-center text-2xl text-foreground-heading max-md:mb-4 max-md:px-4 max-md:text-xl">
                  Quellen nach Themenbereichen
                </h2>
                {Object.entries(categorizedSources).map(([category, sources]) => (
                  <SourceList
                    key={category}
                    sources={sources}
                    title={category}
                    recommendations={sourceRecommendations}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Standard Search Results */}
        {analysis && searchMode === 'standard' && (
          <>
            <div className="analysis-container relative mx-auto my-5 w-full max-w-[750px] rounded-lg bg-background-alt p-[35px] shadow-sm max-md:mx-4 max-md:my-4 max-md:p-4 dark:bg-hover-alt">
              <div className="absolute right-6 top-6 z-[1] flex gap-2 max-md:right-4 max-md:top-4">
                <ActionButtons
                  generatedContent={analysis}
                  onEdit={() => {}}
                  isEditing={false}
                  allowEditing={false}
                  hideEditButton={true}
                  showExport={true}
                />
              </div>
              <div
                className="analysis-content text-base leading-relaxed text-foreground [text-align:justify] [hyphens:auto] max-md:text-[15px] max-md:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: analysis }}
              />
            </div>

            <div className="mx-auto my-5 flex w-full max-w-[800px] flex-col gap-8">
              {usedSources.length > 0 && (
                <SourceList
                  sources={usedSources}
                  title="Verwendete Quellen"
                  recommendations={sourceRecommendations}
                />
              )}

              {unusedSources.length > 0 && (
                <SourceList
                  sources={unusedSources}
                  title="Ergänzende Informationen"
                  recommendations={sourceRecommendations}
                />
              )}
            </div>
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default withAuthRequired(SearchPage, {
  title: 'Suche',
  message: 'Melde dich an, um die Suche zu nutzen.',
});
