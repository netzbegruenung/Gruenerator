import {
  agentsList,
  useHiddenSkillMentions,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import {
  getSystemAgent,
  getVisibleSystemAgentsForLocale,
  isAdminVisibleSkill,
  isAgentVisibleForPlatform,
  isLandesverbandIdentifier,
  isLvItemVisibleForRoles,
  isSkillOfferedIn,
} from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { useMemo } from 'react';

import { CURRENT_INSTANCE } from '../../config/instance';

/**
 * Was der Grünerator mitbringt: System-Agents und Katalog-Rezepte, so gefiltert,
 * wie die App sie zeigen kann — Locale, Instanz, Admin-Sperren, Plattform und
 * die Landesverbands-Zuteilung.
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
  const hiddenSkillMentions = useHiddenSkillMentions();

  const systemAgents = useMemo(
    () =>
      getVisibleSystemAgentsForLocale(locale, CURRENT_INSTANCE).filter(
        (a) =>
          isAgentVisibleForPlatform(a, 'mobile') && isLvItemVisibleForRoles(a.identifier, lvIds)
      ),
    [locale, lvIds]
  );
  const generalSystemAgents = useMemo(
    () => systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );
  const lvSystemAgents = useMemo(
    () => systemAgents.filter((a) => isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );

  // Recipes whose owning agent is hidden on mobile would open a chat with an
  // agent this app cannot render, so they are filtered the same way the agents
  // are — plus admin-hidden and not-offered-on-this-instance, as on web.
  const skills = useMemo(
    () =>
      agentsList.filter((s) => {
        if (s.audience !== undefined && s.audience !== 'all' && s.audience !== locale) return false;
        if (!isAdminVisibleSkill(s.mention, hiddenSkillMentions)) return false;
        if (!isSkillOfferedIn(s, CURRENT_INSTANCE)) return false;
        if (!isLvItemVisibleForRoles(s.identifier, lvIds)) return false;
        const owner = getSystemAgent(s.identifier);
        return !owner || isAgentVisibleForPlatform(owner, 'mobile');
      }),
    [locale, hiddenSkillMentions, lvIds]
  );
  const lvSkills = useMemo(
    () => skills.filter((s) => isLandesverbandIdentifier(s.identifier)),
    [skills]
  );
  const skillsByCategory = useMemo(() => {
    const map = new Map<string, AgentListItem[]>();
    for (const skill of skills) {
      if (isLandesverbandIdentifier(skill.identifier)) continue;
      const cat = skill.skillCategory ?? 'sonstiges';
      map.set(cat, [...(map.get(cat) ?? []), skill]);
    }
    return map;
  }, [skills]);

  return {
    systemAgents,
    generalSystemAgents,
    lvSystemAgents,
    skills,
    lvSkills,
    skillsByCategory,
    rolesLoaded,
    lvShelfLabel,
  };
}
