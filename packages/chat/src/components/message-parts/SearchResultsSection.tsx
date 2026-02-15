'use client';

import { useState, useMemo, memo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Citation } from '../../hooks/useChatGraphStream';
import {
  COLLECTION_STYLES,
  getCollectionKey,
  getCollectionStyle,
  getRelevanceColor,
} from '../../lib/collectionStyles';

interface SearchResultsSectionProps {
  citations: Citation[];
}

const INITIAL_VISIBLE = 4;

export const SearchResultsSection = memo(function SearchResultsSection({
  citations,
}: SearchResultsSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, Citation[]> = {};
    for (const c of citations) {
      const key = getCollectionKey(c.source);
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return groups;
  }, [citations]);

  const visibleCitations = showAll ? citations : citations.slice(0, INITIAL_VISIBLE);
  const hasMore = citations.length > INITIAL_VISIBLE;
  const collectionKeys = Object.keys(grouped);

  if (citations.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {/* Collection pills summary */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className="text-xs font-medium text-foreground-muted">Quellen:</span>
        {collectionKeys.map((key) => {
          const style = COLLECTION_STYLES[key] || getCollectionStyle(key);
          return (
            <span
              key={key}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: style.bg, color: style.color }}
            >
              {style.label} ({grouped[key].length})
            </span>
          );
        })}
      </div>

      {/* Citation cards */}
      <div className="space-y-1.5">
        {visibleCitations.map((citation) => (
          <CitationCard
            key={citation.id}
            citation={citation}
            isExpanded={expandedId === citation.id}
            onToggle={() => setExpandedId(expandedId === citation.id ? null : citation.id)}
          />
        ))}
      </div>

      {/* Show more / less toggle */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', showAll && 'rotate-180')}
          />
          {showAll ? 'Weniger anzeigen' : `Alle ${citations.length} Quellen anzeigen`}
        </button>
      )}
    </div>
  );
});

const CitationCard = memo(function CitationCard({
  citation,
  isExpanded,
  onToggle,
}: {
  citation: Citation;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const style = getCollectionStyle(citation.source);
  const hasExpandableContent =
    citation.citedText && citation.citedText.length > (citation.snippet?.length || 0);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-primary/30">
      <button
        onClick={hasExpandableContent ? onToggle : undefined}
        className={cn(
          'w-full text-left px-3 py-2 flex items-start gap-2',
          hasExpandableContent && 'cursor-pointer'
        )}
      >
        {/* Citation number badge */}
        <span
          className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold mt-0.5"
          style={{ backgroundColor: style.bg, color: style.color }}
        >
          {citation.id}
        </span>

        <div className="min-w-0 flex-1">
          {/* Title + relevance dot */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground leading-tight line-clamp-1">
              {citation.title}
            </span>
            {citation.relevance != null && (
              <span
                className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getRelevanceColor(citation.relevance) }}
                title={`Relevanz: ${Math.round(citation.relevance * 100)}%`}
              />
            )}
          </div>

          {/* Collection badge + domain */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {citation.collectionName && (
              <span
                className="text-[10px] font-medium px-1 py-px rounded"
                style={{ backgroundColor: style.bg, color: style.color }}
              >
                {citation.collectionName}
              </span>
            )}
            {citation.contentType && (
              <span className="text-[10px] text-foreground-muted italic">
                {citation.contentType}
              </span>
            )}
            {citation.domain && (
              <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
            )}
          </div>

          {/* Snippet preview */}
          <p className="text-xs text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
            {citation.snippet}
          </p>
        </div>

        {/* Expand chevron + external link */}
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {citation.url && (
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-foreground-muted hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
              aria-label="Quelle öffnen"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {hasExpandableContent && (
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-foreground-muted transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          )}
        </div>
      </button>

      {/* Expanded full text */}
      {isExpanded && citation.citedText && (
        <div className="px-3 pb-3 pt-0 border-t border-border/50">
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap mt-2">
            {citation.citedText}
          </p>
        </div>
      )}
    </div>
  );
});
