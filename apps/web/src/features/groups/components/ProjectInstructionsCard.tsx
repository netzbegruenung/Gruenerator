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

const firstLine = (text: string) => text.trim().split('\n')[0] ?? '';

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
        className="flex items-center gap-sm rounded-[20px] bg-card px-md py-sm shadow-sm"
      >
        <PiSlidersHorizontal aria-hidden className="size-5 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1">
          <h2 id="projekt-anweisungen-titel" className="m-0 text-[15px] font-semibold">
            Anweisungen
          </h2>
          <p className="m-0 truncate text-sm text-muted-foreground">
            {instructions ? firstLine(instructions) : 'Ton, Zielgruppe oder Schwerpunkt festlegen'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={openDialog} className="shrink-0">
          {isAdmin ? (instructions ? 'Bearbeiten' : 'Hinzufügen') : 'Ansehen'}
        </Button>
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
