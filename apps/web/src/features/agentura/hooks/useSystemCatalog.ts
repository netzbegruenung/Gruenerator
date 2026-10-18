import {
  agentsList,
  useHiddenAgentIdentifiers,
  useHiddenSkillMentions,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import { isLvItemVisibleForRoles, selectOfficialCatalog } from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { CURRENT_INSTANCE } from '../../../config/instance';
import { isLandesverbandIdentifier } from '../lib/lookups';

import type { SharedAgentEntry } from '../../agents/api';

import { useAuthStore } from '@/stores/authStore';

/**
 * Alles, was der Grünerator selbst mitbringt: System-Agents, der Rezept-Katalog
 * und die Inhalte des eigenen Landesverbands — gefiltert nach Locale, Instanz
 * und dem, was ein Admin ausgeblendet hat (`selectOfficialCatalog`).
 */
export function useSystemCatalog(sharedAgents: SharedAgentEntry[]) {
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const { lvIds, shelfLabel: lvShelfLabel, isHydrated: rolesLoaded } = useUserLandesverbaende();
  const hiddenSkillMentions = useHiddenSkillMentions();
  const hiddenAgentIdentifiers = useHiddenAgentIdentifiers();
  const hiddenAgentKey = hiddenAgentIdentifiers.join(',');
  const hiddenSkillKey = hiddenSkillMentions.join(',');

  // `lvIds: null` on purpose: `systemAgents` feeds the agent index, which must
  // resolve every Landesverband agent, and `allSkills` has always carried all
  // of them too. The role filter applies to the Landesverband aisle below.
  const catalog = useMemo(
    () =>
      selectOfficialCatalog({
        locale: userLocale,
        instanceId: CURRENT_INSTANCE,
        platform: 'web',
        hiddenAgentIds: hiddenAgentIdentifiers,
        hiddenSkillMentions,
        lvIds: null,
        skills: agentsList,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- die Array-Identität wechselt bei jedem Abruf; die Schlüssel sind die stabile Abhängigkeit
    [userLocale, hiddenAgentKey, hiddenSkillKey]
  );
  const allSkills = catalog.skills;

  const systemAgents = useMemo(() => {
    const sharedIds = new Set(sharedAgents.map((e) => e.agent.identifier));
    return catalog.agents.filter((a) => !sharedIds.has(a.identifier));
  }, [catalog.agents, sharedAgents]);

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
    () => catalog.lvSkills.filter((s) => isLvItemVisibleForRoles(s.identifier, lvIds)),
    [catalog.lvSkills, lvIds]
  );

  // Skills grouped by category (LV skills live in the Landesverband aisle instead).
  const skillsByCategory = useMemo(() => {
    const map = new Map<string, AgentListItem[]>();
    for (const skill of catalog.generalSkills) {
      const cat = skill.skillCategory ?? 'sonstiges';
      const list = map.get(cat) ?? [];
      list.push(skill);
      map.set(cat, list);
    }
    return map;
  }, [catalog.generalSkills]);

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
