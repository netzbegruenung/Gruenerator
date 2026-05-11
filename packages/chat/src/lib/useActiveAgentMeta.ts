import { useMemo } from 'react';
import { SKILLS, getSystemAgent } from '@gruenerator/shared/agents';
import { useAgentStore } from '../stores/chatStore';

export interface ActiveAgentMeta {
  identifier: string;
  avatar: string;
  title: string;
  description: string;
  openingMessage?: string;
  openingQuestions?: readonly string[];
  welcomeQuestion?: string;
}

export function useActiveAgentMeta(): ActiveAgentMeta | null {
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);

  return useMemo(() => {
    if (!selectedAgentId) return null;
    const agent = getSystemAgent(selectedAgentId);
    if (agent) {
      // Prefer the canonical system-agent metadata when navigating via URL or
      // sidebar — avoids `SKILLS.find` returning the first variant
      // (e.g. "Pressemitteilung" instead of "Öffentlichkeitsarbeit") when
      // multiple skills share an identifier.
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
  }, [selectedAgentId]);
}
