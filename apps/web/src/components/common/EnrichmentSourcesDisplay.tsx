import { HiDocument, HiGlobeAlt, HiLink, HiLightningBolt, HiSearch } from 'react-icons/hi';
import './EnrichmentSourcesDisplay.css';

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
    relevance?: number
  }[];
    urlsUsed?: boolean;
    webSearchUsed?: boolean;
    autoSearchUsed?: boolean
  };
  title?: string;
  className?: string;
}

const EnrichmentSourcesDisplay = ({ enrichmentSummary = null,
  title = "Verwendete Quellen",
  className = "" }: EnrichmentSourcesDisplayProps): JSX.Element => {
  if (!enrichmentSummary || !enrichmentSummary.sources || enrichmentSummary.sources.length === 0) {
    return null;
  }

  const { sources, urlsUsed, webSearchUsed, autoSearchUsed } = enrichmentSummary;

  // Group sources by type
  const groupedSources = {
    autoDocuments: sources.filter(s => s.type === 'auto-document'),
    urls: sources.filter(s => s.type === 'url'),
    webSearch: sources.filter(s => s.type === 'websearch')
  };

  const hasAutoDocuments = groupedSources.autoDocuments.length > 0;
  const hasUrls = groupedSources.urls.length > 0;
  const hasWebSearch = groupedSources.webSearch.length > 0;

  return (
    <div className={`enrichment-sources ${className}`}>
      <div className="enrichment-sources__header">
        <h4 className="enrichment-sources__title">{title}</h4>
        <div className="enrichment-sources__badges">
          {autoSearchUsed && (
            <span className="enrichment-badge enrichment-badge--auto">
              <HiLightningBolt />
              Automatisch
            </span>
          )}
          {urlsUsed && (
            <span className="enrichment-badge enrichment-badge--url">
              <HiLink />
              URLs
            </span>
          )}
          {webSearchUsed && (
            <span className="enrichment-badge enrichment-badge--web">
              <HiSearch />
              Websuche
            </span>
          )}
        </div>
      </div>

      <div className="enrichment-sources__content">
        {/* Auto-selected Documents */}
        {hasAutoDocuments && (
          <div className="enrichment-source-group">
            <div className="enrichment-source-group__header">
              <HiLightningBolt className="group-icon" />
              <h5 className="group-title">Automatisch ausgewählte Dokumente</h5>
              <span className="group-count">{groupedSources.autoDocuments.length}</span>
            </div>
            <div className="enrichment-source-list">
              {groupedSources.autoDocuments.map((doc, index) => (
                <div key={index} className="enrichment-source-item enrichment-source-item--document">
                  <HiDocument className="source-icon" />
                  <div className="source-content">
                    <div className="source-title">{doc.title}</div>
                    {doc.filename && (
                      <div className="source-subtitle">{doc.filename}</div>
                    )}
                    {doc.relevance && (
                      <div className="source-meta">
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
          <div className="enrichment-source-group">
            <div className="enrichment-source-group__header">
              <HiLink className="group-icon" />
              <h5 className="group-title">URLs</h5>
              <span className="group-count">{groupedSources.urls.length}</span>
            </div>
            <div className="enrichment-source-list">
              {groupedSources.urls.map((urlSource, index) => (
                <div key={index} className="enrichment-source-item enrichment-source-item--url">
                  <HiLink className="source-icon" />
                  <div className="source-content">
                    <div className="source-title">{urlSource.title || 'URL'}</div>
                    {urlSource.url && (
                      <a
                        href={urlSource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-link"
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
          <div className="enrichment-source-group">
            <div className="enrichment-source-group__header">
              <HiGlobeAlt className="group-icon" />
              <h5 className="group-title">Websuche</h5>
              <span className="group-count">{groupedSources.webSearch.length}</span>
            </div>
            <div className="enrichment-source-list">
              {groupedSources.webSearch.map((result, index) => (
                <div key={index} className="enrichment-source-item enrichment-source-item--web">
                  <HiGlobeAlt className="source-icon" />
                  <div className="source-content">
                    <div className="source-title">{result.title}</div>
                    {result.url && (
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="source-link"
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
