import { type RoleRef } from '@gruenerator/contracts';

import { useUserProfileStore } from './userProfileStore';

export interface DraftRoleState {
  threadMode: 'eigener';
  customRoleRef: RoleRef;
  customRoleName: string;
  customSystemPrompt: string | null;
  roleRefSource: 'default';
}

/**
 * Die Rolle, die ein FRISCHER Entwurf trägt — die eine Wahrheit für
 * `resetChatContext()` und `ActiveRoleSyncEffect`.
 *
 * Dass der Reset sie selbst anwendet (statt zu nullen und auf den Effekt zu
 * warten), ist der Kern: beim Reload mountet der lazy Runtime-Chunk den
 * Sync-Effekt und die Composer-Fläche im selben Commit. Der Effekt trug die
 * Rolle auf, der Mount-Reset der Fläche nullte sie im selben Effekt-Durchlauf —
 * und weil `threadMode` aus Sicht des nächsten Renders wieder unverändert
 * `'chat'` war, feuerte der Effekt nie erneut. Die Rolle war nach jedem Reload
 * weg, obwohl sie im Konto stand.
 *
 * Wer nie etwas gewählt hat und genau eine Rolle eingerichtet hat, meint diese
 * eine — für sie ist die Rollenwahl keine Wahl. Ab zwei Rollen wäre jede
 * Vorauswahl geraten, also bleibt es beim leeren Start. „Ohne Rolle" im
 * Composer setzt `hasChosenRole` und beendet die Vorauswahl.
 *
 * `null` heißt: der Entwurf startet ohne Rolle — auch solange die Hydration
 * noch aussteht (dann trägt der Sync-Effekt nach) oder wenn die gemerkte Rolle
 * inzwischen gelöscht wurde (dann trägt sie keinen Prompt mehr und der Server
 * fände sie nicht).
 */
export function draftRoleState(): DraftRoleState | null {
  const { isHydrated, roles, activeRole, hasChosenRole } = useUserProfileStore.getState();
  if (!isHydrated) return null;
  const wanted = hasChosenRole ? activeRole : roles.length === 1 ? roles[0] : null;
  if (!wanted) return null;
  const role = roles.find((r) => r.ebene === wanted.ebene && r.rolle === wanted.rolle);
  if (!role) return null;
  return {
    threadMode: 'eigener',
    customRoleRef: { ebene: role.ebene, rolle: role.rolle },
    customRoleName: role.rolle,
    customSystemPrompt: role.systemPrompt ?? null,
    // Herkunft mitschreiben: `loadThreadSettings` räumt diese Rolle wieder weg,
    // sobald ein Thread ohne eigene Einstellungen geöffnet wird.
    roleRefSource: 'default',
  };
}
