import { useState } from 'react';

import ChatInner from '../../workplace/components/ChatInner';

interface ProjectChatComposerProps {
  groupId: string;
  /** Nobody else in the Projekt (or the system Projekt): there is no team to share with. */
  solo?: boolean;
}

/**
 * „Neuer Chat in <Projekt>": derselbe Composer wie auf der Startseite (Modus,
 * Modell, Werkzeuge, Anhänge auf „Auto"), ohne Projekt-Picker: die Seite ist die
 * Wahl. Der Chat legt den Thread dann MIT `groupId` an (`pendingGroup`),
 * bevor der erste Turn läuft — der liest den Projekt-Kontext zur Laufzeit.
 */
export function ProjectChatComposer({ groupId, solo = false }: ProjectChatComposerProps) {
  const [teamShared, setTeamShared] = useState(true);

  return (
    <div className="flex flex-col gap-xs">
      <ChatInner projectId={groupId} teamShared={!solo && teamShared} />
      {solo ? null : (
        <label className="mx-auto flex w-full max-w-[720px] cursor-pointer items-center gap-xs px-sm text-[13px] text-muted-foreground">
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
    </div>
  );
}
