import { ExternalLink, Library } from 'lucide-react';

export interface DocumentCardProps {
  title: string;
  excerpt?: string;
  sourceUrl: string;
  sourceName: string;
  sourceColor?: string;
}

export function DocumentCard({
  title,
  excerpt,
  sourceUrl,
  sourceName,
  sourceColor = '#94a3b8',
}: DocumentCardProps) {
  return (
    <a
      href={sourceUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex flex-col gap-md overflow-hidden rounded-xl border border-grey-200 dark:border-grey-700 p-lg bg-background no-underline group hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-sm">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${sourceColor}15` }}
        >
          <Library className="h-4 w-4" style={{ color: sourceColor }} />
        </div>
        <span className="text-xs font-medium text-grey-500 truncate">{sourceName}</span>
        <ExternalLink className="h-3 w-3 text-grey-300 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
      </div>

      <p className="text-sm font-semibold text-foreground-heading leading-snug m-0 line-clamp-2 group-hover:text-primary-600 transition-colors">
        {title}
      </p>

      {excerpt && (
        <p className="text-xs text-foreground/70 leading-relaxed m-0 line-clamp-3 flex-1">
          {excerpt}
        </p>
      )}
    </a>
  );
}
