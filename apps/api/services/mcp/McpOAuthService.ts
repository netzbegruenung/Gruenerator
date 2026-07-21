/**
 * OAuth 2.1 for user-managed MCP servers (EXPERIMENTAL).
 *
 * Uses the official `@modelcontextprotocol/sdk/client/auth.js` helpers for the
 * whole standards flow (RFC 9728 protected-resource discovery → RFC 8414 AS
 * metadata → RFC 7591 dynamic client registration → PKCE authorize → code
 * exchange → refresh). We only mediate persistence (encrypted at rest) and the
 * redirect/callback via a one-time Redis state (see mcpOAuthState).
 *
 * Blueprint: LobeChat's connector OAuth service, mapped onto our Canva-style
 * popup + Redis-state precedent. Non-sensitive OIDC config is stored plaintext
 * in `oauth_meta`; the client secret + tokens are encrypted. Token refresh is
 * lazy (on read) and guarded by a Redis lock so concurrent tool calls near
 * expiry can't race to invalidate a single-use refresh token.
 */

import { type McpOauthStartResult } from '@gruenerator/contracts';
import {
  discoverOAuthServerInfo,
  discoverAuthorizationServerMetadata,
  registerClient,
  startAuthorization,
  exchangeAuthorization,
  refreshAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { and, eq } from 'drizzle-orm';

import { env } from '../../config/env.js';
import {
  mcp_servers,
  type McpOidcConfig,
  type McpServer,
} from '../../database/schema/mcpServers.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { ensureConnected, redisClient } from '../../utils/redis/client.js';
import { decryptCredential, encryptCredential } from '../../utils/validation/encryption.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

import { consumeOAuthState, generateState, saveOAuthState } from './mcpOAuthState.js';
import { McpServerRegistry } from './McpServerRegistry.js';
import { UserMCPClient } from './UserMCPClient.js';

const log = createLogger('mcp-oauth');

const EXPIRY_SKEW_MS = 60_000;
const REFRESH_LOCK_MS = 10_000;

interface AsMetadata {
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
}

type McpOAuthErrorCode = 'dcr_rejected' | 'no_oauth_support';

function oauthError(message: string, statusCode: number, code?: McpOAuthErrorCode): Error {
  return Object.assign(new Error(message), { statusCode, ...(code && { code }) });
}

/**
 * Pull the human-readable detail out of an SDK registration/authorization error.
 * Providers with non-RFC error bodies (e.g. Typeform's `{code, description}`)
 * make the SDK throw "Invalid OAuth error response: <zod>. Raw body: {...}" —
 * parse that raw body instead of surfacing the Zod dump.
 */
function providerErrorDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const marker = 'Raw body: ';
  const idx = msg.indexOf(marker);
  if (idx !== -1) {
    try {
      const body = JSON.parse(msg.slice(idx + marker.length)) as Record<string, unknown>;
      const detail = body.error_description ?? body.description ?? body.error ?? body.code;
      if (typeof detail === 'string' && detail) return detail;
    } catch {
      // not JSON — fall through to the raw message
    }
  }
  return msg;
}

function getRedirectUri(): string {
  const base = env.BASE_URL;
  if (!base) {
    throw Object.assign(
      new Error('BASE_URL ist nicht konfiguriert (für den OAuth-Redirect nötig)'),
      {
        statusCode: 503,
      }
    );
  }
  return `${base.replace(/\/$/, '')}/api/mcp/auth/callback`;
}

async function getServer(userId: string, serverId: string): Promise<McpServer | undefined> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(mcp_servers)
    .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, serverId)))
    .limit(1);
  return rows[0];
}

export class McpOAuthService {
  /** The fixed server-side redirect URI to register with providers. */
  static redirectUri(): string {
    return getRedirectUri();
  }

