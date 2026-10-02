import { ImagePlus, Loader2, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import {
  type CreatorPhoto,
  MAX_PHOTOS,
  PHOTO_ACCEPT,
  photoFileProblem,
  preparePhoto,
} from './sharepicPhotos';

interface PendingPhoto {
  id: string;
  name: string;
  state: 'working' | 'ready' | 'failed';
  photo: CreatorPhoto | null;
  error: string | null;
}

/**
 * Photos picked on the start screen, before the first message exists. Each is
 * uploaded and described right away; the message can go once none is still working.
 */
export function usePendingPhotos() {
  const [items, setItems] = useState<PendingPhoto[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // The list lives in a ref as well, so a job finishing and a second pick never work on a stale copy.
  const list = useRef<PendingPhoto[]>([]);
  const count = useRef(0);

  const commit = useCallback((next: PendingPhoto[]) => {
    list.current = next;
    setItems(next);
  }, []);

  const settle = useCallback(
    (id: string, patch: Partial<PendingPhoto>) =>
      commit(list.current.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    [commit]
  );

  const add = useCallback(
    (files: File[]) => {
      setNotice(null);
      let next = list.current;
      for (const file of files) {
        const problem = photoFileProblem(file);
        if (problem) {
          setNotice(problem);
          continue;
        }
        if (next.length >= MAX_PHOTOS) {
          setNotice(`Mehr als ${MAX_PHOTOS} Fotos gehen nicht.`);
          break;
        }
        const id = `pending-${count.current++}`;
        next = [...next, { id, name: file.name, state: 'working', photo: null, error: null }];
        void preparePhoto(file).then(
          (photo) => settle(id, { state: 'ready', photo }),
          (err: unknown) =>
            settle(id, {
              state: 'failed',
              error: err instanceof Error ? err.message : 'Upload fehlgeschlagen.',
            })
        );
      }
      commit(next);
    },
    [commit, settle]
  );

  const remove = useCallback(
    (id: string) => commit(list.current.filter((p) => p.id !== id)),
    [commit]
  );

  const take = useCallback((): CreatorPhoto[] => {
    const photos = list.current.flatMap((p) => (p.photo ? [p.photo] : []));
    commit([]);
    setNotice(null);
    return photos;
  }, [commit]);

  return {
    items,
    notice,
    add,
    remove,
    take,
    working: items.some((p) => p.state === 'working'),
    ready: items.filter((p) => p.state === 'ready').length,
  };
}

export function AddPhotosButton({
  onPick,
  disabled,
}: {
  onPick: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        hidden
        data-testid="photo-input"
        onChange={(e) => {
          onPick(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <button
        type="button"
        aria-label="Eigenes Foto hinzufügen"
        title="Eigenes Foto hinzufügen"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <ImagePlus className="size-4" aria-hidden="true" />
      </button>
    </>
  );
}

export function PhotoChips({
  items,
  notice,
  onRemove,
}: {
  items: PendingPhoto[];
  notice: string | null;
  onRemove: (id: string) => void;
}) {
  if (!items.length && !notice) return null;
  return (
    <div className="flex flex-col gap-xs px-1 pt-2">
      <ul className="m-0 flex list-none flex-wrap gap-xs p-0" aria-label="Eigene Fotos">
        {items.map((p) => (
          <li
            key={p.id}
            className="flex max-w-full items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
          >
            {p.state === 'working' && (
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            )}
            <span className="truncate">{p.name}</span>
            <span className="sr-only">
              {p.state === 'working'
                ? ' wird vorbereitet'
                : p.state === 'failed'
                  ? ' fehlgeschlagen'
                  : ' bereit'}
            </span>
            <button
              type="button"
              aria-label={`${p.name} entfernen`}
              onClick={() => onRemove(p.id)}
              className="flex size-4 items-center justify-center rounded-full hover:bg-background"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {(notice || items.some((p) => p.state === 'failed')) && (
        <p role="alert" className="m-0 text-xs text-red-700 dark:text-red-400">
          {notice ?? items.find((p) => p.state === 'failed')?.error}
        </p>
      )}
    </div>
  );
}
