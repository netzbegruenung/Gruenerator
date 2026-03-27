'use client';

import { memo } from 'react';
import { ExternalLink } from 'lucide-react';
import { getCollectionStyle } from '../../../lib/collectionStyles';
import type { CitationProps } from './projectSchema';

function getFaviconUrl(domain: string | undefined): string | null {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;
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
}: {
  citation: CitationProps;
  compact?: boolean;
}) {
  const displayText = citation.citedText || citation.snippet || '';
  const faviconUrl = getFaviconUrl(citation.domain);
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
