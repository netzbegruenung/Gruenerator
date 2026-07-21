import {
  type McpServerSummary,
  type McpAuthType,
  type McpRegistryEntry,
  type McpOauthStartResult,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';

export type { McpServerSummary, McpAuthType, McpRegistryEntry, McpOauthStartResult };

export type McpOAuthErrorCode = 'dcr_rejected' | 'no_oauth_support';

/** oauthStart failure carrying the backend's machine-readable failure class. */
export class McpOAuthStartError extends Error {
  readonly code: McpOAuthErrorCode | null;

  constructor(message: string, code?: McpOAuthErrorCode) {
    super(message);
    this.name = 'McpOAuthStartError';
    this.code = code ?? null;
  }
}

export interface McpRegistryPage {
  recommended: McpRegistryEntry[];
  servers: McpRegistryEntry[];
  nextCursor: string | null;
}

export interface McpServerCreateInput {
  name: string;
  url: string;
  authType: McpAuthType;
  token?: string | null;
  oauthClientId?: string | null;
  oauthClientSecret?: string | null;
}

export interface McpServerTestResult {
  ok: boolean;
  toolCount: number;
  toolNames: string[];
  error: string | null;
}

export async function fetchMcpServers(): Promise<McpServerSummary[]> {
  const client = getContractsClient();
  const result = await client.mcpServers.list();
  if (result.status !== 200) throw new Error('MCP-Server konnten nicht geladen werden');
  return result.body.servers;
}

export async function createMcpServer(input: McpServerCreateInput): Promise<McpServerSummary> {
  const client = getContractsClient();
  const result = await client.mcpServers.create({ body: input });
  if (result.status !== 201) {
    const body = result.body as { error?: string };
    throw new Error(body.error || 'MCP-Server konnte nicht hinzugefügt werden');
  }
  return result.body.server;
}

export async function updateMcpServer(
  id: string,
  patch: {
    name?: string;
    url?: string;
    authType?: McpAuthType;
    token?: string | null;
    enabled?: boolean;
  }
): Promise<McpServerSummary> {
  const client = getContractsClient();
  const result = await client.mcpServers.update({ params: { id }, body: patch });
  if (result.status !== 200) {
    const body = result.body as { error?: string };
    throw new Error(body.error || 'MCP-Server konnte nicht aktualisiert werden');
  }
  return result.body.server;
}

export async function deleteMcpServer(id: string): Promise<void> {
  const client = getContractsClient();
  const result = await client.mcpServers.remove({ params: { id } });
  if (result.status !== 200) throw new Error('MCP-Server konnte nicht entfernt werden');
}

export async function startMcpOAuth(id: string): Promise<McpOauthStartResult> {
  const client = getContractsClient();
  const result = await client.mcpServers.oauthStart({ params: { id } });
  if (result.status !== 200) {
    const body = result.body as { error?: string; code?: McpOAuthErrorCode };
    throw new McpOAuthStartError(body.error || 'OAuth konnte nicht gestartet werden', body.code);
  }
  return result.body;
}

export async function testMcpServer(id: string): Promise<McpServerTestResult> {
  const client = getContractsClient();
  const result = await client.mcpServers.test({ params: { id } });
  if (result.status !== 200) throw new Error('Verbindungstest fehlgeschlagen');
  return result.body;
}

export async function fetchMcpRegistry(search?: string, cursor?: string): Promise<McpRegistryPage> {
  const client = getContractsClient();
  const result = await client.mcpServers.registry({
    query: {
      ...(search ? { search } : {}),
      ...(cursor ? { cursor } : {}),
    },
  });
  if (result.status !== 200) throw new Error('MCP-Registry konnte nicht geladen werden');
  return result.body;
}
