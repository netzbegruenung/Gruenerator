/**
 * Die Rolle, die eine Instanz selbst vergibt, einmal ins Profil schreiben.
 *
 * **Warum serverseitig und nicht im Rollen-Assistenten.** `defaultRole` und
 * `offeredRoles` waren bisher rein clientseitig, und die Vorauswahl lebte in
 * `RolesSection`. Sobald die Einrichtung den Rollen-Schritt überspringt — was
 * sie tut, wenn es nichts zu wählen gibt —, kommt diese Komponente nie mehr zum
 * Zug: die Rolle würde nie geschrieben. Hier greift es unabhängig davon, welche
 * Oberfläche gerade offen ist, und deckt Web und Mobile mit einer Stelle ab.
 *
 * **Warum beim Lesen der User-Defaults.** Es ist der Aufruf, mit dem jede
 * Oberfläche die Rollen holt — die Person sieht die Rolle also schon beim ersten
 * Lesen stehen, ohne zweiten Umlauf. Der Handler dort legt aus demselben Grund
 * bereits das Profil an, wenn es fehlt; ein Schreibvorgang auf diesem GET ist
 * die bestehende Haltung, keine neue. Und es erreicht die Bestandskonten: eine
 * Instanz, die ihre Rolle erst nachträglich festlegt, würde sonst nur Neuzugänge
 * versorgen.
 *
 * **Auf jeder anderen Instanz ist das ein `null`-Check.** `autoAssignedRole`
 * gibt nur für ein Singleton-Angebot etwas zurück (siehe
 * `shared/src/roles/instanceRoleOffer.ts`); Produktion, beta und local fallen
 * ohne DB-Zugriff durch.
 */
import { autoAssignedRole, type UserRole } from '@gruenerator/shared/roles';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import { createLogger } from '../../utils/logger.js';
import { getProfileService } from '../user/ProfileService.js';

import type { UserProfile } from '../user/types.js';

const log = createLogger('instanceRoleAssignment');

function hasRole(profile: UserProfile): boolean {
  const roles = profile.user_defaults?.profile?.roles;
  return Array.isArray(roles) && roles.length > 0;
}

/**
 * Ergänzt die Instanz-Rolle, falls die Person noch keine hat, und liefert das
 * Profil zurück — das aktualisierte, wenn geschrieben wurde, sonst das
 * übergebene.
 *
 * Ein Fehler beim Schreiben bricht den Aufrufer **nicht** ab: die Rolle ist eine
 * Bequemlichkeit, und ein Profil ohne sie ist ein gültiger Zustand, den der
 * Assistent weiterhin auflösen kann. Der nächste Aufruf versucht es erneut.
 */
export async function assignInstanceRole(profile: UserProfile): Promise<UserProfile> {
  const role: UserRole | null = autoAssignedRole(CURRENT_INSTANCE);
  if (!role || hasRole(profile)) return profile;

  try {
    const updated = await getProfileService().updateUserDefault(profile.id, 'profile', 'roles', [
      role,
    ]);
    log.info(
      `Instanz ${CURRENT_INSTANCE} vergibt „${role.rolle}" (${role.ebene}) an ${profile.id}.`
    );
    return updated;
  } catch (error) {
    log.warn(
      `Instanz-Rolle für ${profile.id} nicht schreibbar — der nächste Aufruf versucht es erneut.`,
      error
    );
    return profile;
  }
}
