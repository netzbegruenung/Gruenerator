import {
  landesverbandHeadings,
  landesverbandIdsForRoles,
  landesverbandShelfLabel,
} from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { useUserProfileStore } from '../stores/userProfileStore';

export interface UserLandesverbaende {
  /**
   * Die LV-Ids dieser Person. `null` heißt „noch nicht bekannt" — dann filtert
   * niemand. `[]` heißt „geprüft, keine Landesgeschäftsstellen-Rolle" — dann
   * bleiben die LV-Agenten und -Rezepte verborgen.
   */
  lvIds: readonly string[] | null;
  /** Überschriften für den LV-Abschnitt, passend gebeugt. */
  headings: { agents: string; skills: string };
  /** Beschriftung des LV-Regals in der Agentura, z. B. „Grüne Hessen". */
  shelfLabel: string;
  /** Ob die Profilrollen schon geladen sind. */
  isHydrated: boolean;
}

/**
 * Die Landesverbände der angemeldeten Person, aus ihren Profilrollen abgeleitet.
 *
 * Der Unterschied zwischen `null` und `[]` trägt die ganze Last: der Store
 * startet mit `roles: []`, und weil die Zuteilung *ausschließend* ist, wäre
 * eine leere Liste vor der Hydratation ein Befehl zum Ausblenden. Jede
 * LV-Oberfläche würde beim Laden kurz leer stehen und sich dann füllen. Deshalb
 * liefert der Hook bis zur Hydratation `null` und erst danach die echte,
 * womöglich leere Antwort.
 *
 * Beide Plattformen hydrieren: `apps/web/src/hooks/useHydrateUserProfile.ts` und
 * seit #2931 `apps/mobile/hooks/useHydrateUserProfile.ts` (gerufen in
 * `app/_layout.tsx`). Solange eine von beiden das nicht täte, bliebe `lvIds`
 * dort `null` und ihre LV-Filter ließen alles durch — genau der Fehler, den
 * #2931 behoben hat.
 */
export function useUserLandesverbaende(): UserLandesverbaende {
  const roles = useUserProfileStore((s) => s.roles);
  const locale = useUserProfileStore((s) => s.locale);
  const isHydrated = useUserProfileStore((s) => s.isHydrated);

  const lvIds = useMemo(
    () => (isHydrated ? landesverbandIdsForRoles(roles, locale) : null),
    [roles, locale, isHydrated]
  );
  const headings = useMemo(() => landesverbandHeadings(lvIds), [lvIds]);
  const shelfLabel = useMemo(() => landesverbandShelfLabel(lvIds), [lvIds]);

  return { lvIds, headings, shelfLabel, isHydrated };
}
