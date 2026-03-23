'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { ChevronRight, FileText, Globe, Paperclip } from 'lucide-react';
import { cn } from '../../lib/utils';
import { type Citation } from '../../hooks/useChatGraphStream';
import { Citation as CitationCard } from '../tool-ui/citation/ProjectCitation';

export interface AdditionalSource {
  document_id?: string;
  document_title?: string;
  title?: string;
  source_url?: string | null;
  url?: string | null;
  snippet?: string;
  chunk_text?: string;
  similarity?: number;
  similarity_score?: number;
  collection_id?: string;
  collection_name?: string;
}

interface SearchResultsSectionProps {
  citations: Citation[];
  additionalSources?: AdditionalSource[];
}

interface DocumentGroup {
  documentId: string;
  title: string;
  maxScore: number;
  collectionId?: string;
  citations: Citation[];
}

interface AdditionalSourceGroup {
  id: string;
  title: string;
  url: string | null;
  maxScore: number;
  snippet: string;
  count: number;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '\u2026';
}

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

function groupAdditionalSources(sources: AdditionalSource[]): AdditionalSourceGroup[] {
  const groupMap = new Map<string, AdditionalSourceGroup>();

  for (const s of sources) {
    const id = s.document_id || s.document_title || s.title || '';
    const title = s.document_title || s.title || 'Unbekannte Quelle';
    const score = s.similarity_score ?? s.similarity ?? 0;
    const snippet = s.chunk_text || s.snippet || '';
    const url = s.source_url ?? s.url ?? null;

    const existing = groupMap.get(id);
    if (existing) {
      existing.count++;
      if (score > existing.maxScore) {
        existing.maxScore = score;
        if (snippet) existing.snippet = snippet;
      }
    } else {
      groupMap.set(id, { id, title, url, maxScore: score, snippet, count: 1 });
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => b.maxScore - a.maxScore);
}

export const SearchResultsSection = memo(function SearchResultsSection({
  citations,
  additionalSources,
}: SearchResultsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Listen for external expand requests (e.g. from CitationPopover "Mehr anzeigen")
  useEffect(() => {
    const handler = () => setIsOpen(true);
    document.addEventListener('citation-expand-sources', handler);
    return () => document.removeEventListener('citation-expand-sources', handler);
  }, []);

  const hasDocumentIds = citations.some((c) => c.documentId);
  const { documentGroups, ungrouped } = useMemo(
    () =>
      hasDocumentIds ? groupByDocument(citations) : { documentGroups: [], ungrouped: citations },
    [citations, hasDocumentIds]
  );

  if (citations.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {/* Collapsed trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
      >
        <Paperclip className="h-3.5 w-3.5" />
        <span>{citations.length} Quellen</span>
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
      </button>

      {isOpen && (
        <div className="mt-2">
          {hasDocumentIds ? (
            <DocumentGroupedView documentGroups={documentGroups} ungrouped={ungrouped} />
          ) : (
            <div className="space-y-3">
              {citations.map((citation) => (
                <CitationCard key={citation.id} {...citation} />
              ))}
            </div>
          )}

          {additionalSources && additionalSources.length > 0 && (
            <AdditionalSourcesSection sources={additionalSources} />
          )}
        </div>
      )}
    </div>
  );
});

const DocumentGroupedView = memo(function DocumentGroupedView({
  documentGroups,
  ungrouped,
}: {
  documentGroups: DocumentGroup[];
  ungrouped: Citation[];
}) {
  return (
    <div className="space-y-4">
      {documentGroups.map((group) => (
        <div key={group.documentId} className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <FileText className="h-3.5 w-3.5 text-foreground-muted flex-shrink-0" />
            <span className="text-xs font-medium text-foreground leading-tight line-clamp-1">
              {group.title}
            </span>
            {group.citations.length > 1 && (
              <span className="text-[10px] text-foreground-muted flex-shrink-0">
                {group.citations.length} Abschnitte
              </span>
            )}
          </div>

          <div className="space-y-2 pl-1">
            {group.citations.map((citation) => (
              <CitationCard key={citation.id} {...citation} compact />
            ))}
          </div>
        </div>
      ))}

      {ungrouped.length > 0 && (
        <div className="space-y-1">
          {documentGroups.length > 0 && (
            <div className="flex items-center gap-1.5 px-1">
              <Globe className="h-3.5 w-3.5 text-foreground-muted flex-shrink-0" />
              <span className="text-xs font-medium text-foreground">Web</span>
            </div>
          )}
          <div className="space-y-1 pl-1">
            {ungrouped.map((citation) => (
              <CitationCard key={citation.id} {...citation} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const AdditionalSourcesSection = memo(function AdditionalSourcesSection({
  sources,
}: {
  sources: AdditionalSource[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const grouped = useMemo(() => groupAdditionalSources(sources), [sources]);

  if (grouped.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-border/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
      >
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
        Weitere Quellen ({grouped.length})
      </button>

      {isOpen && (
        <div className="mt-2 space-y-1.5">
          {grouped.map((group) => (
            <div key={group.id} className="rounded-md border border-border/50 bg-card/50 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-foreground-muted flex-shrink-0" />
                {group.url ? (
                  <a
                    href={group.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-foreground leading-tight line-clamp-1 hover:underline hover:text-primary transition-colors"
                  >
                    {group.title}
                  </a>
                ) : (
                  <span className="text-xs font-medium text-foreground leading-tight line-clamp-1">
                    {group.title}
                  </span>
                )}
                {group.count > 1 && (
                  <span className="text-[10px] text-foreground-muted flex-shrink-0">
                    {group.count} Abschnitte
                  </span>
                )}
              </div>
              {group.snippet && (
                <p className="text-[11px] text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
                  {truncateText(group.snippet, 150)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
