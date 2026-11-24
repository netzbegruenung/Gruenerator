import { getSlimAgent, landesverbandAgentRole, type LvHub } from '@gruenerator/shared/agents';

export interface LandesverbandHubLink {
  agentId: string;
  /** Rollenlabel des Agents im Landesverband, z. B. „Öffentlichkeitsarbeit". */
  role: string;
}

/**
 * Die Agents eines Landesverband-Hubs in Hub-Reihenfolge, nur mit dem, was die
 * Seitenleiste braucht. Liest die schlanke Registry, damit der Boot nicht den
 * vollen Katalog lädt; die Hub-Seite nimmt `landesverbandHubCards`.
 */
export function landesverbandHubLinks(hub: LvHub): LandesverbandHubLink[] {
  return hub.agentIds.flatMap((agentId) => {
    const role = landesverbandAgentRole(agentId);
    if (!role || !getSlimAgent(agentId)) return [];
    return [{ agentId, role }];
  });
}
