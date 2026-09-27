import {
  GROUP_POST_FILE_LIMIT,
  GROUP_POST_FILE_MAX_BYTES,
  GROUP_POST_MAX,
} from '@gruenerator/contracts';
import {
  errMessage,
  fileExtensionLabel,
  formatFileSize,
  personInitials,
  useCreateGroupPost,
} from '@gruenerator/shared/groups';
import { Button, cn, Textarea } from '@gruenerator/ui';
import { isAxiosError } from 'axios';
import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { PiPaperclip, PiSparkle, PiX } from 'react-icons/pi';

interface PendingFile {
  id: string;
  file: File;
  /** Objekt-URL für die Vorschau, nur bei Bildern. */
  previewUrl: string | null;
}

interface GroupComposerProps {
  groupId: string;
  groupName: string;
  memberCount: number;
  currentUserName: string | null;
  /** „Aus meinen Inhalten": Teilen-Dialog, der bisherige Text wird zur Notiz. */
  onOpenShare: (note: string) => void;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** Die Meldung des Servers (400 mit `message`) statt „Request failed with status code 400". */
function uploadError(error: unknown): string {
  if (isAxiosError(error))
    return errMessage(error.response?.data, 'Beitrag konnte nicht gespeichert werden.');
  return errMessage(error, 'Beitrag konnte nicht gespeichert werden.');
}

/**
 * Schreiben in den Gruppen-Feed: Text und bis zu zehn Dateien, ohne etwas zu
 * teilen. Zugeklappt eine Zeile, aufgeklappt mit Anhängen und Aktionen.
 * Dateien kommen über den Button oder per Drag & Drop auf die Karte.
 */
export function GroupComposer({
  groupId,
  groupName,
  memberCount,
  currentUserName,
  onOpenShare,
}: GroupComposerProps) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const createPost = useCreateGroupPost(groupId);

