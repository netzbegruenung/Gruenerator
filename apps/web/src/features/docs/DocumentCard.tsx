import { type useDocsAdapter } from '@gruenerator/docs';
import { cn } from '@gruenerator/ui';
import { memo } from 'react';
import {
  FiCalendar,
  FiCheckSquare,
  FiClipboard,
  FiEdit3,
  FiFile,
  FiFileText,
  FiMail,
  FiRadio,
} from 'react-icons/fi';

import { formatRelativeDate } from '../../utils/dateFormatter';

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
}: {
  doc: DocumentCardDoc;
  adapter: ReturnType<typeof useDocsAdapter>;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (doc: { id: string; title: string }, e: React.MouseEvent) => void;
  onShare: (doc: { id: string; title: string }) => void;
}) {
  const style = DOC_TYPE_STYLE[doc.document_subtype] || DOC_TYPE_STYLE.blank;
  const TypeIcon = style.icon;
  const hasContent = !!doc.content?.trim();

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-grey-200 bg-background',
        'aspect-[4/4.5] transition-[box-shadow,border-color,transform] duration-150',
        'hover:shadow-md hover:border-grey-300',
        'dark:border-grey-700 dark:hover:border-grey-500',
        'md:hover:-translate-y-0.5',
        'max-sm:aspect-[4/3]'
      )}
      onClick={() => adapter.navigateToDocument(doc.id)}
    >
      {hasContent ? (
        <div className="relative flex-1 overflow-hidden bg-grey-50 dark:bg-grey-800/50">
          <div
            className={cn(
              'pointer-events-none w-[800px] origin-top-left scale-[0.3] select-none px-12 py-8',
              'font-[PT_Sans,Arial,sans-serif] leading-relaxed text-foreground',
              '[&_h1]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-3 [&_h1]:mt-0',
              '[&_h2]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:mt-3.5 [&_h2]:mb-1.5',
              '[&_h3]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1',
              '[&_p]:text-[0.8rem] [&_p]:mb-2 [&_p]:mt-0 [&_p]:leading-relaxed',
              '[&_ul]:text-[0.8rem] [&_ul]:mb-2 [&_ul]:pl-5 [&_ol]:text-[0.8rem] [&_ol]:mb-2 [&_ol]:pl-5',
              '[&_li]:mb-0.5',
              '[&_strong]:font-semibold',
              '[&_em]:italic'
            )}
            dangerouslySetInnerHTML={{ __html: doc.content! }}
          />
        </div>
      ) : (
        <div className={`flex flex-1 items-center justify-center pb-10 ${style.bg}`}>
          <TypeIcon size={32} className={style.text} />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 backdrop-blur-md bg-white/70 dark:bg-grey-900/70 px-2.5 py-2 border-t border-white/50 dark:border-grey-700/50">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xs font-semibold text-foreground">{doc.title}</h3>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-grey-500 dark:text-grey-400">
              <span>{formatRelativeDate(doc.updated_at)}</span>
              {doc.access_type && doc.access_type !== 'owner' && (
                <>
                  <span>·</span>
                  <span className="text-primary-600 dark:text-primary-400">
                    {doc.creator_name ? `Von ${doc.creator_name}` : 'Geteilt'}
                  </span>
                </>
              )}
            </div>
          </div>
          <CardActionMenu
            ariaLabel="Dokumentoptionen"
            onRename={(e) => onRename(doc, e)}
            onDelete={(e) => onDelete(doc.id, e)}
            onShare={(e) => {
              e.stopPropagation();
              onShare({ id: doc.id, title: doc.title });
            }}
          />
        </div>
      </div>
    </div>
  );
});
