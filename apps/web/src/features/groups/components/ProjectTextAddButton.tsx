import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiTextT } from 'react-icons/pi';

import apiClient from '../../../components/utils/apiClient';

/** Obergrenze je Text: er wird in einem Zug eingebettet. Längeres gehört in eine Datei. */
const TEXT_MAX = 100_000;
const TITLE_MAX = 200;

interface ProjectTextAddButtonProps {
  groupId: string;
  onAdded: () => void;
  onError: (message: string) => void;
}

interface AddTextResponse {
  success: boolean;
  data: { id: string };
}

/**
 * „Text hinzufügen": Titel und Text werden als Dokument der Person angelegt
 * (`POST /documents/add-text`, sofort `completed`) und im selben Zug als
 * `documents` ins Projekt geteilt — es verhält sich wie eine hochgeladene Datei.
 */
export function ProjectTextAddButton({ groupId, onAdded, onError }: ProjectTextAddButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = title.trim().length > 0 && text.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const created = await apiClient.post<AddTextResponse>('/documents/add-text', {
        title: title.trim(),
        content: text.trim(),
      });
      const res = await getContractsClient().groups.shareContent({
        params: { groupId },
        body: {
          contentType: 'documents',
          contentId: created.data.data.id,
          permissions: { read: true, write: false, collaborative: false },
          note: null,
        },
      });
      if (res.status !== 200) throw apiErrorFromResponse(res, 'Text konnte nicht geteilt werden.');
      setOpen(false);
      setTitle('');
      setText('');
      onAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Text konnte nicht hinzugefügt werden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="max-sm:size-9 max-sm:rounded-full max-sm:p-0"
      >
        <PiTextT aria-hidden />
        <span className="max-sm:sr-only">Text hinzufügen</span>
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>Text hinzufügen</DialogTitle>
            <DialogDescription>
              Der Text liegt danach wie eine Datei im Projekt, und Chats darin können ihn lesen.
            </DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TITLE_MAX}
            aria-label="Titel des Textes"
            placeholder="Titel"
            disabled={busy}
            className="w-full rounded-md border border-grey-300 bg-background px-sm py-xs text-base text-foreground focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-grey-600"
          />
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            maxLength={TEXT_MAX}
            aria-label="Text"
            placeholder="Text einfügen oder schreiben …"
            disabled={busy}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="brand" onClick={() => void submit()} disabled={!canSubmit}>
              {busy ? 'Wird hinzugefügt …' : 'Hinzufügen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