  // Objekt-URLs beim Verlassen der Seite freigeben; beim Entfernen einzeln.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(
    () => () => {
      for (const f of filesRef.current) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    },
    []
  );

  const addFiles = (list: FileList | null) => {
    const incoming = Array.from(list ?? []);
    if (incoming.length === 0) return;
    const tooBig = incoming.filter((f) => f.size > GROUP_POST_FILE_MAX_BYTES);
    const accepted = incoming
      .filter((f) => f.size <= GROUP_POST_FILE_MAX_BYTES)
      .slice(0, Math.max(0, GROUP_POST_FILE_LIMIT - files.length));
    const dropped = incoming.length - tooBig.length - accepted.length;
    setLocalError(
      tooBig.length
        ? `${tooBig.map((f) => f.name).join(', ')}: größer als ${GROUP_POST_FILE_MAX_BYTES / 1024 / 1024} MB.`
        : dropped
          ? `Höchstens ${GROUP_POST_FILE_LIMIT} Dateien pro Beitrag.`
          : null
    );
    setFiles((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: IMAGE_TYPES.has(file.type) ? URL.createObjectURL(file) : null,
      })),
    ]);
    setExpanded(true);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const gone = prev.find((f) => f.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const reset = () => {
    for (const f of files) if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    setFiles([]);
    setText('');
    setLocalError(null);
    setProgress(null);
    createPost.reset();
    setExpanded(false);
  };

  const canPost = (text.trim().length > 0 || files.length > 0) && !createPost.isPending;

  const post = () => {
    if (!canPost) return;
    setLocalError(null);
    createPost.mutate(
      { body: text.trim(), files: files.map((f) => f.file), onProgress: setProgress },
      { onSuccess: reset, onSettled: () => setProgress(null) }
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      post();
    }
    if (e.key === 'Escape' && !text && files.length === 0) setExpanded(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const images = files.filter((f) => f.previewUrl);
  const others = files.filter((f) => !f.previewUrl);
  const error = localError ?? (createPost.isError ? uploadError(createPost.error) : null);
  const avatar = (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white"
    >
      {personInitials(currentUserName)}
    </span>
  );

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Drag & Drop ist nur eine Abkürzung; per Tastatur gehen Dateien über „Dateien anhängen" bzw. „Dateien"
    <div
      className={cn(
        'relative rounded-[20px] border bg-card',
        expanded ? 'border-primary-200 dark:border-primary-800' : 'border-transparent shadow-sm'
      )}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {!expanded ? (
        <div className="flex items-center gap-sm p-sm pl-md">
          {avatar}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="h-11 min-w-0 flex-1 cursor-text truncate rounded-full border-none bg-background-alt px-md text-left font-[inherit] text-[15px] text-muted-foreground hover:bg-grey-100 dark:hover:bg-grey-800"
          >
            Schreib etwas an die Gruppe …
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-full text-muted-foreground"
            aria-label="Dateien anhängen"
            onClick={() => fileInput.current?.click()}
          >
            <PiPaperclip className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex items-center gap-sm px-md pt-md">
            {avatar}
            <div className="flex min-w-0 flex-col">
              <strong className="truncate text-[15px]">{currentUserName ?? 'Du'}</strong>
              <span className="truncate text-[13px] text-muted-foreground">
                an {groupName} ·{' '}
                {memberCount === 1 ? 'nur du siehst' : `alle ${memberCount} Mitglieder sehen`} den
                Beitrag
              </span>
            </div>
          </div>

          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            rows={3}
            maxLength={GROUP_POST_MAX}
            aria-label="Beitrag an die Gruppe"
            placeholder="Was möchtest du mit der Gruppe teilen?"
            className="min-h-[88px] resize-none border-none bg-transparent px-md py-sm text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
          />

          {images.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-xs px-md pb-sm pt-0">
              {images.map((f) => (
                <li
                  key={f.id}
                  className="relative size-24 overflow-hidden rounded-md bg-background-alt"
                >
                  <img
                    src={f.previewUrl ?? ''}
                    alt={f.file.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    aria-label={`${f.file.name} entfernen`}
                    className="absolute right-1 top-1 flex size-6 cursor-pointer items-center justify-center rounded-full border-none bg-black/60 p-0 text-white"
                  >
                    <PiX className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {others.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-xs px-md pb-sm pt-0">
              {others.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-sm rounded-md border border-grey-200 p-xs pl-sm dark:border-grey-700"
                >
                  <FileBadge name={f.file.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{f.file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(f.file.size)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`${f.file.name} entfernen`}
                    onClick={() => removeFile(f.id)}
                  >
                    <PiX className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="mx-md mb-xs mt-0 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-xs border-t border-grey-100 px-sm py-sm dark:border-grey-800">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => fileInput.current?.click()}
              disabled={files.length >= GROUP_POST_FILE_LIMIT}
            >
              <PiPaperclip aria-hidden /> Dateien
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => onOpenShare(text.trim())}
            >
              <PiSparkle aria-hidden /> Aus meinen Inhalten
            </Button>
            <div className="ml-auto flex gap-xs">
              <Button variant="ghost" onClick={reset} disabled={createPost.isPending}>
                Abbrechen
              </Button>
              <Button variant="brand" onClick={post} disabled={!canPost}>
                {createPost.isPending
                  ? progress != null && files.length > 0
                    ? `Lädt … ${Math.round(progress * 100)} %`
                    : 'Wird gepostet …'
                  : 'Posten'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-xs rounded-[20px] border-2 border-dashed border-primary-500 bg-primary-50/95 text-primary-700 dark:bg-primary-900/90 dark:text-primary-200"
        >
          <PiPaperclip className="size-7" />
          <span className="text-[15px] font-semibold">Dateien hier ablegen</span>
        </div>
      )}
    </div>
  );
}

export function FileBadge({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex h-10 w-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-[10px] font-bold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
    >
      {fileExtensionLabel(name)}
    </span>
  );
}
