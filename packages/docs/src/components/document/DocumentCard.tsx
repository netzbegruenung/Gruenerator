import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo } from 'react';
import { FiEdit2, FiMoreVertical, FiShare2, FiTrash2 } from 'react-icons/fi';

import type { Document } from '../../stores/documentStore';
import { templates, getTemplateContent } from '../../lib/templates';

interface DocumentCardProps {
  doc: Document;
  onNavigate: (id: string) => void;
  onRename: (doc: { id: string; title: string }, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onShare: (doc: { id: string; title: string }) => void;
}

export const DocumentCard = memo(
  ({ doc, onNavigate, onRename, onDelete, onShare }: DocumentCardProps) => {
    const template = templates.find((t) => t.id === doc.document_subtype);
    const emoji = template?.icon || '📄';
    const templateHtml = getTemplateContent(doc.document_subtype);
    const previewHtml = doc.content?.trim()
      ? /^<[a-z]/i.test(doc.content.trim())
        ? doc.content
        : `<p>${doc.content}</p>`
      : templateHtml;

    return (
      <div
        className={cn(
          'group flex cursor-pointer flex-col items-stretch overflow-hidden rounded-lg border border-grey-200 bg-background-alt',
          'aspect-[4/5] transition-[box-shadow,border-color] duration-150 ease-out',
          'hover:shadow-sm hover:border-grey-300',
          'dark:border-grey-600 dark:hover:border-grey-500 dark:active:bg-grey-700',
          'md:transition-[transform,box-shadow,border-color] md:hover:-translate-y-0.5 md:hover:shadow-md',
          'max-sm:aspect-auto max-sm:max-h-[220px]'
        )}
        onClick={() => onNavigate(doc.id)}
      >
        {previewHtml ? (
          <div className="relative flex-1 overflow-hidden bg-background-alt dark:bg-grey-700">
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
                '[&_blockquote]:border-l-[3px] [&_blockquote]:border-grey-300 [&_blockquote]:my-2 [&_blockquote]:py-1 [&_blockquote]:px-3 [&_blockquote]:text-grey-500 dark:[&_blockquote]:border-grey-500',
                '[&_hr]:border-none [&_hr]:border-t [&_hr]:border-grey-200 [&_hr]:my-2.5 dark:[&_hr]:border-grey-600',
                '[&_strong]:font-semibold',
                '[&_em]:italic'
              )}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-grey-700" />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center overflow-hidden text-[2rem] text-grey-400 dark:text-grey-500">
            <span>{emoji}</span>
          </div>
        )}

        <div className="mt-auto border-t border-grey-100 p-sm px-md dark:border-grey-600">
          <div className="flex items-center justify-between gap-sm">
            <h3 className="m-0 flex-1 truncate text-[0.8125rem] font-semibold text-foreground">
              <span className="mr-1">{emoji}</span>
              {doc.title}
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 max-sm:opacity-100"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  aria-label="Dokumentoptionen"
                >
                  <FiMoreVertical size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={(e: React.MouseEvent) => onRename(doc, e)}>
                  <FiEdit2 size={14} />
                  Umbenennen
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onShare(doc);
                  }}
                >
                  <FiShare2 size={14} />
                  Teilen
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e: React.MouseEvent) => onDelete(doc.id, e)}
                >
                  <FiTrash2 size={14} />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-grey-500 dark:text-grey-400">
            <span>
              {new Date(doc.updated_at).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </span>
            {doc.access_type && doc.access_type !== 'owner' && (
              <span className="truncate text-[0.6875rem] text-primary-600 dark:text-primary-400">
                {doc.creator_name ? `Von ${doc.creator_name}` : 'Geteilt'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

DocumentCard.displayName = 'DocumentCard';
