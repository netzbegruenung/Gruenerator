import { type NotebookDocumentRecord } from '@gruenerator/contracts';
import { formatRelativeTime } from '@gruenerator/shared/utils';
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { HiDotsHorizontal } from 'react-icons/hi';

import { cn } from '../../../../utils/cn';

import { kindLabel, pagesLabel, sourceStatus, SOURCE_STATUS_LABELS } from './hubSources';
import { StatusDot } from './StatusDot';

export interface RowAction {
  label: string;
  onSelect: (doc: NotebookDocumentRecord) => void;
  /** Ohne Rückgabe `true` erscheint der Eintrag für diese Zeile nicht. */
  when?: (doc: NotebookDocumentRecord) => boolean;
}

interface SourceTableProps {
  rows: NotebookDocumentRecord[];
  /** Statustext einer fertigen Zeile — „Bereit" bei Uploads, „Verknüpft" bei Docs. */
  readyLabel?: string;
  onPreview: (doc: NotebookDocumentRecord) => void;
  actions: RowAction[];
  onRemove: (ids: string[]) => Promise<void>;
  onReindex?: (ids: string[]) => Promise<void>;
  disabled?: boolean;
  footer?: ReactNode;
}

const COLS =
  'grid-cols-[1.75rem_minmax(0,1fr)_2.25rem] @min-[760px]:grid-cols-[1.75rem_minmax(0,1fr)_6.25rem_7.5rem_8.5rem_2.25rem]';

export function SourceTable({
  rows,
  readyLabel = SOURCE_STATUS_LABELS.ready,
  onPreview,
  actions,
  onRemove,
  onReindex,
  disabled = false,
  footer,
}: SourceTableProps) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  // Zeilen, die inzwischen verschwunden sind, fallen aus der Auswahl.
  const selected = useMemo(
    () => rows.filter((r) => checked.has(r.id)).map((r) => r.id),
    [rows, checked]
  );
  const reindexable = useMemo(
    () => rows.filter((r) => checked.has(r.id) && r.reindexable).map((r) => r.id),
    [rows, checked]
  );
  const allChecked = rows.length > 0 && selected.length === rows.length;

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const runBulk = async (fn: (ids: string[]) => Promise<void>, ids: string[]) => {
    setBusy(true);
    try {
      await fn(ids);
      setChecked(new Set());
    } finally {
      setBusy(false);
    }
  };

  const statusText = (doc: NotebookDocumentRecord) => {
    const status = sourceStatus(doc);
    return status === 'ready' ? readyLabel : SOURCE_STATUS_LABELS[status];
  };

  return (
    <div className="@container flex flex-col gap-sm">
      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-xs rounded-lg bg-secondary-600 px-md py-xs text-sm text-white">
          <span className="font-semibold">{selected.length} ausgewählt</span>
          {onReindex && reindexable.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-white hover:bg-white/15 hover:text-white"
              disabled={busy || disabled}
              onClick={() => void runBulk(onReindex, reindexable)}
            >
              Neu indexieren
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="xs"
            className="text-white hover:bg-white/15 hover:text-white"
            disabled={busy || disabled}
            onClick={() => void runBulk(onRemove, selected)}
          >
            Entfernen
          </Button>
          <button
            type="button"
            onClick={() => setChecked(new Set())}
            className="ml-auto text-[13px] underline"
          >
            Auswahl aufheben
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border border-grey-200 text-sm dark:border-grey-700">
        <div
          className={cn(
            'grid items-center gap-sm rounded-t-lg bg-background-alt px-md py-sm text-xs tracking-wide text-grey-500 uppercase',
            COLS
          )}
        >
          <Checkbox
            checked={allChecked}
            onCheckedChange={(v) =>
              setChecked(v === true ? new Set(rows.map((r) => r.id)) : new Set())
            }
            aria-label="Alle auswählen"
          />
          <span>Name</span>
          <span className="hidden @min-[760px]:block">Umfang</span>
          <span className="hidden @min-[760px]:block">Hinzugefügt</span>
          <span className="hidden @min-[760px]:block">Status</span>
          <span />
        </div>

        {rows.map((doc) => {
          const isChecked = checked.has(doc.id);
          const status = sourceStatus(doc);
          const added = formatRelativeTime(doc.created_at);
          const rowActions = actions.filter((a) => !a.when || a.when(doc));
          return (
            <div
              key={doc.id}
              className={cn(
                'grid items-center gap-sm border-t border-grey-200 px-md py-sm dark:border-grey-700',
                COLS,
                isChecked && 'bg-secondary-600/8'
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(v) => toggle(doc.id, v === true)}
                aria-label={`${doc.title} auswählen`}
              />
              <div className="flex min-w-0 items-center gap-sm">
                <span
                  aria-hidden
                  className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-md bg-secondary-600/15 text-[8px] font-bold text-secondary-700 dark:text-secondary-300"
                >
                  {kindLabel(doc)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <button
                    type="button"
                    onClick={() => onPreview(doc)}
                    className="truncate text-left hover:text-secondary-700 hover:underline dark:hover:text-secondary-300"
                  >
                    {doc.title}
                  </button>
                  <span className="truncate text-xs text-grey-500 @min-[760px]:hidden">
                    {[pagesLabel(doc), added, statusText(doc)]
                      .filter((p) => p && p !== '—')
                      .join(' · ')}
                  </span>
                  {status === 'failed' && doc.processing_error ? (
                    <span
                      className="truncate text-xs text-red-700 dark:text-red-400"
                      title={doc.processing_error}
                    >
                      {doc.processing_error}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="hidden text-grey-500 @min-[760px]:block">{pagesLabel(doc)}</span>
              <span className="hidden text-grey-500 @min-[760px]:block">{added}</span>
              <span className="hidden items-center gap-xs @min-[760px]:inline-flex">
                <StatusDot status={status} />
                {statusText(doc)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Aktionen für ${doc.title}`}>
                    <HiDotsHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[12.5rem]">
                  <DropdownMenuItem onSelect={() => onPreview(doc)}>Vorschau</DropdownMenuItem>
                  {rowActions.map((a) => (
                    <DropdownMenuItem key={a.label} onSelect={() => a.onSelect(doc)}>
                      {a.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={disabled}
                    onSelect={() => void onRemove([doc.id])}
                  >
                    Aus Notebook entfernen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
        {footer}
      </div>
    </div>
  );
}
