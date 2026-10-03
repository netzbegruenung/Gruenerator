/**
 * „Nur dieses Gespräch": drifted MCP tools a user granted for ONE thread.
 *
 * Stored as `{ [rawToolName]: digest }` — the digest of the definition the
 * user saw on the grant card. The catalog mounts such a tool in that thread
 * only while its current digest still matches, so a server that rewrites the
 * tool again after the grant does not inherit it. The server-wide baseline
 * (`mcp_servers.tool_fingerprints`) stays untouched: other threads keep
 * asking, which is the point of a session-scoped grant.
 *
 * Redis, not Postgres: it is per-thread convenience state with a natural
 * expiry, and a lost key only means the card asks once more.
 */
import { createLogger } from '../../utils/logger.js';
import { parseJSON } from '../../utils/parseJSON.js';
import redisClient from '../../utils/redis/client.js';

const log = createLogger('mcpThreadGrants');

const TTL_SECONDS = 30 * 24 * 60 * 60;
const key = (threadId: string, serverId: string) => `mcp_thread_grant:${threadId}:${serverId}`;

export async function getThreadGrant(
  threadId: string,
  serverId: string
): Promise<Record<string, string>> {
  try {
    const raw = await redisClient.get(key(threadId, serverId));
    if (!raw) return {};
    const parsed = parseJSON<Record<string, string>>(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    // Fail closed: without the grant the tool is withheld and the card asks.
    log.warn(`Thread grant unreadable: ${err instanceof Error ? err.message : err}`);
    return {};
  }
}

export async function addThreadGrant(
  threadId: string,
  serverId: string,
  fingerprints: Record<string, string>
): Promise<void> {
  const merged = { ...(await getThreadGrant(threadId, serverId)), ...fingerprints };
  await redisClient.setEx(key(threadId, serverId), TTL_SECONDS, JSON.stringify(merged));
}
