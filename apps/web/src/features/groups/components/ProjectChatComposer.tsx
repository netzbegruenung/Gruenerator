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
}: ProjectChatComposerProps) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [teamShared, setTeamShared] = useState(true);
  const trimmed = text.trim();

  const start = () => {
    if (!trimmed) return;
    const store = useAgentStore.getState();
    store.setPendingMessage(trimmed);
    store.setPendingGroup(groupId, !isPersonal && teamShared);
    store.setChatViewMode('thread');
    void navigate('/chat');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sendet, Shift+Enter bricht um; während der IME-Eingabe nichts senden.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    start();
  };

  return (
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
  );
}
