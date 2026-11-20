import { GROUP_SHARE_NOTE_MAX } from '@gruenerator/contracts';
import { errMessage, useUpdateGroupShare } from '@gruenerator/shared/groups';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Textarea,
} from '@gruenerator/ui';
import { useState } from 'react';

interface ShareNoteDialogProps {
  groupId: string;
  /** Die Freigabe, an die die Notiz kommt; `null`, solange der Feed sie noch nachlädt. */
  shareId: string | null;
  onClose: () => void;
}

/**
 * Notiz zu einer gerade hinzugefügten Freigabe — erreicht über „Notiz schreiben“ im
 * Hinweis nach dem Hinzufügen. Schreibt über `PATCH …/shares/:shareId` (Admin oder
 * wer geteilt hat). Wird nur gerendert, solange er offen ist.
 */
export function ShareNoteDialog({ groupId, shareId, onClose }: ShareNoteDialogProps) {
  const [note, setNote] = useState('');
  const update = useUpdateGroupShare(groupId);

  const save = () => {
    if (!shareId || !note.trim()) return;
    update.mutate({ shareId, note: note.trim() }, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Notiz für das Projekt</DialogTitle>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Notiz für das Projekt"
          placeholder="Wofür ist das gedacht?"
          maxLength={GROUP_SHARE_NOTE_MAX}
          rows={3}
          className="resize-none"
        />
        {update.isError && (
          <p role="alert" className="m-0 text-sm text-red-600 dark:text-red-400">
            {errMessage(update.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={!shareId || !note.trim() || update.isPending}>
            {update.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
