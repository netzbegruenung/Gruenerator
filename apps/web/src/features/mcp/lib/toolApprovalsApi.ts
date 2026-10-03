import { type ChatToolApproval, type ChatToolDecision } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';

export type { ChatToolApproval, ChatToolDecision };

/** Schlüssel eines Werkzeugs eines selbst verbundenen Servers (approvalPolicy). */
export function mcpToolScopeKey(serverId: string, toolName: string): string {
  return `mcp:${serverId}/${toolName}`;
}

export async function fetchToolApprovals(): Promise<ChatToolApproval[]> {
  const client = getContractsClient();
  const result = await client.chatToolApprovals.list();
  if (result.status !== 200)
    throw new ApiError(result.status, 'Freigaben konnten nicht geladen werden');
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

/** `null` = zurück auf „Nachfragen" (die Zeile wird gelöscht). */
export async function setToolDecision(input: {
  scopeKey: string;
  toolLabel: string | null;
  decision: ChatToolDecision | null;
}): Promise<void> {
  const client = getContractsClient();
  const result = await client.chatToolApprovals.setDecision({ body: input });
  if (result.status !== 200) {
    const body = result.body as { error?: string };
    throw new Error(body.error || 'Einstellung konnte nicht gespeichert werden');
  }
}

/** `mcp:<serverId>/<tool>` → nur der Werkzeugname, für die Anzeige ohne Label. */
export function toolNameFromScopeKey(scopeKey: string): string {
  const slash = scopeKey.indexOf('/');
  return slash >= 0 ? scopeKey.slice(slash + 1) : scopeKey;
}
