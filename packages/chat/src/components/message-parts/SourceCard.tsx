'use client';

import { useState, useCallback } from 'react';
import type { SourceMessagePartProps } from '@assistant-ui/react';
import { ExternalLink, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCitationContext } from '../../context/CitationContext';
import { getCollectionStyle } from '../../lib/collectionStyles';

const MAX_FULL_TEXT_DISPLAY = 50_000;

export function SourceCard(props: SourceMessagePartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [isLoadingFullText, setIsLoadingFullText] = useState(false);
  const [fullTextError, setFullTextError] = useState<string | null>(null);
  const { citations, fetchFullText } = useCitationContext();

  const citationId = parseInt(props.id.replace('source-', ''), 10);
  const citation = citations.find((c) => c.id === citationId);

  const title = citation?.title || props.title || props.url;
  const style = citation
    ? getCollectionStyle(citation.source)
    : {
        color: 'var(--color-foreground-muted)',
        bg: 'var(--color-surface)',
        label: 'Quelle',
      };
  const hasExpandableContent =
    citation?.citedText && citation.citedText.length > (citation.snippet?.length || 0);

  const canLoadFullText =
    isExpanded && fetchFullText && citation?.url && citation?.collectionId && !fullText;

  const handleLoadFullText = useCallback(async () => {
    if (!fetchFullText || !citation?.url || !citation?.collectionId) return;
    setIsLoadingFullText(true);
    setFullTextError(null);
    try {
      const text = await fetchFullText(citation.url, citation.collectionId);
      if (text) {
        setFullText(
          text.length > MAX_FULL_TEXT_DISPLAY
            ? text.slice(0, MAX_FULL_TEXT_DISPLAY) + '\n\n[...]'
            : text
        );
      } else {
        setFullTextError('Volltext nicht verfügbar');
      }
    } catch {
      setFullTextError('Fehler beim Laden des Volltexts');
    } finally {
      setIsLoadingFullText(false);
    }
  }, [fetchFullText, citation?.url, citation?.collectionId]);

  // Build metadata: domain · collection
  const metaParts: string[] = [];
  if (citation?.domain) metaParts.push(citation.domain);
  if (citation?.collectionName) metaParts.push(style.label || citation.collectionName);
  const metaLine = metaParts.join(' · ');

  return (
    <div
      id={`source-card-${citationId}`}
      className="rounded-md border border-border/50 bg-card overflow-hidden transition-colors hover:border-border"
    >
      <button
        onClick={hasExpandableContent ? () => setIsExpanded(!isExpanded) : undefined}
        className={cn(
          'w-full text-left px-3 py-2 flex items-start gap-2',
          hasExpandableContent && 'cursor-pointer'
        )}
      >
        {/* Plain citation number */}
        <span className="flex-shrink-0 text-xs font-semibold text-foreground-muted mt-0.5">
          [{citationId || '#'}]
        </span>

        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground leading-tight line-clamp-1">
            {title}
          </span>

          {metaLine && (
            <span className="text-xs text-foreground-muted mt-0.5 block">{metaLine}</span>
          )}

          {citation?.snippet && (
            <p className="text-xs text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
              {citation.snippet}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          {props.url && (
            <a
              href={props.url}
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

      {isExpanded && citation?.citedText && (
        <div className="px-3 pb-3 pt-0 border-t border-border/50">
          {fullText ? (
            <div className="max-h-[400px] overflow-y-auto mt-2">
              <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {fullText}
              </p>
            </div>
          ) : (
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap mt-2">
              {citation.citedText}
            </p>
          )}

          {canLoadFullText && (
            <button
              onClick={handleLoadFullText}
              disabled={isLoadingFullText}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              {isLoadingFullText ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Wird geladen...
                </>
              ) : (
                <>
                  <FileText className="h-3 w-3" />
                  Volltext laden
                </>
              )}
            </button>
          )}

          {fullTextError && <p className="mt-1 text-xs text-destructive">{fullTextError}</p>}
        </div>
      )}
    </div>
  );
}
