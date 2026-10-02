import { createLogger } from '../../utils/logger.js';

import { classifyMcpFailure } from './mcpFailure.js';
import { McpOAuthService } from './McpOAuthService.js';
import { type McpConnectionConfig, UserMCPClient } from './UserMCPClient.js';

const log = createLogger('mcp-connect');

/**
 * Connect; if an OAuth server answers 401, refresh the token once and retry.
 * The proactive refresh only fires near a known expiry, so a token the provider
 * revoked early — or one issued without `expires_in` — would otherwise stay
 * dead until the user re-authorizes by hand.
 */
export async function connectRefreshingOnce(
  userId: string,
  client: UserMCPClient,
  config: McpConnectionConfig
): Promise<UserMCPClient> {
  try {
    await client.connect();
    return client;
  } catch (err) {
    const unauthorized = classifyMcpFailure(err, config).code === 'unauthorized';
    if (config.authType !== 'oauth' || config.managed || !unauthorized) throw err;
    const token = await McpOAuthService.getValidAccessToken(userId, config.id, { force: true });
    if (!token) throw err;
    log.info('MCP server answered 401; retrying with a refreshed token', { server: config.name });
    await client.close();
    const retry = new UserMCPClient({ ...config, token });
    try {
      await retry.connect();
      return retry;
    } catch (retryErr) {
      await retry.close();
      throw retryErr;
    }
  }
}
