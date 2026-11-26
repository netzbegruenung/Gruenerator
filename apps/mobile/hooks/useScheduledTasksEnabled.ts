import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';

/**
 * „Geplante Aufgaben“ ist experimentell und standardmäßig aus
 * (`profiles.scheduled_tasks_enabled`, geschaltet in den Web-Einstellungen).
 *
 * Gelesen aus `GET /auth/profile`, nicht aus dem Auth-Store: der lädt das Profil
 * höchstens einmal am Tag nach (`hydrateProfile`), und der Dev-Bypass-Nutzer hat
 * gar keins — der Schalter käme erst am nächsten Tag an. Wie im Web
 * (`useScheduledTasksEnabled`) im Zweifel aus.
 */
export function useScheduledTasksEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['profile', 'scheduled-tasks-enabled'],
    queryFn: async () => {
      const res = await getContractsClient().userProfile.getProfile();
      if (res.status !== 200) throw new Error('Profil konnte nicht geladen werden.');
      return res.body.user.scheduled_tasks_enabled === true;
    },
    staleTime: 15 * 60 * 1000,
  });
  return data === true;
}
