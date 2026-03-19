import { ExternalLink } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

interface ArticleCardProps {
  url: string;
  title: React.ReactNode;
  excerpt?: React.ReactNode;
  source: string;
  publishedAt?: string | null;
  sentiment?: number;
  className?: string;
}

function SentimentDot({ value }: { value: number }) {
  const color = value < -0.3 ? 'bg-red-500' : value > 0.3 ? 'bg-green-500' : 'bg-grey-400';
  return (
    <span
      className={cn('h-2 w-2 rounded-full shrink-0', color)}
      title={`Sentiment: ${value.toFixed(2)}`}
    />
  );
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffH < 1) return 'gerade eben';
  if (diffH < 24) return `vor ${diffH}h`;
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

function ArticleCard({
  url,
  title,
  excerpt,
  source,
  publishedAt,
  sentiment,
  className,
}: ArticleCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex flex-col gap-xs p-md rounded-lg',
        'bg-background border border-grey-200 dark:border-grey-700',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600',
        'no-underline',
        className
      )}
    >
      <div className="flex items-center justify-between gap-xs">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 truncate">
          {source}
        </span>
        <div className="flex items-center gap-xs shrink-0">
          {sentiment != null && <SentimentDot value={sentiment} />}
          <ExternalLink className="h-3 w-3 text-grey-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <p className="text-sm font-medium leading-snug text-foreground-heading m-0 line-clamp-3">
        {title}
      </p>

      {excerpt && (
        <p className="text-xs text-foreground/70 leading-relaxed m-0 line-clamp-2">{excerpt}</p>
      )}

      {publishedAt && (
        <span className="text-[11px] text-grey-400 mt-auto pt-xs">{formatTime(publishedAt)}</span>
      )}
    </a>
  );
}

export { ArticleCard, type ArticleCardProps };
