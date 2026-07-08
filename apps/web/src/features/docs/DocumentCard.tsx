import { type useDocsAdapter } from '@gruenerator/docs';
import { cn } from '@gruenerator/ui';
import { memo } from 'react';
import {
  FiCalendar,
  FiCheck,
  FiCheckSquare,
  FiClipboard,
  FiEdit3,
  FiFile,
  FiFileText,
  FiGrid,
  FiMail,
  FiMonitor,
  FiRadio,
} from 'react-icons/fi';

import { formatRelativeDate } from '../../utils/dateFormatter';
import { parseDocPreview } from '../../utils/parseDocPreview';

import { CardActionMenu } from './CardActionMenu';

const DOC_TYPE_STYLE: Record<
  string,
  { icon: React.ComponentType<{ size?: number; className?: string }>; bg: string; text: string }
> = {
  blank: { icon: FiFile, bg: 'bg-grey-100 dark:bg-grey-800', text: 'text-grey-500' },
  antrag: {
    icon: FiFileText,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
  pressemitteilung: {
    icon: FiRadio,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-600 dark:text-amber-400',
  },
  protokoll: {
    icon: FiClipboard,
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-600 dark:text-violet-400',
  },
  notizen: {
    icon: FiEdit3,
    bg: 'bg-yellow-100 dark:bg-yellow-900/30',
    text: 'text-yellow-600 dark:text-yellow-400',
  },
  redaktionsplan: {
    icon: FiCalendar,
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    text: 'text-teal-600 dark:text-teal-400',
  },
  checkliste: {
    icon: FiCheckSquare,
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
  },
  einladung: {
    icon: FiMail,
    bg: 'bg-rose-100 dark:bg-rose-900/30',
    text: 'text-rose-600 dark:text-rose-400',
  },
  sheets: {
    icon: FiGrid,
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  presentations: {
    icon: FiMonitor,
    bg: 'bg-primary-100 dark:bg-primary-900/30',
    text: 'text-primary-600 dark:text-primary-400',
  },
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
  const style = DOC_TYPE_STYLE[doc.document_subtype] || DOC_TYPE_STYLE.blank;
  const TypeIcon = style.icon;
  const hasContent = !!doc.content?.trim();
  const isSelectMode = mode === 'select';
  const preview = hasContent ? parseDocPreview(doc.content!) : null;

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

      <div className="relative h-48 overflow-hidden border-b border-grey-100 bg-grey-50 dark:border-grey-700/60 dark:bg-grey-800/40">
        {preview ? (
          <div className="flex flex-col gap-1.5 px-3.5 pt-4 text-left">
            {preview.heading && (
              <p className="m-0 line-clamp-2 text-[13px] font-bold leading-snug text-grey-800 dark:text-grey-100">
                {preview.heading}
              </p>
            )}
            {preview.body && (
              <p className="m-0 line-clamp-6 text-[11px] leading-relaxed text-grey-500 dark:text-grey-400">
                {preview.body}
              </p>
            )}
          </div>
        ) : (
          <div className={`flex h-full items-center justify-center ${style.bg}`}>
            <TypeIcon size={32} className={style.text} />
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="m-0 flex items-center gap-1.5 min-w-0 truncate text-sm font-medium text-foreground-heading">
            <TypeIcon size={14} className={cn('shrink-0', style.text)} />
            <span className="truncate">{doc.title}</span>
          </h3>
          <p className="m-0 truncate text-xs text-grey-500 dark:text-grey-400">
            {formatRelativeDate(doc.updated_at)}
            {doc.access_type &&
              doc.access_type !== 'owner' &&
              (doc.creator_name ? ` · Von ${doc.creator_name}` : ' · Geteilt')}
          </p>
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
