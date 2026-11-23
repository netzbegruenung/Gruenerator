import { GROUP_INSTRUCTIONS_MAX } from '@gruenerator/contracts';
import { useGroupInstructions, useSetGroupInstructions } from '@gruenerator/shared/groups';
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
import { PiSlidersHorizontal } from 'react-icons/pi';

/** Bis zu dieser Länge stehen die Anweisungen ganz da, darüber gekürzt (ganz im Dialog). */
const PREVIEW_MAX_CHARS = 300;
const preview = (text: string) => {
  const t = text.trim();
  return t.length <= PREVIEW_MAX_CHARS ? t : `${t.slice(0, PREVIEW_MAX_CHARS).trimEnd()}…`;
};

interface ProjectInstructionsCardProps {
  groupId: string;
  isAdmin: boolean;
  onSuccessMessage?: (msg: string) => void;
  onErrorMessage?: (msg: string) => void;
}

/**
 * „Anweisungen": ein Text der Projekt-Admins, der für jeden Chat im Projekt
 * gilt (Ton, Zielgruppe, Schwerpunkt). Mitglieder lesen, Admins bearbeiten.
 * Ohne Text sehen Mitglieder nichts — Admins die Einladung, einen zu schreiben.
 */
export function ProjectInstructionsCard({
  groupId,
  isAdmin,
  onSuccessMessage,
  onErrorMessage,
}: ProjectInstructionsCardProps) {
  const { data: instructions = '' } = useGroupInstructions(groupId);
  const save = useSetGroupInstructions(groupId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  if (!instructions && !isAdmin) return null;

  const openDialog = () => {
    setDraft(instructions);
    setOpen(true);
  };

  const submit = () => {
    save.mutate(draft, {
      onSuccess: (saved) => {
        setOpen(false);
        onSuccessMessage?.(saved ? 'Anweisungen gespeichert.' : 'Anweisungen entfernt.');
      },
      onError: (error: Error) =>
        onErrorMessage?.(`Anweisungen nicht gespeichert: ${error.message}`),
    });
  };

  return (
    <>
      <section
        aria-labelledby="projekt-anweisungen-titel"
        className="flex flex-col gap-xs rounded-[20px] bg-card px-md py-sm shadow-sm"
      >
        {/* Kopfzeile wie bei „Geplant“: die Aktion steht neben der Überschrift,
            der Text darunter hat die ganze Breite. */}
        <div className="flex items-center gap-sm">
          <PiSlidersHorizontal
            aria-hidden
            className="size-5 shrink-0 text-primary-600 dark:text-primary-400"
          />
          <h2
            id="projekt-anweisungen-titel"
            className="m-0 min-w-0 flex-1 text-[15px] font-semibold"
          >
            Anweisungen
          </h2>
          <button
            type="button"
            onClick={openDialog}
            className="inline-flex shrink-0 cursor-pointer items-center rounded-md border-none bg-transparent px-2 py-1 font-[inherit] text-sm font-medium text-primary-600 hover:bg-muted dark:text-primary-400"
          >
            {isAdmin ? 'Anpassen' : 'Ansehen'}
          </button>
        </div>
        {/* Kurze Anweisungen ganz, lange gekürzt: man soll lesen können, was gilt. */}
        <p className="m-0 whitespace-pre-line break-words text-sm text-muted-foreground">
          {instructions ? preview(instructions) : 'Ton, Zielgruppe oder Schwerpunkt festlegen'}
        </p>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>Anweisungen</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? 'Gilt für jeden Chat in diesem Projekt und ist für alle Mitglieder sichtbar. Sie steuern Ton und Inhalt, ersetzen aber keine Regeln des Grünerators.'
                : 'Die Admins dieses Projekts haben diese Anweisungen für alle Chats darin hinterlegt.'}
            </DialogDescription>
          </DialogHeader>
          {isAdmin ? (
            <>
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={8}
                maxLength={GROUP_INSTRUCTIONS_MAX}
                aria-label="Anweisungen für Chats in diesem Projekt"
                placeholder="Zum Beispiel: Schreibe im Du, in kurzen Sätzen, für Neumitglieder im Ortsverband."
                disabled={save.isPending}
              />
              <p className="m-0 text-right text-sm text-muted-foreground">
                {draft.length}/{GROUP_INSTRUCTIONS_MAX} Zeichen
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
                  Abbrechen
                </Button>
                <Button variant="brand" onClick={submit} disabled={save.isPending}>
                  {save.isPending ? 'Wird gespeichert …' : 'Speichern'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <p className="m-0 max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-[15px]">
              {instructions}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
