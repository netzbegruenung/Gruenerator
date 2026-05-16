import { Button } from '@gruenerator/ui';
import { HiCloud, HiX } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';

import { getFileTypeStyle, type UploadedDocument } from './shared';

interface DocumentCardProps {
  doc: UploadedDocument;
  indexing: boolean;
  loading: boolean;
  onRemove: (id: string) => void;
}

export default function DocumentCard({ doc, indexing, loading, onRemove }: DocumentCardProps) {
  const isWolke = doc.source === 'wolke';
  const displayName = doc.filename || doc.title;
  const fileType = !isWolke ? getFileTypeStyle(doc.filename || doc.title) : null;
  return (
    <div
      className={cn(
        'group relative flex min-h-[112px] min-w-0 flex-col gap-xs overflow-hidden rounded-xl border border-grey-200 bg-background p-md transition-all duration-200 dark:border-grey-800',
        indexing ? 'opacity-90' : 'hover:shadow-sm'
      )}
      aria-label={isWolke ? `Wolke: ${displayName}` : `${fileType?.label}: ${displayName}`}
    >
      <div
        className={cn(
          'pointer-events-none absolute right-0 top-0 h-[3px] w-12 rounded-bl-md',
          isWolke ? 'bg-secondary-400 dark:bg-secondary-700' : fileType?.cornerClass
        )}
        aria-hidden
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(
          'absolute right-1 top-1 transition-opacity',
          indexing
            ? 'opacity-60'
            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        )}
        onClick={() => onRemove(doc.id)}
        disabled={loading}
        aria-label={`${doc.title} entfernen`}
      >
        <HiX size={12} />
      </Button>
      {isWolke ? (
        <div className="flex items-start gap-xs pr-6">
          <HiCloud
            size={14}
            className="mt-[2px] shrink-0 text-secondary-600 dark:text-secondary-400"
            aria-hidden
          />
          <div
            className="line-clamp-3 break-words text-sm font-medium leading-snug text-foreground"
            title={displayName}
          >
            {displayName}
          </div>
        </div>
      ) : (
        <div
          className="line-clamp-3 break-words pr-6 text-sm font-medium leading-snug text-foreground"
          title={displayName}
        >
          {displayName}
        </div>
      )}
      {indexing ? (
        <div className="mt-auto flex items-center gap-xs text-xs text-grey-500">
          <div className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
          <span>Wird verarbeitet…</span>
        </div>
      ) : null}
    </div>
  );
}
