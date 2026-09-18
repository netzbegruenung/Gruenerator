import { useAgentStore } from '@gruenerator/chat';
import { useEffect } from 'react';

/**
 * Hält das Rezept aus `/chat?rezept=<mention>&rezeptId=<id>` aktiv, solange der
 * Parameter in der URL steht.
 *
 * Einmal setzen genügt nicht. Trifft der Deeplink ein Systemrezept, löst
 * `ChatPage` daraus zusätzlich einen Agenten auf; der `AgentSwitchListener` in
 * `packages/chat` bemerkt den Wechsel von `selectedAgentId` erst im NÄCHSTEN
 * Commit und ruft dann `resetThreadContext()`, das `activeSkillMention` und
 * `activeRecipeId` mit abräumt. Das Rezept wäre damit weg, bevor jemand tippt —
 * eigene Rezepte überlebten bisher nur zufällig, weil der Listener bei
 * `chatViewMode === 'thread'` und einem Wechsel auf `null` vorher aussteigt.
 *
 * Deshalb wird hier nicht gesetzt, sondern nachgehalten: der Effekt hängt auch
 * am gespeicherten Paar und trägt es wieder ein, sobald es abweicht. Die
 * Gleichheitsprüfung ist die Schleifenbremse — stimmt das Paar, passiert nichts.
 */
export function useRecipeDeepLink(rezeptParam: string | null, rezeptIdParam: string | null): void {
  const storedMention = useAgentStore((s) => s.activeSkillMention);
  const storedRecipeId = useAgentStore((s) => s.activeRecipeId);

  useEffect(() => {
    if (!rezeptParam) return;
    if (storedMention === rezeptParam && storedRecipeId === rezeptIdParam) return;
    const store = useAgentStore.getState();
    store.setActiveSkillMention(rezeptParam, rezeptIdParam);
    store.setChatViewMode('thread');
  }, [rezeptParam, rezeptIdParam, storedMention, storedRecipeId]);
}
