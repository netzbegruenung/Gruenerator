import {
  agentsList,
  useHiddenAgentIdentifiers,
  useHiddenSkillMentions,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import { selectOfficialCatalog } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { useMemo } from 'react';

import { CURRENT_INSTANCE } from '../../config/instance';

/**
 * Was der Grünerator mitbringt: System-Agents und Katalog-Rezepte, so gefiltert,
 * wie die App sie zeigen kann — Locale, Instanz, Admin-Sperren, Plattform und
 * die Landesverbands-Zuteilung (`selectOfficialCatalog`, dieselbe Funktion wie
 * im Web und auf dem Server).
 *
 * Die Zuteilung greift an der QUELLE: LV-Agents und -Rezepte gehören den Leuten
 * des jeweiligen Verbands, gebunden an die Rolle „Mitarbeiter*in
 * Landesgeschäftsstelle". Übersicht, Shop und Suche erben das damit von selbst;
 * ein Filter nur auf einem Gang ließe die Suche finden, was die Liste verbirgt.
 * `lvIds === null` heißt „Rollen noch nicht geladen" und lässt durch — deshalb
 * zeigen die Aufrufer LV-Inhalte erst mit `rolesLoaded`.
 */
export function useAgenturaCatalog() {
  const { locale } = useAuth();
  const { lvIds, shelfLabel: lvShelfLabel, isHydrated: rolesLoaded } = useUserLandesverbaende();
  // The array identity changes on every fetch; the joined key is stable, so the
  // lists are rebuilt from it.
  const hiddenSkillKey = useHiddenSkillMentions().join(',');
  const hiddenAgentKey = useHiddenAgentIdentifiers().join(',');
  const hiddenSkillMentions = useMemo(
    () => (hiddenSkillKey ? hiddenSkillKey.split(',') : []),
    [hiddenSkillKey]
  );
  const hiddenAgentIdentifiers = useMemo(
    () => (hiddenAgentKey ? hiddenAgentKey.split(',') : []),
    [hiddenAgentKey]
  );

  // Recipes whose owning agent is hidden on mobile would open a chat with an
  // agent this app cannot render; `platform: 'mobile'` drops them with it.
  const catalog = useMemo(
    () =>
      selectOfficialCatalog({
        locale,
        instanceId: CURRENT_INSTANCE,
        platform: 'mobile',
        hiddenAgentIds: hiddenAgentIdentifiers,
        hiddenSkillMentions,
        lvIds,
        skills: agentsList,
      }),
    [locale, lvIds, hiddenAgentIdentifiers, hiddenSkillMentions]
  );

  const skillsByCategory = useMemo(() => {
    const map = new Map<string, AgentListItem[]>();
    for (const skill of catalog.generalSkills) {
      const cat = skill.skillCategory ?? 'sonstiges';
      map.set(cat, [...(map.get(cat) ?? []), skill]);
    }
    return map;
  }, [catalog.generalSkills]);

  return {
    systemAgents: catalog.agents,
    generalSystemAgents: catalog.generalAgents,
    lvSystemAgents: catalog.lvAgents,
    skills: catalog.skills,
    lvSkills: catalog.lvSkills,
    skillsByCategory,
    rolesLoaded,
    lvShelfLabel,
  };
}
