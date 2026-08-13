import { landesverbandHeadings, landesverbandIdsForRoles } from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { useUserProfileStore } from '../stores/userProfileStore';

export interface UserLandesverbaende {
  /** LV-Ids dieser Person, leer = keine Zuordnung (dann wird nicht gefiltert). */
  lvIds: readonly string[];
  /** Überschriften für den LV-Abschnitt, passend gebeugt. */
  headings: { agents: string; skills: string };
  /** Ob die Profilrollen schon geladen sind. */
  isHydrated: boolean;
}

/**
 * Die Landesverbände der angemeldeten Person, aus ihren Profilrollen abgeleitet.
 *
 * Warum `isHydrated` mit herausgereicht wird: der Store startet mit `roles: []`,
 * und leer heißt für die Filterregel „nicht filtern". Ohne dieses Flag zeigt
 * jede LV-Oberfläche beim Laden erst alle Landesverbände und nimmt sie eine
 * Zehntelsekunde später wieder weg. Aufrufer halten deshalb bis zur Hydratation
 * das vorige Bild.
 *
 * Nur Web: `useHydrateUserProfile` läuft in `apps/web`. In der Mobile-App bleibt
 * `roles` leer, also filtert dort nichts — das ist der sichere Ausgang, nicht
 * ein vergessener.
 */
export function useUserLandesverbaende(): UserLandesverbaende {
  const roles = useUserProfileStore((s) => s.roles);
  const locale = useUserProfileStore((s) => s.locale);
  const isHydrated = useUserProfileStore((s) => s.isHydrated);

  const lvIds = useMemo(() => landesverbandIdsForRoles(roles, locale), [roles, locale]);
  const headings = useMemo(() => landesverbandHeadings(lvIds), [lvIds]);

  return { lvIds, headings, isHydrated };
}
