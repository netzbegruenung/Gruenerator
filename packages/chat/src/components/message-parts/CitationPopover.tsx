'use client';

import { memo } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { ExternalLink } from 'lucide-react';
import type { Citation } from '../../hooks/useChatGraphStream';
import { cn } from '../../lib/utils';

const COLLECTION_STYLES: Record<string, { color: string; bg: string }> = {
  deutschland: {
    color: 'var(--color-collection-grundsatzprogramm)',
    bg: 'var(--color-collection-grundsatzprogramm-bg)',
  },
  bundestagsfraktion: {
    color: 'var(--color-collection-bundestagsfraktion)',
    bg: 'var(--color-collection-bundestagsfraktion-bg)',
  },
  'gruene-de': {
    color: 'var(--color-collection-gruene-de)',
    bg: 'var(--color-collection-gruene-de-bg)',
  },
  kommunalwiki: {
    color: 'var(--color-collection-kommunalwiki)',
    bg: 'var(--color-collection-kommunalwiki-bg)',
  },
  web: {
    color: 'var(--color-collection-web)',
    bg: 'var(--color-collection-web-bg)',
  },
  research: {
    color: 'var(--color-collection-research)',
    bg: 'var(--color-collection-research-bg)',
  },
  research_synthesis: {
    color: 'var(--color-collection-research)',
    bg: 'var(--color-collection-research-bg)',
  },
};

function getCollectionStyle(source: string): { color: string; bg: string } {
  const key = source.startsWith('gruenerator:') ? source.slice('gruenerator:'.length) : source;
  return (
    COLLECTION_STYLES[key] || { color: 'var(--color-foreground-muted)', bg: 'var(--color-surface)' }
  );
}

function getRelevanceColor(relevance: number | undefined): string {
  if (relevance == null) return 'var(--color-foreground-muted)';
  if (relevance >= 0.7) return 'var(--color-relevance-high)';
  if (relevance >= 0.4) return 'var(--color-relevance-medium)';
  return 'var(--color-relevance-low)';
}

function getRelevanceLabel(relevance: number | undefined): string {
  if (relevance == null) return '';
  if (relevance >= 0.7) return 'Hohe Relevanz';
  if (relevance >= 0.4) return 'Mittlere Relevanz';
  return 'Niedrige Relevanz';
}

interface CitationBadgeProps {
  citationId: number;
  citation: Citation | undefined;
}

export const CitationBadge = memo(function CitationBadge({
  citationId,
  citation,
}: CitationBadgeProps) {
  if (!citation) {
    return (
      <sup className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold bg-surface text-foreground-muted rounded px-0.5 mx-0.5 align-super">
        {citationId}
      </sup>
    );
  }

  const collectionStyle = getCollectionStyle(citation.source);

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] text-[10px] font-semibold rounded px-0.5 mx-0.5 align-super cursor-pointer transition-opacity hover:opacity-80"
          style={{
            backgroundColor: collectionStyle.bg,
            color: collectionStyle.color,
          }}
          aria-label={`Quelle ${citationId}: ${citation.title}`}
        >
          {citationId}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          sideOffset={4}
          align="center"
          className={cn(
            'z-50 w-72 rounded-lg border border-border bg-card p-3 shadow-lg',
            'animate-in fade-in-0 zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
        >
          <div className="space-y-2">
            {/* Header: title + collection badge */}
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                  {citation.title}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {citation.collectionName && (
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: collectionStyle.bg,
                        color: collectionStyle.color,
                      }}
                    >
                      {citation.collectionName}
                    </span>
                  )}
                  {citation.domain && (
                    <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Relevance indicator */}
            {citation.relevance != null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round(citation.relevance * 100)}%`,
                      backgroundColor: getRelevanceColor(citation.relevance),
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: getRelevanceColor(citation.relevance) }}
                >
                  {getRelevanceLabel(citation.relevance)}
                </span>
              </div>
            )}

            {/* Snippet / cited text */}
            <p className="text-xs text-foreground-muted leading-relaxed line-clamp-4">
              {citation.citedText || citation.snippet}
            </p>

            {/* Link */}
            {citation.url && (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Quelle öffnen
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <PopoverPrimitive.Arrow className="fill-card" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
});
