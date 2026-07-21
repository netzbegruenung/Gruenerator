import { useConfirm } from '@gruenerator/ui';
import { memo, useRef, useState } from 'react';
import {
  FiDownload,
  FiExternalLink,
  FiFile,
  FiFileText,
  FiImage,
  FiLink,
  FiStar,
  FiTrash2,
  FiUploadCloud,
  FiX,
  FiZap,
} from 'react-icons/fi';

import { useBoardAttachments } from '../hooks/useBoardAttachments';
import { useBoardCardDocuments } from '../hooks/useBoardCardDocuments';

import type { LinkedDoc } from '../types';

import { CollabDocPicker } from '@/components/common/CollabDocPicker';
import { cn } from '@/utils/cn';

interface CardFilesProps {
  boardId?: string;
  cardId: string;
  linkedDocs: LinkedDoc[];
  onAddLinkedDoc: (doc: LinkedDoc) => void;
  onRemoveLinkedDoc: (docId: string) => void;
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

/**
 * Unified "Dateien" section. Merges the three previously separate lists into one
 * bordered container:
 *  - Grünerator-Dokumente (board_card_documents, agent-created) — highlighted
 *  - Verknüpfte Dokumente (Yjs `field-linked-docs`) — manual doc links
 *  - Anhänge (board_attachments) — uploaded files
 *
 * Each source keeps its own hook/mutation, so the merge is presentation-only —
 * removing/uploading/linking still routes to the correct backend.
 */
export const CardFiles = memo(function CardFiles({
  boardId,
  cardId,
  linkedDocs,
  onAddLinkedDoc,
  onRemoveLinkedDoc,
  onCoverChange,
}: CardFilesProps) {
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const { attachmentsQuery, upload, remove, setCover } = useBoardAttachments(boardId, cardId);
  const { documentsQuery, unlink } = useBoardCardDocuments(boardId, cardId);

  const attachments = attachmentsQuery.data ?? [];
  const agentDocs = documentsQuery.data ?? [];
  const total = agentDocs.length + linkedDocs.length + attachments.length;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) upload.mutate(file);
  };

  const handleSetCover = (id: string, url: string, currentlyCover: boolean) => {
    setCover.mutate({ attachmentId: id, isCover: !currentlyCover });
    onCoverChange?.(currentlyCover ? null : url);
  };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[13px] font-bold text-foreground">
        <FiFile size={16} />
        Dateien
        {total > 0 && <span className="font-semibold text-grey-400">{total}</span>}
      </div>