  /**
   * Begin authorization: discover, register (DCR) or reuse the client, persist
   * the OIDC config, and return the provider authorize URL. The PKCE verifier is
   * parked in Redis keyed by an opaque state for the callback.
   *
   * Servers without OAuth discovery aren't necessarily broken — some (trivago)
   * simply need no auth. In that case we probe an unauthenticated connect and,
   * if it works, flip the server to authType 'none' and report
   * `no_auth_required` instead of failing.
   */
  static async startAuthorization(userId: string, serverId: string): Promise<McpOauthStartResult> {
    const server = await getServer(userId, serverId);
    if (!server) throw Object.assign(new Error('Server nicht gefunden'), { statusCode: 404 });

    // SSRF: OAuth discovery fetches server.url — re-validate (DNS rebind guard).
    const urlCheck = await validateUrlForFetch(server.url);
    if (!urlCheck.isValid) {
      throw Object.assign(new Error(`Unsichere Server-URL: ${urlCheck.error ?? 'blockiert'}`), {
        statusCode: 400,
      });
    }

    let info: Awaited<ReturnType<typeof discoverOAuthServerInfo>> | null = null;
    try {
      info = await discoverOAuthServerInfo(server.url);
    } catch (err) {
      log.info('MCP OAuth discovery failed; probing unauthenticated access', {
        serverId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const metadata = info?.authorizationServerMetadata as AsMetadata | undefined;
    if (!info || !metadata) return this.fallbackWithoutOAuth(userId, server);
    const authorizationServerUrl = info.authorizationServerUrl;

    const redirectUri = getRedirectUri();
    const existing = server.oauth_meta ?? null;
    let clientId = existing?.clientId;
    let clientSecret = server.oauth_client_secret_encrypted
      ? decryptCredential(server.oauth_client_secret_encrypted)
      : undefined;
    const scopes =
      existing?.scopes && existing.scopes.length ? existing.scopes : metadata.scopes_supported;
    let scheme: McpOidcConfig['scheme'] = clientId ? 'pre_registration' : 'dcr';

    if (!clientId) {
      if (!metadata.registration_endpoint) {
        throw oauthError(
          `Der Anbieter unterstützt keine automatische Client-Registrierung. Registriere dort eine App mit der Redirect-URI ${redirectUri} und trage Client-ID und Client-Secret ein.`,
          400,
          'dcr_rejected'
        );
      }
      let reg;
      try {
        reg = await registerClient(authorizationServerUrl, {
          metadata: metadata as never,
          clientMetadata: {
            client_name: 'Grünerator',
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_post',
            ...(scopes?.length ? { scope: scopes.join(' ') } : {}),
          },
          ...(scopes?.length ? { scope: scopes.join(' ') } : {}),
        });
      } catch (err) {
        // Typical case: the provider allowlists redirect domains (Typeform,
        // IFTTT) and rejects ours — automatic registration can never work.
        const detail = providerErrorDetail(err);
        log.warn('MCP dynamic client registration rejected', { serverId, error: detail });
        throw oauthError(
          `Der Anbieter lehnt die automatische Client-Registrierung ab (${detail}). Registriere dort eine App mit der Redirect-URI ${redirectUri} und trage Client-ID und Client-Secret ein.`,
          400,
          'dcr_rejected'
        );
      }
      clientId = reg.client_id;
      clientSecret = reg.client_secret ?? undefined;
      scheme = 'dcr';
    }

    const oidc: McpOidcConfig = {
      issuer: authorizationServerUrl,
      clientId,
      scheme,
      redirectUri,
      resource: server.url,
      ...(metadata.authorization_endpoint && {
        authorizationEndpoint: metadata.authorization_endpoint,
      }),
      ...(metadata.token_endpoint && { tokenEndpoint: metadata.token_endpoint }),
      ...(metadata.registration_endpoint && {
        registrationEndpoint: metadata.registration_endpoint,
      }),
      ...(scopes?.length ? { scopes } : {}),
    };

    const db = getDrizzleInstance();
    await db
      .update(mcp_servers)
      .set({
        oauth_meta: oidc,
        ...(clientSecret !== undefined && {
          oauth_client_secret_encrypted: encryptCredential(clientSecret),
        }),
        updated_at: new Date(),
      })
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, serverId)));

    const state = generateState();
    const { authorizationUrl, codeVerifier } = await startAuthorization(authorizationServerUrl, {
      metadata: metadata as never,
      clientInformation: {
        client_id: clientId,
        ...(clientSecret && { client_secret: clientSecret }),
      },
      redirectUrl: redirectUri,
      state,
      resource: new URL(server.url),
      ...(scopes?.length ? { scope: scopes.join(' ') } : {}),
    });
    await saveOAuthState(state, { userId, serverId, codeVerifier, authorizationServerUrl });

    return { status: 'authorize', authorizationUrl: authorizationUrl.toString() };
  }

