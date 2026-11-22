import { useAgentStore } from '@gruenerator/chat';
import { Button, Textarea } from '@gruenerator/ui';
import { type KeyboardEvent, useState } from 'react';
import { PiArrowUp } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

interface ProjectChatComposerProps {
  groupId: string;
  groupName: string;
  /** Personal Projekt: a solo workspace, there is no team to share with. */
  isPersonal?: boolean;
  /** Kurze Begrüßung der Projekt-Admins über dem Eingabefeld. */
  welcomeMessage?: string;
  /** Startfragen: ein Klick startet einen Projekt-Chat mit der Frage. */
  startQuestions?: readonly string[];
}

/**
 * „Neuer Chat in <Projekt>": die erste Nachricht und das Projekt gehen als
 * Übergabe an den Chat. Der Chat legt den Thread dann MIT `groupId` an (siehe
 * `pendingGroup` im Chat-Store), bevor der erste Turn läuft — der liest den
 * Projekt-Kontext zur Laufzeit, ein späteres Ablegen käme zu spät.
 */
export function ProjectChatComposer({
  groupId,
  groupName,
  isPersonal = false,
  welcomeMessage = '',
  startQuestions = [],
}: ProjectChatComposerProps) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [teamShared, setTeamShared] = useState(true);
  const trimmed = text.trim();

  const startWith = (message: string) => {
    const store = useAgentStore.getState();
    // Ein neuer Projekt-Chat beginnt frisch: ohne den Agent, das Rezept oder
    // den Konnektor, die zuletzt in einem anderen Thread gewählt waren (#5676).
    store.resetChatContext();
    store.setPendingMessage(message);
    store.setPendingGroup(groupId, !isPersonal && teamShared);
    store.setChatViewMode('thread');
    void navigate('/chat');
  };

  const start = () => {
    if (trimmed) startWith(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sendet, Shift+Enter bricht um; während der IME-Eingabe nichts senden.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    start();
  };

  return (
    <>
      {welcomeMessage || startQuestions.length > 0 ? (
        <section aria-label={`Start in ${groupName}`} className="flex flex-col gap-sm">
          {welcomeMessage ? (
            <p className="m-0 whitespace-pre-wrap text-[15px]">{welcomeMessage}</p>
          ) : null}
          {startQuestions.length > 0 ? (
            <ul className="m-0 flex list-none flex-wrap gap-xs p-0">
              {startQuestions.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => startWith(question)}
                    className="cursor-pointer rounded-full border border-border bg-card px-md py-xs text-left text-sm shadow-sm hover:bg-accent"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <form
        aria-label={`Neuer Chat in ${groupName}`}
        className="flex flex-col gap-xs rounded-[20px] bg-card p-sm shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <div className="flex items-end gap-sm">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            aria-label={`Neuer Chat in ${groupName}`}
            placeholder={`Neuer Chat in ${groupName} …`}
            className="min-h-10 flex-1 resize-none border-none bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            type="submit"
            variant="brand"
            size="icon"
            className="rounded-full"
            disabled={!trimmed}
            aria-label="Chat im Projekt starten"
          >
            <PiArrowUp aria-hidden />
          </Button>
        </div>
        {isPersonal ? null : (
          <label className="flex w-fit cursor-pointer items-center gap-xs px-xs text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              role="switch"
              checked={teamShared}
              onChange={(event) => setTeamShared(event.target.checked)}
              className="size-4 accent-primary-600"
            />
            Für das Team
          </label>
        )}
      </form>
    </>
  );
}
