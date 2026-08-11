'use client';

import { memo } from 'react';

import { getCollectionStyle } from '../../../lib/collectionStyles';

import { SourceGlyph } from './SourceGlyph';

import type { CitationProps } from './projectSchema';

/**
 * The numbered source card in the "Quellen" list under a message
 * (SearchResultsSection). Chat-citation shaped: `[N]` prefix, cited text,
 * collection chip. The former `inline`/`stacked` variants had no callers and
 * are gone — inline rendering is CitationBadge, chips are CitationList.
 */
export const Citation = memo(function Citation(citation: CitationProps) {
  const displayText = citation.citedText || citation.snippet || '';
  const style = getCollectionStyle(citation.source);

  return (
    <div
      id={`source-card-${citation.id}`}
      className="rounded-lg border border-border/50 bg-card overflow-hidden transition-colors hover:border-border"
    >
      <div className="w-full text-left px-3.5 py-3 flex items-start gap-2.5">
        <span className="flex-shrink-0 text-xs font-semibold text-foreground-muted mt-0.5">
          [{citation.id}]
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          {citation.title &&
            (citation.url ? (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-foreground leading-snug line-clamp-1 hover:text-primary transition-colors"
              >
                {citation.title}
              </a>
            ) : (
              <p className="text-sm font-medium text-foreground leading-snug line-clamp-1">
                {citation.title}
              </p>
            ))}

          {displayText && (
            <p className="text-xs text-foreground-muted leading-relaxed line-clamp-3">
              {displayText}
            </p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            {citation.domain && <SourceGlyph domain={citation.domain} size={12} />}
            {citation.domain && (
              <span className="text-[10px] text-foreground-muted">{citation.domain}</span>
            )}
            {citation.collectionName && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${style.color}20`, color: style.color }}
              >
                {citation.collectionName}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
