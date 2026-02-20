'use client';

import { useState, useMemo, memo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FileText, Globe } from 'lucide-react';
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

interface DocumentGroup {
  documentId: string;
  title: string;
  maxScore: number;
  collectionId?: string;
  citations: Citation[];
}

const INITIAL_VISIBLE = 4;

function groupByDocument(citations: Citation[]): {
  documentGroups: DocumentGroup[];
  ungrouped: Citation[];
} {
  const docMap = new Map<string, DocumentGroup>();
  const ungrouped: Citation[] = [];

  for (const c of citations) {
    if (c.documentId) {
      const existing = docMap.get(c.documentId);
      if (existing) {
        existing.citations.push(c);
        const score = c.similarityScore ?? c.relevance ?? 0;
        if (score > existing.maxScore) {
          existing.maxScore = score;
          existing.title = c.title;
        }
      } else {
        docMap.set(c.documentId, {
          documentId: c.documentId,
          title: c.title,
          maxScore: c.similarityScore ?? c.relevance ?? 0,
          collectionId: c.collectionId,
          citations: [c],
        });
      }
    } else {
      ungrouped.push(c);
    }
  }

  const documentGroups = Array.from(docMap.values()).sort((a, b) => b.maxScore - a.maxScore);
  return { documentGroups, ungrouped };
}

export const SearchResultsSection = memo(function SearchResultsSection({
  citations,
}: SearchResultsSectionProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const collectionGroups = useMemo(() => {
    const groups: Record<string, Citation[]> = {};
    for (const c of citations) {
      const key = getCollectionKey(c.source);
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return groups;
  }, [citations]);

  const hasDocumentIds = citations.some((c) => c.documentId);
  const { documentGroups, ungrouped } = useMemo(
    () =>
      hasDocumentIds ? groupByDocument(citations) : { documentGroups: [], ungrouped: citations },
    [citations, hasDocumentIds]
  );

  const collectionKeys = Object.keys(collectionGroups);

  if (citations.length === 0) return null;

  const totalVisible = showAll ? citations.length : INITIAL_VISIBLE;
  const hasMore = citations.length > INITIAL_VISIBLE;

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
              {style.label} ({collectionGroups[key].length})
            </span>
          );
        })}
      </div>

      {/* Document-grouped view when documentId data is available */}
      {hasDocumentIds ? (
        <DocumentGroupedView
          documentGroups={documentGroups}
          ungrouped={ungrouped}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
          maxVisible={totalVisible}
        />
      ) : (
        <div className="space-y-1.5">
          {(showAll ? citations : citations.slice(0, INITIAL_VISIBLE)).map((citation) => (
            <CitationCard
              key={citation.id}
              citation={citation}
              isExpanded={expandedId === citation.id}
              onToggle={() => setExpandedId(expandedId === citation.id ? null : citation.id)}
            />
          ))}
        </div>
      )}

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

const DocumentGroupedView = memo(function DocumentGroupedView({
  documentGroups,
  ungrouped,
  expandedId,
  onToggle,
  maxVisible,
}: {
  documentGroups: DocumentGroup[];
  ungrouped: Citation[];
  expandedId: number | null;
  onToggle: (id: number) => void;
  maxVisible: number;
}) {
  let rendered = 0;

  return (
    <div className="space-y-2.5">
      {documentGroups.map((group) => {
        if (rendered >= maxVisible) return null;
        const citationsToShow = group.citations.slice(0, maxVisible - rendered);
        rendered += citationsToShow.length;

        const style = group.collectionId
          ? getCollectionStyle(`gruenerator:${group.collectionId}`)
          : getCollectionStyle(group.citations[0]?.source || '');
        const scorePercent = Math.round(group.maxScore * 100);

        return (
          <div key={group.documentId} className="space-y-1">
            {/* Document header */}
            <div className="flex items-center gap-1.5 px-1">
              <FileText className="h-3.5 w-3.5 text-foreground-muted flex-shrink-0" />
              <span className="text-xs font-medium text-foreground leading-tight line-clamp-1">
                {group.title}
              </span>
              {scorePercent > 0 && (
                <span
                  className="text-[10px] font-medium px-1.5 py-px rounded-full flex-shrink-0"
                  style={{ backgroundColor: style.bg, color: style.color }}
                >
                  {scorePercent}%
                </span>
              )}
              {group.citations.length > 1 && (
                <span className="text-[10px] text-foreground-muted flex-shrink-0">
                  {group.citations.length} Abschnitte
                </span>
              )}
            </div>

            {/* Citations within this document */}
            <div className="space-y-1 pl-1">
              {citationsToShow.map((citation) => (
                <CitationCard
                  key={citation.id}
                  citation={citation}
                  isExpanded={expandedId === citation.id}
                  onToggle={() => onToggle(citation.id)}
                  compact
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Ungrouped citations (web results, etc.) */}
      {ungrouped.length > 0 && rendered < maxVisible && (
        <div className="space-y-1">
          {ungrouped.length > 0 && documentGroups.length > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              <Globe className="h-3.5 w-3.5 text-foreground-muted flex-shrink-0" />
              <span className="text-xs font-medium text-foreground">Web</span>
            </div>
          )}
          <div className="space-y-1 pl-1">
            {ungrouped.slice(0, maxVisible - rendered).map((citation) => (
              <CitationCard
                key={citation.id}
                citation={citation}
                isExpanded={expandedId === citation.id}
                onToggle={() => onToggle(citation.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const CitationCard = memo(function CitationCard({
  citation,
  isExpanded,
  onToggle,
  compact,
}: {
  citation: Citation;
  isExpanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const style = getCollectionStyle(citation.source);
  const hasExpandableContent =
    citation.citedText && citation.citedText.length > (citation.snippet?.length || 0);

  const displayScore = citation.similarityScore ?? citation.relevance;

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
          {/* Title + relevance score */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground leading-tight line-clamp-1">
              {compact ? citation.snippet?.slice(0, 60) || citation.title : citation.title}
            </span>
            {displayScore != null && (
              <span
                className="flex-shrink-0 text-[10px] font-medium px-1 py-px rounded"
                style={{
                  color: getRelevanceColor(displayScore),
                  backgroundColor: 'transparent',
                }}
                title={`Relevanz: ${Math.round(displayScore * 100)}%`}
              >
                {Math.round(displayScore * 100)}%
              </span>
            )}
          </div>

          {/* Collection badge + domain + chunk indicator */}
          <div className="flex items-center gap-1.5 mt-0.5">
            {citation.collectionName && !compact && (
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
            {citation.domain && !compact && (
              <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
            )}
            {citation.chunkIndex != null && (
              <span className="text-[10px] text-foreground-muted">
                Abschn. {citation.chunkIndex}
              </span>
            )}
          </div>

          {/* Snippet preview */}
          {!compact && (
            <p className="text-xs text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
              {citation.snippet}
            </p>
          )}
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
