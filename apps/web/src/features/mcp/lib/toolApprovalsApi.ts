import { type ChatToolApproval } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

export type { ChatToolApproval };

export async function fetchToolApprovals(): Promise<ChatToolApproval[]> {
  const client = getContractsClient();
  const result = await client.chatToolApprovals.list();
  if (result.status !== 200) throw new Error('Freigaben konnten nicht geladen werden');
  return result.body.approvals;
}

export async function revokeToolApproval(scopeKey: string): Promise<boolean> {
  const client = getContractsClient();
  const result = await client.chatToolApprovals.revoke({ body: { scopeKey } });
  if (result.status !== 200) {
    const body = result.body as { error?: string };
    throw new Error(body.error || 'Freigabe konnte nicht widerrufen werden');
  }
  return result.body.revoked;
}

/** `mcp:<serverId>/<tool>` → nur der Werkzeugname, für die Anzeige ohne Label. */
export function toolNameFromScopeKey(scopeKey: string): string {
  const slash = scopeKey.indexOf('/');
  return slash >= 0 ? scopeKey.slice(slash + 1) : scopeKey;
}
