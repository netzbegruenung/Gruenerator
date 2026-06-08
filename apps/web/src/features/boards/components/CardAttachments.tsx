import { memo, useRef, useState } from 'react';
import { FiDownload, FiImage, FiPaperclip, FiStar, FiTrash2, FiUploadCloud } from 'react-icons/fi';

import { useBoardAttachments } from '../hooks/useBoardAttachments';

import { cn } from '@/utils/cn';

interface CardAttachmentsProps {
  boardId: string;
  cardId: string;
  /** Set/clear the card cover image (writes row.coverImageUrl in Yjs). */
  onCoverChange?: (url: string | null) => void;
}

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CardAttachments = memo(function CardAttachments({
  boardId,
  cardId,
  onCoverChange,
}: CardAttachmentsProps) {
  const { attachmentsQuery, upload, remove, setCover } = useBoardAttachments(boardId, cardId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const attachments = attachmentsQuery.data ?? [];

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) upload.mutate(file);
  };

  const handleSetCover = (id: string, url: string, currentlyCover: boolean) => {
    setCover.mutate({ attachmentId: id, isCover: !currentlyCover });
    onCoverChange?.(currentlyCover ? null : url);
  };

  return (
    <div className="flex flex-row items-start">
      <p className="w-24 shrink-0 text-sm font-medium text-grey-500 dark:text-grey-100 pt-1.5">
        <FiPaperclip className="inline mr-1.5" size={13} />
        Anhänge
      </p>
      <div className="flex-1 space-y-2">
        {attachments.length > 0 && (
          <div className="space-y-1.5">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-2 group/att">
                {isImage(att.mime_type) ? (
                  <img
                    src={att.url}
                    alt={att.file_name}
                    className="h-9 w-9 rounded object-cover shrink-0 border border-grey-200 dark:border-grey-700"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded bg-grey-100 dark:bg-grey-800 shrink-0">
                    <FiImage size={15} className="text-grey-400" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate m-0">{att.file_name}</p>
                  <p className="text-[10px] text-grey-400 m-0">{formatSize(att.file_size)}</p>
                </div>
                {isImage(att.mime_type) && (
                  <button
                    onClick={() => handleSetCover(att.id, att.url, att.is_cover)}
                    className={cn(
                      'sm:opacity-0 sm:group-hover/att:opacity-100 bg-transparent border-none cursor-pointer transition-opacity p-1',
                      att.is_cover
                        ? 'text-amber-500 sm:opacity-100'
                        : 'text-grey-400 hover:text-amber-500'
                    )}
                    title={att.is_cover ? 'Cover entfernen' : 'Als Cover'}
                  >
                    <FiStar size={13} />
                  </button>
                )}
                <a
                  href={att.url}
                  download={att.file_name}
                  className="sm:opacity-0 sm:group-hover/att:opacity-100 text-grey-400 hover:text-primary-600 transition-opacity p-1"
                  title="Herunterladen"
                >
                  <FiDownload size={13} />
                </a>
                <button
                  onClick={() => remove.mutate(att.id)}
                  className="sm:opacity-0 sm:group-hover/att:opacity-100 text-grey-400 hover:text-red-500 bg-transparent border-none cursor-pointer transition-opacity p-1"
                  title="Löschen"
                >
                  <FiTrash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-2 text-xs cursor-pointer transition-colors',
            dragOver
              ? 'border-primary-500 text-primary-600 bg-primary-50 dark:bg-primary-900/20'
              : 'border-grey-200 dark:border-grey-700 text-grey-400 dark:text-grey-300 hover:text-primary-600 hover:border-primary-500'
          )}
        >
          <FiUploadCloud size={13} />
          {upload.isPending ? 'Lädt hoch…' : 'Datei anhängen oder hierher ziehen'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
});
