import {
  GROUP_START_QUESTION_MAX,
  GROUP_START_QUESTIONS_MAX,
  GROUP_WELCOME_MAX,
} from '@gruenerator/contracts';
import { useGroupStart, useSetGroupStart } from '@gruenerator/shared/groups';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiChatCircleText } from 'react-icons/pi';

interface ProjectStartCardProps {
  groupId: string;
  isAdmin: boolean;
  onSuccessMessage?: (msg: string) => void;
  onErrorMessage?: (msg: string) => void;
}

/**
 * „Begrüßung und Startfragen": was die Übersicht über dem Chat-Feld zeigt.
 * Nur Admins sehen die Karte, Mitglieder sehen das Ergebnis im Chat-Feld.
 */
export function ProjectStartCard({
  groupId,
  isAdmin,
  onSuccessMessage,
  onErrorMessage,
}: ProjectStartCardProps) {
  const { data } = useGroupStart(groupId);
  const save = useSetGroupStart(groupId);
  const [open, setOpen] = useState(false);
  const [welcome, setWelcome] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);

  if (!isAdmin) return null;

  const welcomeMessage = data?.welcomeMessage ?? '';
  const startQuestions = data?.startQuestions ?? [];
  const hasStart = welcomeMessage !== '' || startQuestions.length > 0;

  const openDialog = () => {
    setWelcome(welcomeMessage);
    setQuestions(
      Array.from({ length: GROUP_START_QUESTIONS_MAX }, (_, i) => startQuestions[i] ?? '')
    );
    setOpen(true);
  };

  const submit = () => {
    save.mutate(
      { welcomeMessage: welcome, startQuestions: questions },
      {
        onSuccess: () => {
          setOpen(false);
          onSuccessMessage?.('Begrüßung und Startfragen gespeichert.');
        },
        onError: (error: Error) => onErrorMessage?.(`Nicht gespeichert: ${error.message}`),
      }
    );
  };

  return (
    <>
      <section
        aria-labelledby="projekt-start-titel"
        className="flex items-center gap-sm rounded-[20px] bg-card px-md py-sm shadow-sm"
      >
        <PiChatCircleText aria-hidden className="size-5 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1">
          <h2 id="projekt-start-titel" className="m-0 text-[15px] font-semibold">
            Begrüßung und Startfragen
          </h2>
          <p className="m-0 truncate text-sm text-muted-foreground">
            {hasStart
              ? welcomeMessage || startQuestions[0]
              : 'Mitgliedern den Einstieg in den Chat erleichtern'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={openDialog} className="shrink-0">
          {hasStart ? 'Bearbeiten' : 'Hinzufügen'}
        </Button>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[34rem]">
          <DialogHeader>
            <DialogTitle>Begrüßung und Startfragen</DialogTitle>
            <DialogDescription>
              Steht auf der Übersicht über dem Chat-Feld. Ein Klick auf eine Startfrage startet
              einen Chat im Projekt damit.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={welcome}
            onChange={(event) => setWelcome(event.target.value)}
            rows={3}
            maxLength={GROUP_WELCOME_MAX}
            aria-label="Begrüßung"
            placeholder="Zum Beispiel: Willkommen im Wahlkampf-Projekt! Hier findest du alles für unsere Plakate."
            disabled={save.isPending}
          />
          <p className="m-0 text-right text-sm text-muted-foreground">
            {welcome.length}/{GROUP_WELCOME_MAX} Zeichen
          </p>
          {questions.map((question, index) => (
            <Input
              // eslint-disable-next-line react/no-array-index-key -- feste Zahl von Feldern
              key={index}
              value={question}
              onChange={(event) =>
                setQuestions((prev) => prev.map((q, i) => (i === index ? event.target.value : q)))
              }
              maxLength={GROUP_START_QUESTION_MAX}
              aria-label={`Startfrage ${index + 1}`}
              placeholder={index === 0 ? 'Zum Beispiel: Fasse die Beschlusslage zusammen' : ''}
              disabled={save.isPending}
            />
          ))}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Abbrechen
            </Button>
            <Button variant="brand" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Wird gespeichert …' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
