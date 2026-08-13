import { Button, Checkbox } from '@gruenerator/ui';
import { memo } from 'react';
import {
  HiCloud,
  HiDocumentText,
  HiExclamationCircle,
  HiGlobeAlt,
  HiUpload,
  HiX,
} from 'react-icons/hi';

import { cn } from '../../../../utils/cn';

import {
  DOCUMENT_SOURCE_LABELS,
  getFileTypeStyle,
  type DocumentSource,
  type UploadedDocument,
} from './shared';

/**
 * Row height the virtualizer measures against. Deliberately roomy: the list
 * replaces a card grid, and cramming rows together would trade one kind of
 * unreadable for another.
 */
export const DOCUMENT_ROW_HEIGHT = 68;

const SOURCE_ICONS: Record<DocumentSource, typeof HiCloud> = {
  upload: HiUpload,
  wolke: HiCloud,
  docs: HiDocumentText,
  wordpress: HiGlobeAlt,
};

interface DocumentRowProps {
  doc: UploadedDocument;
  source: DocumentSource;
  indexing: boolean;
  /** Why background processing failed, or null when it didn't. */
  failure: string | null;
  selected: boolean;
  loading: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

function DocumentRowInner({
  doc,
  source,
  indexing,
  failure,
  selected,
  loading,
  onToggleSelect,
  onRemove,
}: DocumentRowProps) {
  const displayName = doc.filename || doc.title;
  const SourceIcon = SOURCE_ICONS[source];
  const fileType = source === 'wolke' ? null : getFileTypeStyle(displayName);

  return (
    <div
      className={cn(
        'group flex h-full min-w-0 items-center gap-md rounded-lg px-sm transition-colors',
        selected
          ? 'bg-primary-50/60 dark:bg-primary-950/25'
          : failure
            ? 'bg-red-50/60 dark:bg-red-950/20'
            : 'hover:bg-background-alt'
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggleSelect(doc.id)}
        disabled={loading}
        aria-label={`${doc.title} auswählen`}
        className="shrink-0"
      />

      <SourceIcon
        size={16}
        className="shrink-0 text-secondary-600 dark:text-secondary-400"
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-medium leading-snug text-foreground"
          title={displayName}
        >
          {displayName}
        </div>
        <div className="mt-[2px] flex items-center gap-xs text-xs text-grey-500">
          <span>{DOCUMENT_SOURCE_LABELS[source]}</span>
          {fileType && (
            <>
              <span aria-hidden>·</span>
              <span>{fileType.label}</span>
            </>
          )}
          {failure && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate text-red-700 dark:text-red-400" title={failure}>
                {failure}
              </span>
            </>
          )}
        </div>
      </div>

      {indexing ? (
        <span className="flex shrink-0 items-center gap-xs text-xs text-grey-500">
          <span className="size-3 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
          <span className="hidden sm:inline">Wird verarbeitet…</span>
        </span>
      ) : failure ? (
        // Not decorative: this is the only place the user learns the document
        // will be missing from every search. The reason sits in the line above.
        <span className="flex shrink-0 items-center gap-xs text-xs font-medium text-red-700 dark:text-red-400">
          <HiExclamationCircle size={14} aria-hidden />
          <span className="hidden sm:inline">Nicht durchsuchbar</span>
          <span className="sr-only">{`${displayName}: nicht durchsuchbar — ${failure}`}</span>
        </span>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => onRemove(doc.id)}
        disabled={loading}
        aria-label={`${doc.title} entfernen`}
      >
        <HiX size={12} />
      </Button>
    </div>
  );
}

/**
 * Memoised: the indexing poll replaces its id Set on every tick, which used to
 * re-render every mounted document. With a thousand of them that was the main
 * source of the editor feeling sluggish.
 */
export const DocumentRow = memo(DocumentRowInner);

export default DocumentRow;
