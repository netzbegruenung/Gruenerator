import { Button } from '@gruenerator/ui';
import { useEffect, useRef } from 'react';
import { HiCheckCircle, HiOutlineClock, HiX } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { cn } from '../../../utils/cn';

import { useDocumentStatusPolling } from '../hooks/useDocumentStatusPolling';

import type {
  DocumentStatusValue,
  DocumentProcessingStage,
  DocumentProcessingProgress,
} from '@gruenerator/contracts';

interface DocumentMeta {
  id: string;
  title: string;
}

interface Props {
  notebookName: string;
  documents: DocumentMeta[];
  collectionId: string;
  onClose: () => void;
}

const ROW_LABEL: Record<DocumentStatusValue, string> = {
  pending: 'Wartet',
  uploaded: 'Wartet',
  processing: 'Wird verarbeitet…',
  completed: 'Fertig',
  failed: 'Fehler',
};

// Stage labels overlap with the generic "Wird verarbeitet…" status label —
// when a stage is known, prefer the specific label so users see real movement.
const STAGE_LABEL: Record<DocumentProcessingStage, string> = {
  extracting: 'Wird gescannt…',
  chunking: 'Wird zerlegt…',
  upserting: 'Wird indexiert…',
};

const TERMINAL: ReadonlySet<DocumentStatusValue> = new Set(['completed', 'failed']);

const StatusIcon = ({ status }: { status: DocumentStatusValue }) => {
  if (status === 'completed') {
    return <HiCheckCircle className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden />;
  }
  if (status === 'failed') {
    return <HiX className="w-5 h-5 text-red-500 shrink-0" aria-hidden />;
  }
  if (status === 'processing') {
    return (
      <span
        className="w-5 h-5 shrink-0 inline-block rounded-full border-2 border-primary-500 border-t-transparent animate-spin"
        aria-hidden
      />
    );
  }
  return <HiOutlineClock className="w-5 h-5 text-neutral-400 shrink-0" aria-hidden />;
};

const rowLabel = (
  status: DocumentStatusValue,
  stage: DocumentProcessingStage | null,
  progress: DocumentProcessingProgress | null
): string => {
  if (status !== 'processing') return ROW_LABEL[status];
  if (!stage) return ROW_LABEL.processing;
  if (stage === 'upserting' && progress && progress.total > 0) {
    return `${STAGE_LABEL.upserting} ${progress.current} / ${progress.total} Abschnitte`;
  }
  return STAGE_LABEL[stage];
};

const NotebookCreationProgress = ({ notebookName, documents, collectionId, onClose }: Props) => {
  const ids = documents.map((d) => d.id);
  const { statuses, stages, progresses, allDone } = useDocumentStatusPolling(ids, {
    enabled: ids.length > 0,
  });

  const doneCount = documents.filter((d) => TERMINAL.has(statuses[d.id] ?? 'pending')).length;
  const failedCount = documents.filter((d) => statuses[d.id] === 'failed').length;
  const total = documents.length;
  const percent = total === 0 ? 100 : Math.round((doneCount / total) * 100);

  // Auto-navigate to the edit page when everything succeeded so the user can
  // immediately keep iterating. Ref-guarded because the polling query keeps
  // re-evaluating after `allDone` flips — without it we'd push history per tick.
  // On any failure we stay on the modal so the user sees what went wrong.
  const navigate = useNavigate();
  const hasNavigatedRef = useRef(false);
  useEffect(() => {
    if (allDone && failedCount === 0 && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      navigate(`/notebooks/${collectionId}/bearbeiten`);
    }
  }, [allDone, failedCount, collectionId, navigate]);

  return (
    <div className="p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{notebookName || 'Notebook'} wird erstellt…</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Deine Dokumente werden verarbeitet. Das kann je nach Größe einige Sekunden dauern.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {documents.map((doc) => {
          const status = statuses[doc.id] ?? 'pending';
          const stage = stages[doc.id] ?? null;
          const progress = progresses[doc.id] ?? null;
          const isFailed = status === 'failed';
          const showUpsertBar =
            status === 'processing' &&
            stage === 'upserting' &&
            progress !== null &&
            progress.total > 0;
          const upsertPercent = showUpsertBar
            ? Math.min(100, Math.round((progress.current / progress.total) * 100))
            : 0;
          return (
            <li
              key={doc.id}
              className={cn(
                'flex flex-col gap-1 px-3 py-2 rounded-md bg-neutral-50 dark:bg-neutral-900',
                isFailed && 'bg-red-50 dark:bg-red-950/30'
              )}
            >
              <div className="flex items-center gap-3">
                <StatusIcon status={status} />
                <span className="flex-1 truncate text-sm">{doc.title}</span>
                <span
                  className={cn(
                    'text-xs text-neutral-500',
                    status === 'completed' && 'text-emerald-600',
                    isFailed && 'text-red-600'
                  )}
                >
                  {rowLabel(status, stage, progress)}
                </span>
              </div>
              {showUpsertBar && (
                <div
                  className="ml-8 h-1 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={upsertPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${doc.title}: Indexierung ${upsertPercent}%`}
                >
                  <div
                    className="h-full bg-primary-500 transition-[width] duration-300 ease-out"
                    style={{ width: `${upsertPercent}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>
            {doneCount} von {total} abgeschlossen
          </span>
          <span>{percent}%</span>
        </div>
        <div
          className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-primary-500 transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-2 gap-2">
        {allDone && failedCount === 0 ? (
          <span className="text-sm text-neutral-500">Weiter zum Notebook…</span>
        ) : allDone && failedCount > 0 ? (
          <span className="text-sm text-red-600">
            {failedCount} von {total} fehlgeschlagen
          </span>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {allDone && failedCount > 0 && (
            <Button
              variant="ghost"
              onClick={() => navigate(`/notebooks/${collectionId}/bearbeiten`)}
            >
              Trotzdem öffnen
            </Button>
          )}
          <Button onClick={onClose} disabled={!allDone}>
            {allDone ? 'Schließen' : 'Bitte warten…'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotebookCreationProgress;
