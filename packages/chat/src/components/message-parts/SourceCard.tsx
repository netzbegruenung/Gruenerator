'use client';

import { useState } from 'react';
import type { SourceMessagePartProps } from '@assistant-ui/react';
import { ExternalLink, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useCitations } from '../../context/CitationContext';

const COLLECTION_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  deutschland: {
    color: 'var(--color-collection-grundsatzprogramm)',
    bg: 'var(--color-collection-grundsatzprogramm-bg)',
    label: 'Grundsatzprogramm',
  },
  bundestagsfraktion: {
    color: 'var(--color-collection-bundestagsfraktion)',
    bg: 'var(--color-collection-bundestagsfraktion-bg)',
    label: 'Bundestagsfraktion',
  },
  'gruene-de': {
    color: 'var(--color-collection-gruene-de)',
    bg: 'var(--color-collection-gruene-de-bg)',
    label: 'gruene.de',
  },
  kommunalwiki: {
    color: 'var(--color-collection-kommunalwiki)',
    bg: 'var(--color-collection-kommunalwiki-bg)',
    label: 'Kommunalwiki',
  },
  web: {
    color: 'var(--color-collection-web)',
    bg: 'var(--color-collection-web-bg)',
    label: 'Web',
  },
  research: {
    color: 'var(--color-collection-research)',
    bg: 'var(--color-collection-research-bg)',
    label: 'Recherche',
  },
  research_synthesis: {
    color: 'var(--color-collection-research)',
    bg: 'var(--color-collection-research-bg)',
    label: 'Recherche',
  },
};

function getCollectionKey(source: string): string {
  return source.startsWith('gruenerator:') ? source.slice('gruenerator:'.length) : source;
}

function getCollectionStyle(source: string) {
  const key = getCollectionKey(source);
  return (
    COLLECTION_STYLES[key] || {
      color: 'var(--color-foreground-muted)',
      bg: 'var(--color-surface)',
      label: source,
    }
  );
}

function getRelevanceColor(relevance: number | undefined): string {
  if (relevance == null) return 'var(--color-foreground-muted)';
  if (relevance >= 0.7) return 'var(--color-relevance-high)';
  if (relevance >= 0.4) return 'var(--color-relevance-medium)';
  return 'var(--color-relevance-low)';
}

export function SourceCard(props: SourceMessagePartProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const citations = useCitations();

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

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-primary/30">
      <button
        onClick={hasExpandableContent ? () => setIsExpanded(!isExpanded) : undefined}
        className={cn(
          'w-full text-left px-3 py-2 flex items-start gap-2',
          hasExpandableContent && 'cursor-pointer'
        )}
      >
        <span
          className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold mt-0.5"
          style={{ backgroundColor: style.bg, color: style.color }}
        >
          {citationId || '#'}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-foreground leading-tight line-clamp-1">
              {title}
            </span>
            {citation?.relevance != null && (
              <span
                className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getRelevanceColor(citation.relevance) }}
                title={`Relevanz: ${Math.round(citation.relevance * 100)}%`}
              />
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5">
            {citation?.collectionName && (
              <span
                className="text-[10px] font-medium px-1 py-px rounded"
                style={{ backgroundColor: style.bg, color: style.color }}
              >
                {citation.collectionName}
              </span>
            )}
            {citation?.domain && (
              <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
            )}
          </div>

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
          <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap mt-2">
            {citation.citedText}
          </p>
        </div>
      )}
    </div>
  );
}
