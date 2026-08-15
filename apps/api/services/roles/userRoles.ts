/**
 * Die gespeicherten Rollen einer Person — aus der Profiltabelle, nicht aus der
 * Sitzung.
 *
 * **Warum eine eigene Abfrage statt `req.user`:** `req.user` ist das
 * Better-Auth-Sitzungsobjekt (`authMiddleware.toBetterAuthUser`), und Better
 * Auth liefert nur die Spalten, die in `config/betterAuth.ts` unter
 * `user.additionalFields` stehen. `user_defaults` steht dort nicht — die Spalte
 * wird nie selektiert. `userProfileSchema` gibt dem Feld ein `.default({})`,
 * also ist `user.user_defaults` zur Laufzeit **immer** `{}` und typprüft
 * trotzdem sauber. Wer die Rollen von dort liest, bekommt stumm keine.
 *
 * Genau das ist passiert: der Rollen-Chat schickte seine `roleRef`, der Server
 * fand in der leeren Liste nichts und ließ den Turn mit dem Basis-Agenten
 * laufen — mitsamt dem NUTZERKONTEXT-Block, der dem Modell verbietet, eine
 * Rolle anzunehmen. Die UI zeigte die Rolle die ganze Zeit an, weil sie sie
 * über `/auth/profile/user-defaults` direkt aus der DB liest.
 *
 * Die Alternative — `user_defaults` in die `additionalFields` aufnehmen —
 * hängt die ganze Blob an jede Sitzungsprüfung und an den Cookie-Cache (5 min
 * stale), wo eine frisch angelegte Rolle minutenlang unsichtbar bliebe.
 */
import { type UserRole } from '@gruenerator/shared/roles';

import { createLogger } from '../../utils/logger.js';
import { getProfileService } from '../user/ProfileService.js';

const log = createLogger('userRoles');

/**
 * Die Rollenliste, oder eine leere Liste, wenn keine hinterlegt ist.
 *
 * Ein Fehler beim Lesen ist kein Grund, den Turn abzubrechen: ohne Rollen läuft
 * er mit dem Basis-Agenten weiter, genau wie bei einer Person ohne Rollen.
 */
export async function loadUserRoles(userId: string): Promise<UserRole[]> {
  try {
    const profile = await getProfileService().getProfileById(userId);
    const roles = profile?.user_defaults?.profile?.roles;
    return Array.isArray(roles) ? (roles as UserRole[]) : [];
  } catch (error) {
    log.warn(`Rollen für ${userId} nicht lesbar — der Turn läuft ohne Rollenzuschnitt.`, error);
    return [];
  }
}
