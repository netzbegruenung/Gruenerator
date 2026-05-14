import { useMemo } from 'react';
import { SKILLS, getSystemAgent, localizeAgent } from '@gruenerator/shared/agents';
import { useScopedAgentId } from './useScopedAgentState';

export interface ActiveAgentMeta {
  identifier: string;
  avatar: string;
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

  return useMemo(() => {
    if (!selectedAgentId) return null;
    const rawAgent = getSystemAgent(selectedAgentId);
    if (rawAgent) {
      // Prefer the canonical system-agent metadata when navigating via URL or
      // sidebar — avoids `SKILLS.find` returning the first variant
      // (e.g. "Pressemitteilung" instead of "Öffentlichkeitsarbeit") when
      // multiple skills share an identifier.
      const agent = localizeAgent(rawAgent, userLocale);
      return {
        identifier: selectedAgentId,
        avatar: agent.avatar,
        title: agent.title,
        description: agent.description,
        openingMessage: agent.openingMessage,
        openingQuestions: agent.openingQuestions,
        ...(agent.welcomeQuestion ? { welcomeQuestion: agent.welcomeQuestion } : {}),
      };
    }
    const skill = SKILLS.find((s) => s.identifier === selectedAgentId);
    if (!skill) return null;
    return {
      identifier: selectedAgentId,
      avatar: skill.avatar,
      title: skill.title,
      description: skill.description,
    };
  }, [selectedAgentId, userLocale]);
}
