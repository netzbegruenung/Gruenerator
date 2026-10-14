import { useMediaUpload } from '@gruenerator/shared/media-library';
import { useCallback, useRef, useState } from 'react';

export interface QueuedUpload {
  id: number;
  name: string;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  error?: string;
}

/**
 * Uploads files one after another and keeps a per-file status, so a batch shows
 * which file is running and which one failed — instead of one shared bar that
 * resets for every file.
 */
export function useUploadQueue() {
  const failure = useRef<string | null>(null);
  const { upload, progress } = useMediaUpload({
    onError: (message) => {
      failure.current = message;
    },
  });
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const nextId = useRef(0);
  const running = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((id: number, update: Partial<QueuedUpload>) => {
    setQueue((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...update } : entry)));
  }, []);

  const enqueue = useCallback(
    (files: FileList | File[]) => {
      const entries = Array.from(files).map((file) => ({ file, id: nextId.current++ }));
      if (entries.length === 0) return;
      setQueue((prev) => [
        ...prev.filter((entry) => entry.status !== 'done'),
        ...entries.map(({ file, id }) => ({ id, name: file.name, status: 'waiting' as const })),
      ]);
      // Chained, so a second drop while the first batch runs waits its turn.
      running.current = running.current.then(async () => {
        for (const { file, id } of entries) {
          patch(id, { status: 'uploading' });
          failure.current = null;
          const result = await upload(file, { uploadSource: 'upload' });
          // Set by `onError` during the await; TS still sees the `null` above.
          const reason = failure.current as string | null;
          patch(
            id,
            result
              ? { status: 'done' }
              : {
                  status: 'error',
                  error: reason ?? 'Hochladen fehlgeschlagen',
                }
          );
        }
      });
    },
    [upload, patch]
  );

  /** Clears finished and failed entries; running ones stay. */
  const dismiss = useCallback(() => {
    setQueue((prev) =>
      prev.filter((entry) => entry.status === 'waiting' || entry.status === 'uploading')
    );
  }, []);

  return { queue, progress, enqueue, dismiss };
}
