import { cn, Switch } from '@gruenerator/ui';
import { useId, useState } from 'react';

import ChatInner from '../../workplace/components/ChatInner';

import { PROJECT_CHAT_ROW_CONTROL, SpaceChatsSection } from './SpaceChatsSection';

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
  const switchId = useId();

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-xs">
      <h2 id={titleId} className="m-0 text-[17px] font-semibold">
        Neuen Chat im Projekt starten
      </h2>
      <ChatInner projectId={groupId} teamShared={shared} />
      <SpaceChatsSection
        groupId={groupId}
        aside={
          <div className="flex flex-col items-end">
            <label htmlFor={switchId} className={cn(PROJECT_CHAT_ROW_CONTROL, 'cursor-pointer')}>
              Im Projekt teilen
              <Switch
                id={switchId}
                size="sm"
                checked={shared}
                onCheckedChange={setShared}
                aria-describedby={shared ? undefined : hintId}
              />
            </label>
            {shared ? null : (
              <p id={hintId} className="m-0 px-sm text-[13px] text-muted-foreground">
                Privat – nutzt trotzdem das Wissen des Projekts
              </p>
            )}
          </div>
        }
      />
    </section>
  );
}
