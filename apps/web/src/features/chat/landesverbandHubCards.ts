import {
  getSystemAgent,
  landesverbandAgentRole,
  localizeAgent,
  type LvHub,
} from '@gruenerator/shared/agents';

export interface LandesverbandHubCard {
  agentId: string;
  /** Rollenlabel des Agents im Landesverband, z. B. „Öffentlichkeitsarbeit". */
  role: string;
  agent: ReturnType<typeof localizeAgent>;
}

/**
 * Die Agents eines Landesverband-Hubs in Hub-Reihenfolge, lokalisiert. Eine
 * Ableitung für Hub-Seite und Seitenleiste, damit beide dieselben Agents mit
 * denselben Labels zeigen.
 */
export function landesverbandHubCards(hub: LvHub, userLocale: string): LandesverbandHubCard[] {
  return hub.agentIds.flatMap((agentId) => {
    const role = landesverbandAgentRole(agentId);
    if (!role) return [];
    const agent = getSystemAgent(agentId);
    if (!agent) return [];
    return [{ agentId, role, agent: localizeAgent(agent, userLocale) }];
  });
}
