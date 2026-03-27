import { type ReactNode } from 'react';
import { cn } from '../lib/cn';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FileCardProps {
  name: string;
  size: number;
  icon?: ReactNode;
  onRemove?: () => void;
  className?: string;
}

export function FileCard({ name, size, icon, onRemove, className }: FileCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-md rounded-lg border border-grey-200 bg-background p-md dark:border-grey-700 max-md:px-md max-md:py-sm',
        className
      )}
    >
      {icon && (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-600/10 text-primary-600">
          {icon}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="max-w-full truncate text-base font-semibold text-foreground">{name}</span>
        <span className="text-[0.8125rem] font-normal uppercase tracking-[0.02em] text-grey-400">
          {formatFileSize(size)}
        </span>
      </div>
      {onRemove && (
        <button
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-grey-400 hover:text-foreground transition-colors"
          onClick={onRemove}
          aria-label={`${name} entfernen`}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
            <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
