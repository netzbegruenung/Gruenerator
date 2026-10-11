import { HiCheck, HiXMark } from 'react-icons/hi2';

import type { QueuedUpload } from '../hooks/useUploadQueue';
import type { JSX } from 'react';

/** One row per file of the current upload batch. */
export function UploadQueueList({
  queue,
  progress,
  onDismiss,
}: {
  queue: QueuedUpload[];
  progress: number;
  onDismiss: () => void;
}): JSX.Element | null {
  if (queue.length === 0) return null;
  const busy = queue.some((entry) => entry.status === 'waiting' || entry.status === 'uploading');

  return (
    <div
      className="flex flex-col gap-1 rounded-lg bg-background-alt p-sm text-sm"
      aria-live="polite"
    >
      {queue.map((entry) => (
        <div key={entry.id} className="flex items-center gap-sm px-xs">
          <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          {entry.status === 'uploading' && (
            <span className="flex items-center gap-sm text-muted-foreground">
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-grey-200 dark:bg-grey-700">
                <span
                  className="block h-full bg-primary-600 transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </span>
              {progress} %
            </span>
          )}
          {entry.status === 'waiting' && <span className="text-muted-foreground">Wartet …</span>}
          {entry.status === 'done' && (
            <span className="flex items-center gap-1 text-primary-600 dark:text-primary-400">
              <HiCheck aria-hidden className="size-4" /> Hochgeladen
            </span>
          )}
          {entry.status === 'error' && <span className="text-error">{entry.error}</span>}
        </div>
      ))}
      {!busy && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex items-center gap-1 self-end px-xs text-muted-foreground hover:text-foreground"
        >
          <HiXMark aria-hidden className="size-4" /> Ausblenden
        </button>
      )}
    </div>
  );
}
