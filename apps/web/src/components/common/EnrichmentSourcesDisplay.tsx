import { HiDocument, HiGlobeAlt, HiLink, HiLightningBolt, HiSearch } from 'react-icons/hi';

import { cn } from '../../utils/cn';

import type { JSX } from 'react';

/**
 * EnrichmentSourcesDisplay component - displays enrichment sources from generation
 * Shows: Auto-selected documents, URLs, web search results, manual selections
 * @param {Object} props - Component props
 * @param {Object} props.enrichmentSummary - Enrichment summary from backend
 * @param {string} props.title - Title for the sources section
 * @param {string} props.className - Additional CSS class
 * @returns {JSX.Element|null} Enrichment sources display or null if no sources
 */
interface EnrichmentSourcesDisplayProps {
  enrichmentSummary?: {
    sources?: {
      type?: string;
      title?: string;
      filename?: string;
      url?: string;
      relevance?: number;
    }[];
    urlsUsed?: boolean;
    webSearchUsed?: boolean;
    autoSearchUsed?: boolean;
  };
  title?: string;
  className?: string;
}

const EnrichmentSourcesDisplay = ({
  enrichmentSummary,
  title = 'Verwendete Quellen',
  className = '',
}: EnrichmentSourcesDisplayProps): JSX.Element | null => {
  if (!enrichmentSummary || !enrichmentSummary.sources || enrichmentSummary.sources.length === 0) {
    return null;
  }

  const { sources, urlsUsed, webSearchUsed, autoSearchUsed } = enrichmentSummary;

  // Group sources by type
  const groupedSources = {
    autoDocuments: sources.filter((s) => s.type === 'auto-document'),
    urls: sources.filter((s) => s.type === 'url'),
    webSearch: sources.filter((s) => s.type === 'websearch'),
  };

  const hasAutoDocuments = groupedSources.autoDocuments.length > 0;
  const hasUrls = groupedSources.urls.length > 0;
  const hasWebSearch = groupedSources.webSearch.length > 0;

  return (
    <div
      className={cn(
        'w-full mt-lg p-md bg-background-alt border border-grey-200 dark:border-grey-700 rounded-lg',
        'max-md:p-sm max-md:mt-md',
        className
      )}
    >
      <div className="flex items-center justify-between mb-md gap-sm flex-wrap max-md:flex-col max-md:items-start max-md:gap-xs">
        <h4 className="m-0 text-[1.1rem] max-md:text-base font-semibold text-foreground">
          {title}
        </h4>
        <div className="flex gap-xs flex-wrap">
          {autoSearchUsed && (
            <span
              className={cn(
                'inline-flex items-center gap-xxs px-xs py-[2px] rounded-sm text-xs max-md:text-[0.7rem] font-medium border',
                'bg-[rgba(95,133,117,0.1)] border-[var(--klee)] text-secondary-700',
                'dark:bg-[rgba(95,133,117,0.2)] dark:text-secondary-400',
                '[&_svg]:text-[0.9rem]'
              )}
            >
              <HiLightningBolt />
              Automatisch
            </span>
          )}
          {urlsUsed && (
            <span
              className={cn(
                'inline-flex items-center gap-xxs px-xs py-[2px] rounded-sm text-xs max-md:text-[0.7rem] font-medium border',
                'bg-[rgba(59,130,246,0.1)] border-[var(--interactive-accent-color)] text-[var(--interactive-accent-color)]',
                'dark:bg-[rgba(59,130,246,0.2)] dark:text-[var(--interactive-accent-color)]',
                '[&_svg]:text-[0.9rem]'
              )}
            >
              <HiLink />
              URLs
            </span>
          )}
          {webSearchUsed && (
            <span
              className={cn(
                'inline-flex items-center gap-xxs px-xs py-[2px] rounded-sm text-xs max-md:text-[0.7rem] font-medium border',
                'bg-[rgba(251,188,5,0.1)] border-[var(--sonne)] text-[var(--sonne-dark)]',
                'dark:bg-[rgba(251,188,5,0.2)] dark:text-[var(--sonne)]',
                '[&_svg]:text-[0.9rem]'
              )}
            >
              <HiSearch />
              Websuche
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-md">
        {/* Auto-selected Documents */}
        {hasAutoDocuments && (
          <div className="flex flex-col gap-sm">
            <div className="flex items-center gap-xs pb-xs border-b border-grey-200 dark:border-grey-700">
              <HiLightningBolt className="text-[1.1rem] text-secondary-600 dark:text-secondary-400" />
              <h5 className="m-0 flex-1 text-[0.95rem] max-md:text-sm font-semibold text-foreground">
                Automatisch ausgewählte Dokumente
              </h5>
              <span className="text-[0.8rem] text-grey-400 bg-background px-xs py-[2px] rounded-sm border border-grey-200 dark:border-grey-700">
                {groupedSources.autoDocuments.length}
              </span>
            </div>
            <div className="flex flex-col gap-xs">
              {groupedSources.autoDocuments.map((doc, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-sm max-md:gap-xs p-sm max-md:p-xs',
                    'bg-background border border-grey-200 dark:border-grey-700 rounded-sm',
                    'transition-all duration-150 ease-in-out',
                    'hover:border-[var(--interactive-accent-color)] hover:shadow-sm'
                  )}
                >
                  <HiDocument className="shrink-0 text-[1.2rem] max-md:text-base mt-[2px] text-secondary-600 dark:text-secondary-400" />
                  <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
                    <div className="text-sm max-md:text-[0.8rem] font-medium text-foreground overflow-hidden text-ellipsis line-clamp-2">
                      {doc.title}
                    </div>
                    {doc.filename && (
                      <div className="text-xs max-md:text-[0.7rem] text-grey-400 overflow-hidden text-ellipsis whitespace-nowrap">
                        {doc.filename}
                      </div>
                    )}
                    {doc.relevance && (
                      <div className="text-xs max-md:text-[0.7rem] text-grey-400 font-medium">
                        Relevanz: {doc.relevance}%
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* URLs */}
        {hasUrls && (
          <div className="flex flex-col gap-sm">
            <div className="flex items-center gap-xs pb-xs border-b border-grey-200 dark:border-grey-700">
              <HiLink className="text-[1.1rem] text-secondary-600 dark:text-secondary-400" />
              <h5 className="m-0 flex-1 text-[0.95rem] max-md:text-sm font-semibold text-foreground">
                URLs
              </h5>
              <span className="text-[0.8rem] text-grey-400 bg-background px-xs py-[2px] rounded-sm border border-grey-200 dark:border-grey-700">
                {groupedSources.urls.length}
              </span>
            </div>
            <div className="flex flex-col gap-xs">
              {groupedSources.urls.map((urlSource, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-sm max-md:gap-xs p-sm max-md:p-xs',
                    'bg-background border border-grey-200 dark:border-grey-700 rounded-sm',
                    'transition-all duration-150 ease-in-out',
                    'hover:border-[var(--interactive-accent-color)] hover:shadow-sm'
                  )}
                >
                  <HiLink className="shrink-0 text-[1.2rem] max-md:text-base mt-[2px] text-[var(--interactive-accent-color)]" />
                  <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
                    <div className="text-sm max-md:text-[0.8rem] font-medium text-foreground overflow-hidden text-ellipsis line-clamp-2">
                      {urlSource.title || 'URL'}
                    </div>
                    {urlSource.url && (
                      <a
                        href={urlSource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs max-md:text-[0.7rem] text-[var(--interactive-accent-color)] no-underline overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-150 hover:text-[var(--interactive-accent-color-hover)] hover:underline"
                      >
                        {urlSource.url}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Web Search Results */}
        {hasWebSearch && (
          <div className="flex flex-col gap-sm">
            <div className="flex items-center gap-xs pb-xs border-b border-grey-200 dark:border-grey-700">
              <HiGlobeAlt className="text-[1.1rem] text-secondary-600 dark:text-secondary-400" />
              <h5 className="m-0 flex-1 text-[0.95rem] max-md:text-sm font-semibold text-foreground">
                Websuche
              </h5>
              <span className="text-[0.8rem] text-grey-400 bg-background px-xs py-[2px] rounded-sm border border-grey-200 dark:border-grey-700">
                {groupedSources.webSearch.length}
              </span>
            </div>
            <div className="flex flex-col gap-xs">
              {groupedSources.webSearch.map((result, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-start gap-sm max-md:gap-xs p-sm max-md:p-xs',
                    'bg-background border border-grey-200 dark:border-grey-700 rounded-sm',
                    'transition-all duration-150 ease-in-out',
                    'hover:border-[var(--interactive-accent-color)] hover:shadow-sm'
                  )}
                >
                  <HiGlobeAlt className="shrink-0 text-[1.2rem] max-md:text-base mt-[2px] text-[var(--sonne-dark)] dark:text-[var(--sonne)]" />
                  <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
                    <div className="text-sm max-md:text-[0.8rem] font-medium text-foreground overflow-hidden text-ellipsis line-clamp-2">
                      {result.title}
                    </div>
                    {result.url && (
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs max-md:text-[0.7rem] text-[var(--interactive-accent-color)] no-underline overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-150 hover:text-[var(--interactive-accent-color-hover)] hover:underline"
                      >
                        {result.url}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrichmentSourcesDisplay;
