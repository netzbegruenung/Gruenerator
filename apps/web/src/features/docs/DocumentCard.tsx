import { type useDocsAdapter } from '@gruenerator/docs';
import { cn } from '@gruenerator/ui';
import { memo } from 'react';
import { FiCheck } from 'react-icons/fi';

import {
  PlaceholderBars,
  SlidesPreviewBody,
  TablePreviewBody,
} from '../../components/common/SchematicPreviews';
import { formatRelativeDate } from '../../utils/dateFormatter';
import { parseDocPreview } from '../../utils/parseDocPreview';
import { parseTablePreview } from '../../utils/parseTablePreview';

import { CardActionMenu } from './CardActionMenu';

// One calm generic label per type for the footer meta line — sheets and
// presentations read as their own category, everything else is "Dokument".
const docTypeLabel = (subtype: string): string => {
  if (subtype === 'sheets' || subtype === 'tabelle') return 'Tabelle';
  if (subtype === 'presentations') return 'Präsentation';
  return 'Dokument';
};

export interface DocumentCardDoc {
  id: string;
  title: string;
  updated_at: string;
  document_subtype: string;
  content?: string;
  access_type?: string;
  creator_name?: string;
  group_shares?: Array<{ group_id: string; group_name: string }>;
}

export const DocumentCard = memo(function DocumentCard({
  doc,
  adapter,
  onDelete,
  onRename,
  onShare,
  mode = 'navigate',
  isSelected = false,
  isDisabled = false,
  onSelect,
}: {
  doc: DocumentCardDoc;
  adapter: ReturnType<typeof useDocsAdapter>;
  onDelete?: (id: string, e: React.MouseEvent) => void;
  onRename?: (doc: { id: string; title: string }, e: React.MouseEvent) => void;
  onShare?: (doc: { id: string; title: string }) => void;
  mode?: 'navigate' | 'select';
  isSelected?: boolean;
  isDisabled?: boolean;
  onSelect?: (id: string) => void;
}) {
  const hasContent = !!doc.content?.trim();
  const isSelectMode = mode === 'select';
  // Sheets and presentations keep their data in the Y.Doc (no HTML `content`),
  // so they get a type-faithful schematic plate instead of the prose excerpt.
  const isSheet = doc.document_subtype === 'sheets' || doc.document_subtype === 'tabelle';
  const isSlides = doc.document_subtype === 'presentations';
  const preview = !isSheet && !isSlides && hasContent ? parseDocPreview(doc.content!) : null;

  const sheetCols =
    isSheet && doc.content
      ? parseTablePreview(doc.content, 3, 100).reduce((max, row) => Math.max(max, row.length), 0)
      : 0;
  const scope = isSheet
    ? sheetCols > 0
      ? `${sheetCols} Spalten`
      : null
    : !isSlides && !hasContent
      ? 'Leer'
      : null;
  const sharedSuffix =
    doc.access_type && doc.access_type !== 'owner'
      ? doc.creator_name
        ? ` · Von ${doc.creator_name}`
        : ' · Geteilt'
      : '';
  const metaLine =
    [docTypeLabel(doc.document_subtype), scope, formatRelativeDate(doc.updated_at)]
      .filter(Boolean)
      .join(' · ') + sharedSuffix;

  const handleClick = () => {
    if (isDisabled) return;
    if (isSelectMode) {
      onSelect?.(doc.id);
    } else {
      adapter.navigateToDocument(doc.id);
    }
  };

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200/80 bg-background',
        'transition-[box-shadow,border-color,transform] duration-150',
        'hover:-translate-y-0.5 hover:border-secondary-300 hover:shadow-md',
        'dark:border-grey-700/60 dark:hover:border-secondary-700',
        isSelected && 'border-primary-500 ring-2 ring-primary-400 dark:border-primary-400',
        isDisabled && 'pointer-events-none opacity-60'
      )}
      onClick={handleClick}
      role={isSelectMode ? 'button' : undefined}
      aria-pressed={isSelectMode ? isSelected : undefined}
      aria-disabled={isDisabled || undefined}
    >
      {isSelectMode && isSelected ? (
        <div
          className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full bg-primary-500 text-white shadow-sm"
          aria-hidden
        >
          <FiCheck size={14} />
        </div>
      ) : null}

      <div className="relative h-[210px] overflow-hidden border-b border-grey-100 bg-grey-50 dark:border-grey-700/60 dark:bg-grey-800/40">
        {isSheet ? (
          <TablePreviewBody content={doc.content} />
        ) : isSlides ? (
          <div className="h-full p-4">
            <SlidesPreviewBody content={doc.content} />
          </div>
        ) : preview ? (
          <div className="flex h-full flex-col justify-center gap-1.5 px-4 text-left">
            {preview.heading && (
              <p className="m-0 line-clamp-2 text-[15px] font-bold leading-snug text-grey-800 dark:text-grey-100">
                {preview.heading}
              </p>
            )}
            {preview.body && (
              <p className="m-0 line-clamp-6 text-[14px] leading-relaxed text-grey-500 dark:text-grey-400">
                {preview.body}
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col justify-center px-4">
            <PlaceholderBars />
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 px-4 pb-4 pt-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="m-0 min-w-0 truncate text-[16px] font-semibold text-foreground-heading">
            {doc.title}
          </h3>
          <p className="m-0 truncate text-[13px] text-grey-500 dark:text-grey-400">{metaLine}</p>
        </div>
        {!isSelectMode && onRename && onDelete && onShare ? (
          <CardActionMenu
            ariaLabel="Dokumentoptionen"
            onRename={(e) => onRename(doc, e)}
            onDelete={(e) => onDelete(doc.id, e)}
            onShare={(e) => {
              e.stopPropagation();
              onShare({ id: doc.id, title: doc.title });
            }}
          />
        ) : null}
      </div>
    </div>
  );
});
