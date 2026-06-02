import { useMemo } from 'react';
import { SKILLS, getSystemAgent, localizeAgent, type SkillIcon } from '@gruenerator/shared/agents';
import { agentsList } from './agents';
import { resolveAgentIcon } from './agentIcons';
import { phosphorAgentIcon } from './phosphorAgentIcon';
import { useScopedAgentId } from './useScopedAgentState';
import { useUserAgentsRegistry } from '../stores/userAgentsRegistry';

export interface ActiveAgentMeta {
  identifier: string;
  avatar: string;
  icon?: SkillIcon;
  title: string;
  description: string;
  openingMessage?: string;
  openingQuestions?: readonly string[];
  welcomeQuestion?: string;
}

/**
 * Returns the currently-selected agent's metadata, localized for the
 * caller-supplied user locale. `userLocale` defaults to 'de-DE' for
 * backward compatibility with call sites that haven't been updated yet.
 * AT users with locale plumbed through get the agent's `localized['de-AT']`
 * overrides applied and `{{partyName}}` substituted to the AT brand.
 */
export function useActiveAgentMeta(userLocale: string = 'de-DE'): ActiveAgentMeta | null {
  const selectedAgentId = useScopedAgentId();
  const userAgents = useUserAgentsRegistry((s) => s.userAgents);

  return useMemo(() => {
    if (!selectedAgentId) return null;
    // The resolved icon component lives on the skills catalog; system agents
    // and skills that share an identifier reuse the same branding.
    const skillIcon = agentsList.find((a) => a.identifier === selectedAgentId)?.icon;
    const rawAgent = getSystemAgent(selectedAgentId);
    if (rawAgent) {
      // Prefer the canonical system-agent metadata when navigating via URL or
      // sidebar — avoids `SKILLS.find` returning the first variant
      // (e.g. "Pressemitteilung" instead of "Öffentlichkeitsarbeit") when
      // multiple skills share an identifier.
      const agent = localizeAgent(rawAgent, userLocale);
      // System agents that aren't in the skills catalog (e.g. `gruenerator-suche`)
      // still carry their own `iconKey` — resolve it here so WelcomeScreen
      // doesn't silently fall back to the emoji avatar.
      const icon: SkillIcon | undefined =
        skillIcon ?? resolveAgentIcon(selectedAgentId, agent.iconKey);
      return {
        identifier: selectedAgentId,
        avatar: agent.avatar,
        ...(icon ? { icon } : {}),
        title: agent.title,
        description: agent.description,
        openingMessage: agent.openingMessage,
        openingQuestions: agent.openingQuestions,
        ...(agent.welcomeQuestion ? { welcomeQuestion: agent.welcomeQuestion } : {}),
      };
    }
    // User agents: resolved from the host-populated registry. Their `iconKey`
    // is a full Phosphor component name, so it goes through the dynamic resolver
    // (the curated slug registry can't map it).
    const userAgent = userAgents.find((a) => a.identifier === selectedAgentId);
    if (userAgent) {
      return {
        identifier: selectedAgentId,
        avatar: userAgent.avatar,
        ...(userAgent.iconKey ? { icon: phosphorAgentIcon(userAgent.iconKey) } : {}),
        title: userAgent.title,
        description: userAgent.description,
        openingMessage: userAgent.openingMessage,
        openingQuestions: userAgent.openingQuestions,
        ...(userAgent.welcomeQuestion ? { welcomeQuestion: userAgent.welcomeQuestion } : {}),
      };
    }

    const skill = SKILLS.find((s) => s.identifier === selectedAgentId);
    if (!skill) return null;
    return {
      identifier: selectedAgentId,
      avatar: skill.avatar,
      ...(skillIcon ? { icon: skillIcon } : {}),
      title: skill.title,
      description: skill.description,
    };
  }, [selectedAgentId, userLocale, userAgents]);
}
