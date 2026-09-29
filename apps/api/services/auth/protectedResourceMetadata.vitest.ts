import { mcp } from '@better-auth/mcp';
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { jwt } from 'better-auth/plugins/jwt';
import { describe, expect, it } from 'vitest';

import { mcpProtectedResourceMetadata } from './protectedResourceMetadata.js';

const RESOURCE = 'https://mcp.gruenerator.eu';

const auth = betterAuth({
  baseURL: 'https://gruenerator.eu',
  basePath: '/api/auth/v2',
  secret: 'test-secret-that-is-long-enough-for-better-auth-0123456789',
  database: memoryAdapter({}),
  logger: { disabled: true },
  plugins: [
    jwt(),
    mcp({
      loginPage: '/login',
      consentPage: '/oauth/consent',
      resource: RESOURCE,
      scopes: ['openid', 'offline_access', 'search', 'chat:completions'],
    }) as unknown as BetterAuthPlugin,
  ],
});

describe('mcpProtectedResourceMetadata', () => {
  it('names the MCP server as the resource, not the auth origin', async () => {
    const metadata = await mcpProtectedResourceMetadata(auth, RESOURCE);
    expect(metadata.resource).toBe(RESOURCE);
  });

  it('points at an authorization server whose metadata carries the same issuer', async () => {
    const metadata = await mcpProtectedResourceMetadata(auth, RESOURCE);
    const serverMetadata = (await oauthProviderAuthServerMetadata(
      auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0]
    )(new Request('https://gruenerator.eu/.well-known/oauth-authorization-server')).then((r) =>
      r.json()
    )) as { issuer: string };

    expect(metadata.authorization_servers).toEqual([serverMetadata.issuer]);
    expect(serverMetadata.issuer).toBe('https://gruenerator.eu/api/auth/v2');
  });

  it('does not advertise scopes a registered MCP client cannot request', async () => {
    const metadata = await mcpProtectedResourceMetadata(auth, RESOURCE);
    expect(metadata).not.toHaveProperty('scopes_supported');
  });
});
