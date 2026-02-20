'use client';

import { memo } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { ExternalLink } from 'lucide-react';
import type { Citation } from '../../hooks/useChatGraphStream';
import { cn } from '../../lib/utils';
import {
  getCollectionStyle as getSharedCollectionStyle,
  getRelevanceColor,
} from '../../lib/collectionStyles';

function getCollectionStyle(source: string): { color: string; bg: string } {
  const s = getSharedCollectionStyle(source);
  return { color: s.color, bg: s.bg };
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
  const displayScore = citation.similarityScore ?? citation.relevance;

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
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
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
                  {citation.contentType && (
                    <span className="text-[10px] text-foreground-muted italic">
                      {citation.contentType}
                    </span>
                  )}
                  {citation.domain && (
                    <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
                  )}
                  {citation.chunkIndex != null && (
                    <span className="text-[10px] text-foreground-muted">
                      Abschn. {citation.chunkIndex}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Relevance indicator — use similarityScore when available, fall back to relevance */}
            {displayScore != null && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round(displayScore * 100)}%`,
                      backgroundColor: getRelevanceColor(displayScore),
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-medium whitespace-nowrap"
                  style={{ color: getRelevanceColor(displayScore) }}
                >
                  {citation.similarityScore != null
                    ? `${Math.round(citation.similarityScore * 100)}%`
                    : getRelevanceLabel(citation.relevance)}
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
