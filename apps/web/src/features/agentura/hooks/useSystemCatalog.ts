import {
  agentsList,
  useHiddenAgentIdentifiers,
  useHiddenSkillMentions,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import {
  getVisibleSystemAgentsForLocale,
  isAdminVisibleAgent,
  isAdminVisibleSkill,
  isLvItemVisibleForRoles,
  isSkillOfferedIn,
} from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { CURRENT_INSTANCE } from '../../../config/instance';
import { isLandesverbandIdentifier } from '../lib/lookups';

import type { SharedAgentEntry } from '../../agents/api';

import { useAuthStore } from '@/stores/authStore';

/**
 * Alles, was der Grünerator selbst mitbringt: System-Agents, der Rezept-Katalog
 * und die Inhalte des eigenen Landesverbands — gefiltert nach Locale, Instanz
 * und dem, was ein Admin ausgeblendet hat.
 */
export function useSystemCatalog(sharedAgents: SharedAgentEntry[]) {
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const { lvIds, shelfLabel: lvShelfLabel, isHydrated: rolesLoaded } = useUserLandesverbaende();
  const hiddenSkillMentions = useHiddenSkillMentions();
  const hiddenAgentIdentifiers = useHiddenAgentIdentifiers();
  const hiddenAgentKey = hiddenAgentIdentifiers.join(',');

  // All skills available to this locale, minus any an admin hid from discovery
  // on this deployment and minus what this instance does not carry at all.
  const allSkills = useMemo(
    () =>
      agentsList.filter(
        (s) =>
          (s.audience === undefined || s.audience === 'all' || s.audience === userLocale) &&
          isAdminVisibleSkill(s.mention, hiddenSkillMentions) &&
          isSkillOfferedIn(s, CURRENT_INSTANCE)
      ),
    [userLocale, hiddenSkillMentions]
  );

  const systemAgents = useMemo(() => {
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    return getVisibleSystemAgentsForLocale(userLocale, CURRENT_INSTANCE).filter(
      (a) =>
        !sharedIds.has(a.identifier) && isAdminVisibleAgent(a.identifier, hiddenAgentIdentifiers)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- die Array-Identität wechselt bei jedem Abruf; `hiddenAgentKey` ist die stabile Abhängigkeit
  }, [userLocale, sharedAgents, hiddenAgentKey]);

  const generalSystemAgents = useMemo(
    () => systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );
  // Der Landesverbands-Gang ist persönlich: er zeigt die Agenten und Rezepte
  // des eigenen Landesverbands, nicht die aller elf. Die Zuordnung kommt aus
  // der Profilrolle „Mitarbeiter*in Landesgeschäftsstelle" (AT:
  // Landesorganisation). Ohne diese Rolle bleibt er leer — die Zuteilung
  // IST der Zugang. Solange die Rollen noch nicht geladen sind, ist `lvIds`
  // `null` und es wird nicht gefiltert.
  const lvSystemAgents = useMemo(
    () =>
      systemAgents.filter(
        (a) =>
          isLandesverbandIdentifier(a.identifier) && isLvItemVisibleForRoles(a.identifier, lvIds)
      ),
    [systemAgents, lvIds]
  );
  const lvSkills = useMemo(
    () =>
      allSkills.filter(
        (s) =>
          isLandesverbandIdentifier(s.identifier) && isLvItemVisibleForRoles(s.identifier, lvIds)
      ),
    [allSkills, lvIds]
  );

  // Skills grouped by category (LV skills live in the Landesverband aisle instead).
  const skillsByCategory = useMemo(() => {
    const map = new Map<string, AgentListItem[]>();
    for (const skill of allSkills) {
      if (isLandesverbandIdentifier(skill.identifier)) continue;
      const cat = skill.skillCategory ?? 'sonstiges';
      const list = map.get(cat) ?? [];
      list.push(skill);
      map.set(cat, list);
    }
    return map;
  }, [allSkills]);

  return {
    allSkills,
    systemAgents,
    generalSystemAgents,
    lvSystemAgents,
    lvSkills,
    skillsByCategory,
    rolesLoaded,
    lvShelfLabel,
  };
}