      {total > 0 && (
        <div className="overflow-hidden rounded-xl border border-grey-200 bg-background dark:border-grey-700">
          <div className="divide-y divide-grey-200 dark:divide-grey-700">
            {/* Grünerator-Dokumente (agent-created) — highlighted */}
            {agentDocs.map((doc) => (
              <div
                key={`agent-${doc.id}`}
                className="flex items-center gap-3 bg-primary-50 px-3 py-2.5 dark:bg-primary-900/20"
              >
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-primary-500 text-white">
                  <FiZap size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-primary-800 dark:text-primary-200">
                    {doc.title}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-primary-700 dark:text-primary-300">
                    <span className="inline-flex items-center gap-1 font-bold">
                      <FiZap size={11} />
                      Grünerator
                    </span>
                  </div>
                </div>
                <a
                  href={doc.url}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 bg-background px-2.5 py-1.5 text-[12.5px] font-bold text-primary-700 no-underline hover:no-underline dark:border-primary-800 dark:text-primary-300"
                >
                  Öffnen
                  <FiExternalLink size={13} />
                </a>
                <button
                  onClick={() => unlink.mutate(doc.id)}
                  disabled={unlink.isPending}
                  className="flex shrink-0 items-center justify-center rounded-md p-2 text-grey-400 hover:text-red-500 sm:p-1"
                  title="Aus dieser Karte entfernen (Dokument bleibt erhalten)"
                >
                  <FiX size={15} />
                </button>
              </div>
            ))}

            {/* Verknüpfte Dokumente (manual doc links) */}
            {linkedDocs.map((doc) => (
              <div key={`linked-${doc.id}`} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  <FiFileText size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={`/office/${doc.id}`}
                    className="block truncate text-[13.5px] font-semibold text-foreground no-underline hover:underline"
                  >
                    {doc.title}
                  </a>
                  <div className="flex items-center gap-1.5 text-xs text-grey-400">
                    <span className="inline-flex items-center gap-1 font-semibold text-primary-600 dark:text-primary-400">
                      <FiLink size={11} />
                      Verknüpft
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveLinkedDoc(doc.id)}
                  className="flex shrink-0 items-center justify-center rounded-md p-2 text-grey-400 hover:text-red-500 sm:p-1"
                  title="Verknüpfung entfernen"
                >
                  <FiX size={15} />
                </button>
              </div>
            ))}

            {/* Anhänge (uploaded files) */}
            {attachments.map((att) => (
              <div key={`att-${att.id}`} className="flex items-center gap-3 px-3 py-2.5 group/att">
                {isImage(att.mime_type) ? (
                  <img
                    src={att.url}
                    alt={att.file_name}
                    className="h-[34px] w-[34px] shrink-0 rounded-[9px] border border-grey-200 object-cover dark:border-grey-700"
                  />
                ) : (
                  <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                    <FiImage size={17} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13.5px] font-semibold text-foreground">
                    {att.file_name}
                  </p>
                  <p className="m-0 text-xs text-grey-400">
                    Angehängt · {formatSize(att.file_size)}
                  </p>
                </div>
                {isImage(att.mime_type) && (
                  <button
                    onClick={() => handleSetCover(att.id, att.url, att.is_cover)}
                    className={cn(
                      'flex shrink-0 items-center justify-center rounded-md p-2 transition-colors sm:p-1 sm:opacity-0 sm:group-hover/att:opacity-100',
                      att.is_cover
                        ? 'text-amber-500 sm:opacity-100'
                        : 'text-grey-400 hover:text-amber-500'
                    )}
                    title={att.is_cover ? 'Cover entfernen' : 'Als Cover'}
                  >
                    <FiStar size={14} />
                  </button>
                )}
                <a
                  href={att.url}
                  download={att.file_name}
                  className="flex shrink-0 items-center justify-center rounded-md p-2 text-grey-400 transition-colors hover:text-primary-600 sm:p-1 sm:opacity-0 sm:group-hover/att:opacity-100"
                  title="Herunterladen"
                >
                  <FiDownload size={14} />
                </a>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Anhang löschen?',
                      description: `„${att.file_name}" wird unwiderruflich gelöscht.`,
                    });
                    if (ok) remove.mutate(att.id);
                  }}
                  className="flex shrink-0 items-center justify-center rounded-md p-2 text-grey-400 transition-colors hover:text-red-500 sm:p-1 sm:opacity-0 sm:group-hover/att:opacity-100"
                  title="Löschen"
                >
                  <FiTrash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared action bar: upload OR link */}
      <div className="flex gap-2">
        {boardId && (
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
              'flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[13px] font-semibold transition-colors',
              dragOver
                ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/20'
                : 'border-grey-200 text-grey-400 hover:border-primary-400 hover:text-primary-600 dark:border-grey-700 dark:text-grey-300'
            )}
          >
            <FiUploadCloud size={16} />
            {upload.isPending ? 'Lädt hoch…' : 'Hochladen'}
          </button>
        )}
        <CollabDocPicker onSelect={onAddLinkedDoc} excludeIds={linkedDocs.map((d) => d.id)}>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-grey-200 px-3 py-2.5 text-[13px] font-semibold text-grey-400 transition-colors hover:border-primary-400 hover:text-primary-600 dark:border-grey-700 dark:text-grey-300"
          >
            <FiLink size={16} />
            Verknüpfen
          </button>
        </CollabDocPicker>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />
    </section>
  );
});
