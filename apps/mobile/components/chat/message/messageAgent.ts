import type { ChatMessageMetadata, Mentionable } from '@gruenerator/chat';

/**
 * Which Grünerator wrote this answer.
 *
 * Resolved from the message's OWN metadata only. The chat adapter stamps
 * `custom.agentId` / `custom.agentMention` on every frame while an agent is
 * active, so ordinary agent chats are covered; surfaces without one (Notebook-QA,
 * eigener Chat) leave it unset and get no badge. The currently *selected* agent
 * is deliberately not a fallback — selection is ambient UI state, not provenance,
 * and using it stamps the wrong name onto notebook answers. Same rule as web's
 * `AssistantMessage`.
 *
 * Takes the catalogues as arguments rather than reading them, so the resolution
 * order can be tested without a store.
 */

export interface MessageAgent {
  identifier: string;
  title: string;
  /** Emoji — the phone renders it in a coloured disc, as the mention list does. */
  avatar: string;
  backgroundColor: string;
}

function toAgent(m: Mentionable): MessageAgent {
  return {
    identifier: m.identifier,
    title: m.title,
    avatar: m.avatar,
    backgroundColor: m.backgroundColor,
  };
}

export function resolveMessageAgent(
  metadata: Pick<ChatMessageMetadata, 'agentId' | 'agentMention'> | null | undefined,
  systemAgents: readonly Mentionable[],
  customAgents: readonly Mentionable[]
): MessageAgent | null {
  if (!metadata) return null;

  // Mention first: it is what the user typed, so it survives an agent whose
  // identifier changed underneath a persisted thread.
  const { agentMention, agentId } = metadata;
  if (agentMention) {
    const bySkillMention = systemAgents.find((a) => a.mention === agentMention);
    if (bySkillMention) return toAgent(bySkillMention);
  }
  if (!agentId) return null;

  const bySystemId = systemAgents.find((a) => a.identifier === agentId);
  if (bySystemId) return toAgent(bySystemId);

  // User recipes are not in the skills catalogue.
  const byCustomId = customAgents.find((a) => a.identifier === agentId);
  return byCustomId ? toAgent(byCustomId) : null;
}

/**
 * Whether to name the agent above the answer. The default Grünerator is the
 * house voice — labelling every one of its replies would be noise.
 */
export function shouldShowAgentBadge(
  agent: MessageAgent | null,
  defaultAgentId: string
): agent is MessageAgent {
  return agent != null && agent.identifier !== defaultAgentId;
}
