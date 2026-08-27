import { useUserProfileStore } from '@gruenerator/chat/stores';
import { useAuth } from '@gruenerator/shared/hooks';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { fetchProfileDefaults } from '../services/roles';

/**
 * Füllt den Profil-Store der App — das mobile Gegenstück zu
 * `apps/web/src/hooks/useHydrateUserProfile.ts`.
 *
 * Ohne diesen Schritt blieb `isHydrated` in der App für immer false, und
 * `useUserLandesverbaende` lieferte `lvIds: null`. `null` heißt überall „noch
 * nicht bekannt" und lässt jeden Filter durch — mit der Folge, dass die App
 * ALLE Landesverbands-Grüneratoren und -Rezepte zeigte, während sie im Web an
 * die Rolle „Mitarbeiter*in Landesgeschäftsstelle" gebunden sind. Wer im Web
 * nichts sah, fand dieselben Inhalte auf dem Handy (#2931).
 *
 * Der Web-Hook selbst ist nicht portierbar (er hängt an web-eigenem `apiClient`
 * und `authStore`), die Form des Store-Updates schon — sie muss identisch
 * bleiben, sonst driften die beiden Plattformen im Kleinen wieder auseinander.
 *
 * Die Anfrage ist keine neue: `fetchRoles` ruft denselben Endpunkt bereits für
 * das Einstellungs-Sheet, bisher nur träge beim Öffnen.
 *
 * Was das hier NICHT auslöst: `activeRole` wird mitgeschrieben, aber die App
 * kennt weder `resetChatContext` noch den `ActiveRoleSyncEffect` — die beiden
 * einzigen Wege, auf denen `draftRoleState()` daraus einen Rollen-Chat machen
 * würde. Die Hydratation wirkt hier ausschließlich auf die Filter.
 */
export function useHydrateUserProfile(): void {
  const { isAuthenticated, locale } = useAuth();
  const { data, isSuccess } = useQuery({
    queryKey: ['user-profile-defaults'],
    queryFn: fetchProfileDefaults,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!isSuccess || !data) return;
    useUserProfileStore.getState().hydrate({
      roles: data.roles,
      activeRole: data.activeRole,
      hasChosenRole: data.hasChosenRole,
      locale: locale || 'de-DE',
      isHydrated: true,
    });
  }, [data, isSuccess, locale]);
}
