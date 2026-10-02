import { NOTEBOOK_MAX_DOCUMENTS, type NotebookDocumentRecord } from '@gruenerator/contracts';
import { toast } from '@gruenerator/ui';
import { useRef, useState, type DragEvent } from 'react';
import { HiUpload } from 'react-icons/hi';

import { useDocumentsStore } from '../../../../stores/documentsStore';
import { cn } from '../../../../utils/cn';

import { EmptySources, filterByTitle, NoMatches } from './PanelChrome';
import { SourceTable } from './SourceTable';
import {
  ACCEPTED_EXTENSIONS,
  describeRejectedFiles,
  hasFileDrag,
  partitionUploadableFiles,
} from './uploadFiles';

import type { NotebookHubApi } from './useNotebookHub';

/**
 * Hochladen samt verstecktem Dateifeld. Liegt beim Hub, weil der Knopf dafür
 * im Kopf steht und das Panel nur Ablagefläche und Tabelle trägt.
 */
export function useHubUpload(hub: NotebookHubApi, total: number) {
  const uploadFileOnly = useDocumentsStore((s) => s.uploadFileOnly);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  /**
   * Hochladen, dann in EINEM Aufruf anhängen. Scheitert eine Datei mitten in
   * der Reihe, werden die schon hochgeladenen trotzdem angehängt — sonst
   * lägen sie als Dokumente ohne Notebook herum.
   */
  const upload = async (files: File[]) => {
    const { accepted, rejected } = partitionUploadableFiles(files);
    const room = Math.max(0, NOTEBOOK_MAX_DOCUMENTS - total);
    const batch = accepted.slice(0, room);
    if (rejected.length > 0) toast.error(describeRejectedFiles(rejected));
    if (accepted.length > batch.length) {
      toast.error(
        `${accepted.length - batch.length} Datei(en) übersprungen — ein Notebook fasst ${NOTEBOOK_MAX_DOCUMENTS} Quellen.`
      );
    }
    if (batch.length === 0) return;

    setUploading(batch.length);
    const ids: string[] = [];
    try {
      for (const file of batch) {
        const doc = await uploadFileOnly(file, file.name);
        ids.push(doc.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Hochladen der Datei.');
    }
    try {
      await hub.addDocuments(ids);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anhängen fehlgeschlagen.');
    } finally {
      setUploading(0);
    }
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      accept={ACCEPTED_EXTENSIONS.join(',')}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length > 0) void upload(files);
      }}
    />
  );

  return { upload, pick: () => inputRef.current?.click(), uploading, input };
}

export type HubUpload = ReturnType<typeof useHubUpload>;

interface UploadPanelProps {
  upload: HubUpload;
  rows: NotebookDocumentRecord[];
  query: string;
  onPreview: (doc: NotebookDocumentRecord) => void;
  onRemove: (ids: string[]) => Promise<void>;
  onReindex: (ids: string[]) => Promise<void>;
}

export function UploadPanel({
  upload: { upload, pick, uploading },
  rows,
  query,
  onPreview,
  onRemove,
  onReindex,
}: UploadPanelProps) {
  const [dragOver, setDragOver] = useState(false);

  const dropHandlers = {
    onDragEnter: (e: DragEvent<HTMLElement>) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      setDragOver(true);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (hasFileDrag(e)) e.preventDefault();
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragOver(false);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!hasFileDrag(e)) return;
      e.preventDefault();
      setDragOver(false);
      void upload(Array.from(e.dataTransfer.files ?? []));
    },
  };

  const visible = filterByTitle(rows, query);

  return (
    <section
      aria-label="Hochgeladene Dateien"
      {...dropHandlers}
      className={cn(
        'flex flex-col gap-sm rounded-xl transition-shadow',
        dragOver && 'ring-2 ring-secondary-600 ring-offset-4 ring-offset-background'
      )}
    >
      {uploading > 0 ? (
        <p role="status" className="m-0 text-sm text-grey-500">
          {uploading === 1
            ? 'Eine Datei wird hochgeladen…'
            : `${uploading} Dateien werden hochgeladen…`}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptySources
          icon={<HiUpload aria-hidden className="size-5" />}
          title="Noch keine Dateien"
          text={`PDF, DOCX, TXT oder MD hochladen oder hierher ziehen – bis ${NOTEBOOK_MAX_DOCUMENTS} Quellen pro Notebook.`}
          cta="Dateien auswählen"
          onCta={pick}
        />
      ) : visible.length === 0 ? (
        <NoMatches query={query} />
      ) : (
        <SourceTable
          rows={visible}
          onPreview={onPreview}
          actions={[
            {
              label: 'Neu indexieren',
              when: (doc) => Boolean(doc.reindexable),
              onSelect: (doc) => void onReindex([doc.id]),
            },
          ]}
          onRemove={onRemove}
          onReindex={onReindex}
          footer={
            <button
              type="button"
              onClick={pick}
              className="w-full rounded-b-lg border-0 border-t border-dashed border-grey-300 px-md py-md text-center text-[13px] text-grey-500 dark:border-grey-700"
            >
              Dateien hierher ziehen oder{' '}
              <span className="text-secondary-700 dark:text-secondary-300">auswählen</span>
            </button>
          }
        />
      )}
    </section>
  );
}
