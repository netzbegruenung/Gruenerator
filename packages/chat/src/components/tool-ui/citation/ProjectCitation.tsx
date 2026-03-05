'use client';

import { memo, useState } from 'react';
import { ExternalLink, ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { getCollectionStyle } from '../../../lib/collectionStyles';
import type { CitationProps } from './projectSchema';

function getFaviconUrl(domain: string | undefined): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.7 ? truncated.slice(0, lastSpace) : truncated) + '\u2026';
}

interface CitationComponentProps extends CitationProps {
  variant?: 'default' | 'inline' | 'stacked';
  compact?: boolean;
}

export const Citation = memo(function Citation({
  variant = 'default',
  compact,
  ...citation
}: CitationComponentProps) {
  if (variant === 'inline') return <InlineCitation {...citation} />;
  if (variant === 'stacked') return <StackedCitation {...citation} />;
  return <CardCitation citation={citation} compact={compact} />;
});

const CardCitation = memo(function CardCitation({
  citation,
  compact,
}: {
  citation: CitationProps;
  compact?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const style = getCollectionStyle(citation.source);
  const faviconUrl = getFaviconUrl(citation.domain);
  const citedText = citation.citedText || '';
  const maxPreviewLen = compact ? 120 : 200;
  const needsTruncation = citedText.length > maxPreviewLen;
  const hasExpandableContent = citedText.length > 0 && needsTruncation;

  const metaParts: string[] = [];
  if (citation.domain) metaParts.push(citation.domain);
  if (citation.collectionName) metaParts.push(style.label || citation.collectionName);
  const metaLine = metaParts.join(' \u00b7 ');

  const displayTitle = compact ? citation.snippet?.slice(0, 60) || citation.title : citation.title;

  return (
    <div
      id={`source-card-${citation.id}`}
      className="rounded-md border border-border/50 bg-card overflow-hidden transition-colors hover:border-border"
      style={{ borderLeftWidth: 3, borderLeftColor: style.color }}
    >
      <div className="w-full text-left px-3 py-2 flex items-start gap-2">
        <span className="flex-shrink-0 text-xs font-semibold text-foreground-muted mt-0.5">
          [{citation.id}]
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {faviconUrl && (
              <img
                src={faviconUrl}
                alt=""
                width={16}
                height={16}
                className="flex-shrink-0"
                loading="lazy"
              />
            )}
            {citation.url ? (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-foreground leading-tight line-clamp-1 hover:underline hover:text-primary transition-colors"
              >
                {displayTitle}
              </a>
            ) : (
              <span className="text-sm font-medium text-foreground leading-tight line-clamp-1">
                {displayTitle}
              </span>
            )}
          </div>

          {metaLine && (
            <span className="text-xs text-foreground-muted mt-0.5 block">{metaLine}</span>
          )}

          {citedText ? (
            <div className="mt-1">
              <p className="text-xs text-foreground-muted leading-relaxed line-clamp-2">
                {isExpanded ? citedText : truncateText(citedText, maxPreviewLen)}
              </p>
              {hasExpandableContent && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
                >
                  <ChevronDown
                    className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
                  />
                  {isExpanded ? 'Weniger' : 'Mehr anzeigen'}
                </button>
              )}
            </div>
          ) : (
            !compact &&
            citation.snippet && (
              <p className="text-xs text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
                {citation.snippet}
              </p>
            )
          )}
        </div>

        {citation.url && (
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 p-1 mt-0.5 text-foreground-muted hover:text-primary transition-colors"
            aria-label="Quelle öffnen"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
});

const InlineCitation = memo(function InlineCitation(citation: CitationProps) {
  const faviconUrl = getFaviconUrl(citation.domain);

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-card border border-border/50 px-2 py-0.5 text-xs text-foreground-muted hover:border-border hover:text-foreground transition-colors"
    >
      {faviconUrl && (
        <img
          src={faviconUrl}
          alt=""
          width={12}
          height={12}
          className="flex-shrink-0"
          loading="lazy"
        />
      )}
      <span className="truncate max-w-[120px]">{citation.domain || citation.title}</span>
    </a>
  );
});

const StackedCitation = memo(function StackedCitation(citation: CitationProps) {
  const faviconUrl = getFaviconUrl(citation.domain);
  const style = getCollectionStyle(citation.source);

  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5"
      style={{ borderColor: style.color }}
      title={citation.title}
    >
      {faviconUrl && (
        <img
          src={faviconUrl}
          alt=""
          width={14}
          height={14}
          className="flex-shrink-0"
          loading="lazy"
        />
      )}
      <span className="text-[10px] text-foreground-muted truncate max-w-[80px]">
        {citation.domain || citation.source}
      </span>
    </div>
  );
});
