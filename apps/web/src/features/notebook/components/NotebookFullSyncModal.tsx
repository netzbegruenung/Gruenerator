import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useEffect, useRef } from 'react';
import { HiCheck, HiCloud, HiDocumentText, HiExclamation } from 'react-icons/hi';

import { cn } from '../../../utils/cn';
import {
  useNotebookFullSync,
  type SyncProgressRow,
  type SyncProgressStatus,
} from '../hooks/useNotebookFullSync';

import type { NotebookCollection } from '../../../types/notebook';

interface Props {
  collection: NotebookCollection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function StatusIcon({ status }: { status: SyncProgressStatus }) {
  if (status === 'pending') {
    return (
      <span className="size-3 shrink-0 rounded-full bg-grey-300 dark:bg-grey-700" aria-hidden />
    );
  }
  if (status === 'running') {
    return (
      <span
        className="size-3 shrink-0 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500"
        aria-hidden
      />
    );
  }
  if (status === 'done') {
    return (
      <HiCheck size={16} className="shrink-0 text-green-600 dark:text-green-400" aria-hidden />
    );
  }
  return (
    <HiExclamation size={16} className="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
  );
}

function SyncRow({ row }: { row: SyncProgressRow }) {
  const accentClass =
    row.kind === 'wolke'
      ? 'via-secondary-400/50 dark:via-secondary-500/40'
      : 'via-amber-400/50 dark:via-amber-500/40';
  const Icon = row.kind === 'wolke' ? HiCloud : HiDocumentText;
  return (
    <div className="relative flex items-center gap-sm overflow-hidden rounded-lg border border-grey-200 bg-background px-md py-sm dark:border-grey-800">
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent to-transparent',
          accentClass
        )}
        aria-hidden
      />
      <Icon size={14} className="shrink-0 text-grey-400" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
        {row.summary && <span className="text-xs text-grey-500">{row.summary}</span>}
        {row.errorMessage && (
          <span className="text-xs text-amber-700 dark:text-amber-300">{row.errorMessage}</span>
        )}
      </div>
      <StatusIcon status={row.status} />
    </div>
  );
}

export function NotebookFullSyncModal({ collection, open, onOpenChange }: Props) {
  const { run, isRunning, progress, totals, error, reset } = useNotebookFullSync();
  const triggered = useRef(false);

  useEffect(() => {
    if (!triggered.current) {
      triggered.current = true;
      void run({ collection }).catch(() => {
        /* surfaced via error state */
      });
    }
    return () => {
      reset();
    };
  }, [run, collection, reset]);

  const rows = Object.values(progress);
  const finished = totals !== null && !isRunning;
  const noWork = rows.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isRunning) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alle Quellen aktualisieren</DialogTitle>
          <DialogDescription>
            Wolke-Ordner und verknüpfte Docs werden neu importiert. Fehlende Inhalte werden
            entfernt.
          </DialogDescription>
        </DialogHeader>

        {noWork ? (
          <p className="text-sm text-grey-500">Keine Wolke-Ordner oder Docs verknüpft.</p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-xs overflow-y-auto">
            {rows.map((row) => (
              <SyncRow key={row.key} row={row} />
            ))}
          </div>
        )}

        {finished && (
          <div className="mt-md rounded-lg border border-grey-200 bg-background-alt p-md dark:border-grey-800">
            <p className="m-0 text-sm font-medium text-foreground">
              Fertig — {totals.added} neu, {totals.updated} aktualisiert, {totals.removed} entfernt
            </p>
            {totals.errors > 0 && (
              <p className="m-0 mt-xs text-sm text-amber-700 dark:text-amber-300">
                {totals.errors} Quelle{totals.errors === 1 ? '' : 'n'} konnten nicht aktualisiert
                werden — Inhalt unverändert.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : 'Unbekannter Fehler'}
          </p>
        )}

        <DialogFooter>
          <Button
            variant={finished ? 'default' : 'ghost'}
            onClick={() => onOpenChange(false)}
            disabled={isRunning}
          >
            {finished ? 'Schließen' : isRunning ? 'Bitte warten…' : 'Abbrechen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
