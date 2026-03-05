import {
  ExternalLink,
  FileText,
  Globe,
  Newspaper,
  Code,
  Server,
  MoreHorizontal,
} from 'lucide-react';
import { memo } from 'react';
import { cn } from '../../../lib/utils';
import type { SerializableCitation } from './registrySchema';

const TYPE_ICONS = {
  webpage: Globe,
  document: FileText,
  article: Newspaper,
  api: Server,
  code: Code,
  other: MoreHorizontal,
} as const;

export interface RegistryCitationProps extends SerializableCitation {
  variant?: 'default' | 'inline' | 'stacked';
  onNavigate?: (href: string, citation: SerializableCitation) => void;
}

export const RegistryCitation = memo(function RegistryCitation({
  variant = 'default',
  onNavigate,
  ...citation
}: RegistryCitationProps) {
  if (variant === 'inline') return <InlineCitation {...citation} onNavigate={onNavigate} />;
  if (variant === 'stacked') return <StackedCitation {...citation} />;
  return <CardCitation citation={citation} onNavigate={onNavigate} />;
});

function handleClick(
  e: React.MouseEvent,
  href: string,
  citation: SerializableCitation,
  onNavigate?: (href: string, citation: SerializableCitation) => void
) {
  if (onNavigate) {
    e.preventDefault();
    onNavigate(href, citation);
  }
}

const CardCitation = memo(function CardCitation({
  citation,
  onNavigate,
}: {
  citation: SerializableCitation;
  onNavigate?: (href: string, citation: SerializableCitation) => void;
}) {
  const TypeIcon = TYPE_ICONS[citation.type] || Globe;
  const domain = citation.domain || extractDomain(citation.href);

  return (
    <div className="group rounded-md border border-border/50 bg-card overflow-hidden transition-colors hover:border-border">
      <div className="flex items-start gap-2.5 px-3 py-2">
        <div className="flex-shrink-0 mt-0.5">
          {citation.favicon ? (
            <img
              src={citation.favicon}
              alt=""
              width={16}
              height={16}
              className="rounded-sm"
              loading="lazy"
            />
          ) : (
            <TypeIcon className="h-4 w-4 text-foreground-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <a
            href={citation.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleClick(e, citation.href, citation, onNavigate)}
            className="text-sm font-medium text-foreground leading-tight line-clamp-1 hover:underline hover:text-primary transition-colors"
          >
            {citation.title}
          </a>

          {(domain || citation.author) && (
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-foreground-muted">
              {domain && <span>{domain}</span>}
              {domain && citation.author && <span>&middot;</span>}
              {citation.author && <span>{citation.author}</span>}
            </div>
          )}

          {citation.snippet && (
            <p className="text-xs text-foreground-muted mt-1 line-clamp-2 leading-relaxed">
              {citation.snippet}
            </p>
          )}
        </div>

        <a
          href={citation.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => handleClick(e, citation.href, citation, onNavigate)}
          className="flex-shrink-0 p-1 mt-0.5 text-foreground-muted opacity-0 group-hover:opacity-100 hover:text-primary transition-all"
          aria-label="Quelle öffnen"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
});

const InlineCitation = memo(function InlineCitation({
  onNavigate,
  ...citation
}: SerializableCitation & {
  onNavigate?: (href: string, citation: SerializableCitation) => void;
}) {
  const domain = citation.domain || extractDomain(citation.href);

  return (
    <a
      href={citation.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => handleClick(e, citation.href, citation, onNavigate)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-card border border-border/50',
        'px-2 py-0.5 text-xs text-foreground-muted',
        'hover:border-border hover:text-foreground transition-colors'
      )}
    >
      {citation.favicon ? (
        <img
          src={citation.favicon}
          alt=""
          width={12}
          height={12}
          className="flex-shrink-0 rounded-sm"
          loading="lazy"
        />
      ) : (
        <Globe className="h-3 w-3 flex-shrink-0" />
      )}
      <span className="truncate max-w-[120px]">{domain || citation.title}</span>
    </a>
  );
});

const StackedCitation = memo(function StackedCitation(citation: SerializableCitation) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5"
      title={citation.title}
    >
      {citation.favicon ? (
        <img
          src={citation.favicon}
          alt=""
          width={14}
          height={14}
          className="flex-shrink-0 rounded-sm"
          loading="lazy"
        />
      ) : (
        <Globe className="h-3.5 w-3.5 text-foreground-muted" />
      )}
      <span className="text-[10px] text-foreground-muted truncate max-w-[80px]">
        {citation.domain || extractDomain(citation.href)}
      </span>
    </div>
  );
});

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
