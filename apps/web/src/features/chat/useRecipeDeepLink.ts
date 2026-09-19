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
 * Deshalb wird hier nicht gesetzt, sondern nachgehalten: der Effekt hängt am
 * gespeicherten Wert und trägt das Rezept wieder ein, sobald der Store LEER
 * ist. Nur leer — steht dort eine andere Erwähnung, hat die Person sie selbst
 * gewählt (ein anderes Rezept im Composer), und die gehört ihr, nicht dem
 * Deeplink.
 *
 * Die eine Unschärfe, die bleibt: entfernt jemand die Erwähnung vor dem
 * Absenden von Hand (`removePillMention` setzt ebenfalls `null`), ist das von
 * einem `resetThreadContext()` hier nicht zu unterscheiden — der Store trägt
 * keine Herkunft, und einen „schon gesendet"-Zeitpunkt sieht dieser Hook nicht.
 * Der Deeplink trägt sich dann erneut ein. Bewusst so entschieden: der Weg
 * heraus ist derselbe Klick noch einmal, nachdem der Parameter aus der URL
 * gefallen ist — während der umgekehrte Fehler (Systemrezept verliert beim
 * Öffnen still seinen Stil) niemandem auffällt.
 */
export function useRecipeDeepLink(rezeptParam: string | null, rezeptIdParam: string | null): void {
  const storedMention = useAgentStore((s) => s.activeSkillMention);

  useEffect(() => {
    if (!rezeptParam) return;
    if (storedMention !== null) return;
    const store = useAgentStore.getState();
    store.setActiveSkillMention(rezeptParam, rezeptIdParam);
    store.setChatViewMode('thread');
  }, [rezeptParam, rezeptIdParam, storedMention]);
}
