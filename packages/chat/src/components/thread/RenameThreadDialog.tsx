'use client';

import { useAui } from '@assistant-ui/react';
import { isToastEvent } from '@gruenerator/ui';
import { Pencil, X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type FormEvent, memo, useEffect, useRef, useState } from 'react';

import { auiPromise } from '../../lib/auiAsync';

interface RenameThreadDialogProps {
  /** The thread list item's local id. Addressed by id, not by list position:
   *  a `list()` refresh while the dialog is open may reorder the list. */
  threadId: string;
  initialTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_TITLE_LENGTH = 200;

export const RenameThreadDialog = memo(function RenameThreadDialog({
  threadId,
  initialTitle,
  open,
  onOpenChange,
}: RenameThreadDialogProps) {
  const aui = useAui();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setErrorMsg(null);
    }
  }, [open, initialTitle]);

  const trimmed = title.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed === initialTitle) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await auiPromise(aui.threads.item({ id: threadId }).rename(trimmed));
      onOpenChange(false);
    } catch (err) {
      console.error('[RenameThread] rename failed:', err);
      setErrorMsg('Der Name konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1010] bg-black/40" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-[1010] m-auto h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[24rem] overflow-y-auto rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure p-6 shadow-xl"
          onInteractOutside={(event) => {
            if (isToastEvent(event)) event.preventDefault();
          }}
          aria-describedby={undefined}
          // Focus the field with its text selected, not the close button that
          // comes first in the DOM.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.select();
          }}
        >
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary-600" aria-hidden />
                <DialogPrimitive.Title className="text-lg font-semibold text-foreground">
                  Unterhaltung umbenennen
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close
                type="button"
                aria-label="Schließen"
                className="rounded-md p-1 text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 bg-transparent border-none cursor-pointer"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              ref={inputRef}
              aria-label="Name der Unterhaltung"
              className="w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500/50 focus:outline-none"
            />

            {errorMsg && (
              <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                {errorMsg}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg px-3 py-2 text-sm text-foreground-muted hover:bg-grey-100 dark:hover:bg-grey-800"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={saving || !trimmed}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
});
