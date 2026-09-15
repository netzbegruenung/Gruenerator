/**
 * useAdminAgentsTyped — typisierte ts-rest-Hüllen für die Agenten-Sichtbarkeit.
 *
 * Intern von useAdminAgents.ts benutzt. Wirft bei allem außer 2xx, damit
 * TanStack Query es als Fehler zeigt.
 */

import { ApiError, getContractsClient } from '@gruenerator/shared/api';

export async function fetchAdminAgents() {
  const client = getContractsClient();
  const result = await client.agentVisibility.list();
  if (result.status !== 200) {
    throw new ApiError(
      result.status,
      `Agenten konnten nicht geladen werden (HTTP ${result.status})`
    );
  }
  return result.body.data;
}

export async function fetchHiddenAgentIdentifiers(): Promise<string[]> {
  const client = getContractsClient();
  const result = await client.agentVisibility.getVisibility();
  if (result.status !== 200) {
    throw new ApiError(
      result.status,
      `Agenten-Sichtbarkeit konnte nicht geladen werden (HTTP ${result.status})`
    );
  }
  return result.body.hiddenIdentifiers;
}

export async function setAgentHidden(identifier: string, hidden: boolean): Promise<void> {
  const client = getContractsClient();
  const result = await client.agentVisibility.setHidden({
    params: { identifier },
    body: { hidden },
  });
  if (result.status !== 200) {
    throw new ApiError(
      result.status,
      `Agenten-Sichtbarkeit konnte nicht geändert werden (HTTP ${result.status})`
    );
  }
}
