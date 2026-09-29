/**
 * RFC-9728-Metadaten des MCP-Servers, ausgeliefert an der Wurzel
 * (`/.well-known/oauth-protected-resource`, siehe `server.ts`).
 *
 * `getProtectedResourceMetadata()` ohne Angaben füllt ab better-auth 1.7 beide
 * Felder mit der nackten `baseURL` (`https://gruenerator.eu`). Beides ist dann
 * falsch, und jedes für sich bricht den Konnektor:
 *
 * - `resource` muss die URL sein, die der Client anspricht — MCP-Clients prüfen
 *   das (RFC 9728 §3.3), und die Token tragen genau diese Ressource als `aud`.
 * - `authorization_servers` muss der Issuer sein (`baseURL` + `basePath`),
 *   sonst holt der Client die Auth-Server-Metadaten unter der Wurzel und findet
 *   dort einen `issuer`, der nicht zur angefragten Adresse passt (RFC 8414 §3.3).
 *
 * `scopes_supported` bleibt bewusst weg: das `mcp()`-Plugin würde dort auch
 * `chat:completions` ausschreiben, und ein Client, der alles Angebotene
 * anfordert, liefe mit einem dynamisch registrierten Client in `invalid_scope`.
 */

import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client';

import type { BetterAuthOptions } from 'better-auth';

interface ResourceServerAuth {
  options: BetterAuthOptions;
  $context: Promise<{ baseURL: string }>;
}

export async function mcpProtectedResourceMetadata(auth: ResourceServerAuth, resource: string) {
  const { baseURL } = await auth.$context;
  return oauthProviderResourceClient(auth)
    .getActions()
    .getProtectedResourceMetadata({ resource, authorization_servers: [baseURL] });
}