  /**
   * No OAuth discovery on the server: probe an unauthenticated connect. If the
   * server is simply open (trivago-style), flip it to authType 'none', persist
   * the tool snapshot and report success; otherwise fail with a clear hint.
   */
  private static async fallbackWithoutOAuth(
    userId: string,
    server: McpServer
  ): Promise<McpOauthStartResult> {
    const client = new UserMCPClient({
      id: server.id,
      name: server.name,
      url: server.url,
      authType: 'none',
    });
    try {
      await client.connect();
      const tools = await client.listTools();
      const db = getDrizzleInstance();
      await db
        .update(mcp_servers)
        .set({ auth_type: 'none', updated_at: new Date() })
        .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, server.id)));
      await McpServerRegistry.saveToolsSnapshot(userId, server.id, tools);
      log.info('MCP server needs no auth; switched to none', {
        userId,
        serverId: server.id,
        toolCount: tools.length,
      });
      return { status: 'no_auth_required' };
    } catch {
      throw oauthError(
        'Der Server unterstützt kein automatisches OAuth. Falls er ein Token erfordert, hinterlege ein Bearer-Token — ohne Token ist er nicht erreichbar.',
        400,
        'no_oauth_support'
      );
    } finally {
      await client.close().catch(() => {});
    }
  }

  /** Exchange the authorization code and persist encrypted tokens. */
  static async handleCallback(code: string, state: string): Promise<{ serverId: string }> {
    const st = await consumeOAuthState(state);
    if (!st)
      throw Object.assign(new Error('Ungültiger oder abgelaufener OAuth-State'), {
        statusCode: 400,
      });

    const server = await getServer(st.userId, st.serverId);
    const oidc = server?.oauth_meta;
    if (!server || !oidc?.clientId || !oidc.redirectUri) {
      throw Object.assign(new Error('Server-/OAuth-Konfiguration fehlt'), { statusCode: 400 });
    }
    const redirectUri = oidc.redirectUri;
    const clientSecret = server.oauth_client_secret_encrypted
      ? decryptCredential(server.oauth_client_secret_encrypted)
      : undefined;

    const metadata = (await discoverAuthorizationServerMetadata(st.authorizationServerUrl)) as
      | AsMetadata
      | undefined;

    const tokens = await exchangeAuthorization(st.authorizationServerUrl, {
      metadata: metadata as never,
      clientInformation: {
        client_id: oidc.clientId,
        ...(clientSecret && { client_secret: clientSecret }),
      },
      authorizationCode: code,
      codeVerifier: st.codeVerifier,
      redirectUri,
      ...(oidc.resource ? { resource: new URL(oidc.resource) } : {}),
    });

    await this.persistTokens(st.userId, st.serverId, tokens);
    log.info('MCP OAuth connected', { userId: st.userId, serverId: st.serverId });
    return { serverId: st.serverId };
  }

  /**
   * A currently-valid access token, refreshing lazily (under a Redis lock) when
   * near expiry. Returns null when the server has no token. Never throws — on a
   * refresh failure it returns the stored token as a best-effort.
   */
  static async getValidAccessToken(userId: string, serverId: string): Promise<string | null> {
    const server = await getServer(userId, serverId);
    if (!server?.token_encrypted) return null;

    const expiresAt = server.token_expires_at?.getTime();
    const stored = safeDecrypt(server.token_encrypted);
    if (!expiresAt || Date.now() < expiresAt - EXPIRY_SKEW_MS) return stored;
    if (!server.refresh_token_encrypted || !server.oauth_meta?.clientId) return stored;

    // Lock so concurrent tool calls don't double-refresh a single-use token.
    await ensureConnected();
    const lockKey = `oauth:mcp:refresh:${serverId}`;
    const acquired = await redisClient.set(lockKey, '1', { NX: true, PX: REFRESH_LOCK_MS });
    if (!acquired) return stored; // another request is refreshing; use current

    try {
      const oidc = server.oauth_meta;
      if (!oidc?.issuer || !oidc.clientId) return stored;
      const clientSecret = server.oauth_client_secret_encrypted
        ? decryptCredential(server.oauth_client_secret_encrypted)
        : undefined;
      const metadata = (await discoverAuthorizationServerMetadata(oidc.issuer)) as
        | AsMetadata
        | undefined;
      const tokens = await refreshAuthorization(oidc.issuer, {
        metadata: metadata as never,
        clientInformation: {
          client_id: oidc.clientId,
          ...(clientSecret && { client_secret: clientSecret }),
        },
        refreshToken: decryptCredential(server.refresh_token_encrypted),
        ...(oidc.resource ? { resource: new URL(oidc.resource) } : {}),
      });
      await this.persistTokens(userId, serverId, tokens, server.refresh_token_encrypted);
      return tokens.access_token;
    } catch (err) {
      log.warn('MCP token refresh failed; using stored token', {
        serverId,
        error: err instanceof Error ? err.message : String(err),
      });
      return stored;
    } finally {
      await redisClient.del(lockKey).catch(() => {});
    }
  }

  private static async persistTokens(
    userId: string,
    serverId: string,
    tokens: {
      access_token: string;
      refresh_token?: string | undefined;
      expires_in?: number | undefined;
    },
    keepRefreshEncrypted?: string | null
  ): Promise<void> {
    const db = getDrizzleInstance();
    const refreshEncrypted = tokens.refresh_token
      ? encryptCredential(tokens.refresh_token)
      : (keepRefreshEncrypted ?? null);
    await db
      .update(mcp_servers)
      .set({
        token_encrypted: encryptCredential(tokens.access_token),
        refresh_token_encrypted: refreshEncrypted,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        updated_at: new Date(),
      })
      .where(and(eq(mcp_servers.user_id, userId), eq(mcp_servers.id, serverId)));
  }
}

function safeDecrypt(encrypted: string): string | null {
  try {
    return decryptCredential(encrypted);
  } catch {
    return null;
  }
}

export default McpOAuthService;
