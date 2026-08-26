'use client';

import { useEffect } from 'react';

import { useAgentStore } from '../stores/chatStore';
import { draftRoleState } from '../stores/draftRole';
import { useUserProfileStore } from '../stores/userProfileStore';

/**
 * Trägt die Standardrolle nach, wenn die Hydration ERST NACH dem Reset der
 * „Neuer Chat"-Fläche eintrifft. Den Normalfall — Reset bei bereits
 * hydriertem Profil — deckt `resetChatContext()` selbst ab, synchron über
 * `draftRoleState`; dieser Effekt existiert nur für den Kaltstart, bei dem
 * die React-Query-Antwort später kommt als jeder Mount-Effekt.
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
    const draft = draftRoleState();
    if (!draft) return;
    useAgentStore.setState(draft);
  }, [isHydrated, activeRole, hasChosenRole, roles, currentThreadId, selectedAgentId, threadMode]);

  return null;
}
