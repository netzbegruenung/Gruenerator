'use client';

import { useEffect } from 'react';

import { useAgentStore } from '../stores/chatStore';
import { useUserProfileStore } from '../stores/userProfileStore';

/**
 * Legt die zuletzt gewählte Rolle auf einen NEUEN Chat — und bei genau einer
 * eingerichteten Rolle diese eine, solange nie etwas anderes gewählt wurde.
 *
 * Die Rolle im Composer war bis hierher reiner Sitzungszustand: sie steht in
 * den Thread-Einstellungen, und die gibt es erst, wenn der Thread existiert.
 * Wer im Entwurf eine Rolle wählte und neu lud — oder nur zur Startseite ging,
 * die `resetChatContext()` ruft — stand wieder ohne da.
 *
 * Drei Bedingungen, und jede hat einen Grund:
 *  - `currentThreadId === null`: ein offener Thread trägt seine eigene Rolle,
 *    die `loadThreadSettings` bringt. Ein Thread ohne Rolle bleibt ohne.
 *  - `selectedAgentId === null`: ein Grünerator-Agent hat seine eigene Persona
 *    und wird im Rollen-Modus gar nicht mitgeschickt (`agentId: null`). Die
 *    Rolle hier draufzulegen hätte die Agentenwahl still ausgehebelt.
 *  - `threadMode === 'chat'`: nur den unberührten Ausgangszustand belegen,
 *    nie eine gerade getroffene Wahl überschreiben.
 *
 * `roleRefSource: 'default'` markiert die Herkunft. Daran erkennt
 * `loadThreadSettings`, dass diese Rolle dem Thread nicht gehört und beim
 * Öffnen eines Threads ohne eigene Einstellungen weichen muss — ohne die
 * Markierung bliebe sie in einem alten Chat hängen, der nie eine hatte.
 */
export function ActiveRoleSyncEffect() {
  const isHydrated = useUserProfileStore((s) => s.isHydrated);
  const activeRole = useUserProfileStore((s) => s.activeRole);
  const hasChosenRole = useUserProfileStore((s) => s.hasChosenRole);
  const roles = useUserProfileStore((s) => s.roles);
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const threadMode = useAgentStore((s) => s.threadMode);

  useEffect(() => {
    if (!isHydrated) return;
    if (currentThreadId || selectedAgentId) return;
    if (threadMode !== 'chat') return;
    // Wer nie etwas gewählt hat und genau eine Rolle eingerichtet hat, meint
    // diese eine — für sie ist die Rollenwahl keine Wahl. Ab zwei Rollen wäre
    // jede Vorauswahl geraten, also bleibt es beim leeren Start. „Ohne Rolle"
    // im Composer setzt `hasChosenRole` und beendet die Vorauswahl.
    const wanted = hasChosenRole ? activeRole : roles.length === 1 ? roles[0] : null;
    if (!wanted) return;
    // Die gemerkte Rolle kann seit dem letzten Besuch gelöscht worden sein;
    // dann trägt sie auch keinen Prompt mehr und der Server fände sie nicht.
    const role = roles.find((r) => r.ebene === wanted.ebene && r.rolle === wanted.rolle);
    if (!role) return;
    useAgentStore.setState({
      threadMode: 'eigener',
      customRoleRef: { ebene: role.ebene, rolle: role.rolle },
      customRoleName: role.rolle,
      customSystemPrompt: role.systemPrompt ?? null,
      roleRefSource: 'default',
    });
  }, [isHydrated, activeRole, hasChosenRole, roles, currentThreadId, selectedAgentId, threadMode]);

  return null;
}
