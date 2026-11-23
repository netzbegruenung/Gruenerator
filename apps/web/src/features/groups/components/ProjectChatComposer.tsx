import { useId, useState } from 'react';

import ChatInner from '../../workplace/components/ChatInner';

interface ProjectChatComposerProps {
  groupId: string;
}

/**
 * „Neuer Chat in <Projekt>": derselbe Composer wie auf der Startseite (Modus,
 * Modell, Werkzeuge, Anhänge auf „Auto"), ohne Projekt-Picker: die Seite ist die
 * Wahl. Der Chat legt den Thread dann MIT `groupId` an (`pendingGroup`),
 * bevor der erste Turn läuft — der liest den Projekt-Kontext zur Laufzeit.
 * Der Schalter „Im Projekt teilen" entscheidet nur, ob der Chat für die anderen
 * Mitglieder sichtbar ist; das Wissen des Projekts nutzt er auch privat.
 */
export function ProjectChatComposer({ groupId }: ProjectChatComposerProps) {
  const [shared, setShared] = useState(true);
  const hintId = useId();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-xs">
      <h2 id={titleId} className="m-0 text-[17px] font-semibold">
        Neuen Chat im Projekt starten
      </h2>
      <ChatInner projectId={groupId} teamShared={shared} />
      <label className="flex w-fit max-w-full cursor-pointer items-center gap-xs px-sm text-[13px] text-muted-foreground">
        <input
          type="checkbox"
          role="switch"
          checked={shared}
          onChange={(event) => setShared(event.target.checked)}
          aria-describedby={shared ? undefined : hintId}
          className="size-4 shrink-0 accent-primary-600"
        />
        Im Projekt teilen
      </label>
      {shared ? null : (
        <p id={hintId} className="px-sm text-[13px] text-muted-foreground">
          Privat – nutzt trotzdem das Wissen des Projekts
        </p>
      )}
    </section>
  );
}
