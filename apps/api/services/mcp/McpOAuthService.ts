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

import { isIP } from 'node:net';

import { type McpOauthStartResult } from '@gruenerator/contracts';
import {
  discoverOAuthServerInfo,
  discoverAuthorizationServerMetadata,
  registerClient,
  selectClientAuthMethod,
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

import {
  consumeOAuthState,
  generateState,
  saveOAuthState,
  type McpOAuthState,
} from './mcpOAuthState.js';
import { McpServerRegistry } from './McpServerRegistry.js';
import { UserMCPClient } from './UserMCPClient.js';

const log = createLogger('mcp-oauth');

const EXPIRY_SKEW_MS = 60_000;
const REFRESH_LOCK_MS = 10_000;
const REFRESH_POLL_MS = 200;

interface AsMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  revocation_endpoint?: string;
  revocation_endpoint_auth_methods_supported?: string[];
  client_id_metadata_document_supported?: boolean;
  authorization_response_iss_parameter_supported?: boolean;
}

const REVOKE_TIMEOUT_MS = 5_000;

/**
 * Scopes to request: what the MCP resource declares (RFC 9728 PRM), never the
 * AS catalogue — on a shared AS (Auth0, Keycloak) that is every scope of every
 * API, `phone` and `address` included. `offline_access` is added when the AS
 * offers it, since many such AS issue no refresh token without it.
 */
export function selectScopes(
  resourceScopes: string[] | undefined,
  asScopes: string[] | undefined
): string[] | undefined {
  if (!resourceScopes?.length) return undefined;
  const wantsOffline =
    asScopes?.includes('offline_access') && !resourceScopes.includes('offline_access');
  return wantsOffline ? [...resourceScopes, 'offline_access'] : resourceScopes;
}

/**
 * Token-endpoint auth method to register with — the one the SDK will then use
 * at the token endpoint (`selectClientAuthMethod`: basic before post before
 * none, basic when the AS omits the field, per RFC 8414 §2). Registering a
 * different one than the SDK sends fails at any AS that enforces it. `none` is
 * the PKCE-only public client — all Brevo accepts.
 */
export function selectTokenEndpointAuthMethod(supported: string[] | undefined): string {
  if (!supported?.length) return 'client_secret_basic';
  return (
    ['client_secret_basic', 'client_secret_post', 'none'].find((m) => supported.includes(m)) ??
    'client_secret_basic'
  );
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

/**
 * Where we publish our Client ID Metadata Document (SEP-991). An AS that
 * supports it fetches this URL to learn who we are — so it has to be publicly
 * reachable over https. Null in local dev, where no AS could fetch it; those
 * fall back to dynamic registration.
 */
function clientMetadataDocumentUrl(): string | null {
  const base = env.BASE_URL?.replace(/\/$/, '');
  if (!base) return null;
  try {
    const { protocol, hostname } = new URL(base);
    const host = hostname.replace(/^\[|\]$/g, '');
    const local = host === 'localhost' || host.endsWith('.localhost') || isIP(host) !== 0;
    if (protocol !== 'https:' || local) return null;
  } catch {
    return null;
  }
  return `${base}/api/mcp/auth/client-metadata.json`;
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

/**
 * RFC 9207 / SEP-2468 mix-up defence: the authorization response must come from
 * the AS we started the flow with. Three cases:
 *
 *  - `iss` present and mismatched   → reject (the actual attack).
 *  - `iss` absent, AS said it sends → reject (stripped in transit).
 *  - `iss` absent, AS never claimed → allow (AS predates RFC 9207).
 *
 * A single trailing slash is normalised away; issuer identifiers are otherwise
 * compared exactly, as the RFC requires.
 */
function assertIssuerMatches(st: McpOAuthState, iss?: string): void {
  // In-flight states written before these fields existed can't be validated.
  if (!st.expectedIssuer) return;
  // AS predates RFC 9207 and never claimed to send `iss`.
  if (!iss && !st.issRequired) return;

  if (!iss) {
    log.warn('MCP OAuth callback missing iss although the AS advertises it', {
      serverId: st.serverId,
    });
    throw oauthError('Die Antwort des Authorization-Servers ist unvollständig (iss fehlt).', 400);
  }

  if (normaliseIssuer(iss) !== normaliseIssuer(st.expectedIssuer)) {
    log.warn('MCP OAuth issuer mismatch — refusing to redeem the code', {
      serverId: st.serverId,
      expected: st.expectedIssuer,
      received: iss,
    });
    throw oauthError(
      'Die Antwort stammt von einem anderen Authorization-Server als erwartet.',
      400
    );
  }
}

/**
 * Issuer identifiers are compared exactly per RFC 9207 — this only forgives a
 * single trailing slash, which providers are inconsistent about. Deliberately
 * narrower than a general URL normaliser; do not widen it.
 */
function normaliseIssuer(value: string): string {
  return value.replace(/\/$/, '');
}

export class McpOAuthService {
  /** The fixed server-side redirect URI to register with providers. */
  static redirectUri(): string {
    return getRedirectUri();
  }

  /**
   * Our Client ID Metadata Document, served at its own URL — the URL is the
   * `client_id`. Public client: a document anyone can read carries no secret,
   * so PKCE alone protects the flow. Null when there is no public https origin.
   */
  static clientMetadataDocument(): Record<string, unknown> | null {
    const url = clientMetadataDocumentUrl();
    if (!url) return null;
    return {
      client_id: url,
      client_name: 'Grünerator',
      client_uri: new URL(url).origin,
      redirect_uris: [getRedirectUri()],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
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
    const stored = server.oauth_meta ?? null;

    // SEP-2352: client credentials are bound to the AS that issued them. If
    // discovery now resolves somewhere else (URL edited, provider moved), the
    // stored client_id/secret must not travel to the new AS — drop them and
    // re-register. Legacy rows without a recorded issuer are left alone.
    const issuerChanged = Boolean(
      stored?.clientId && stored.issuer && stored.issuer !== authorizationServerUrl
    );
    if (issuerChanged && stored?.scheme === 'pre_registration') {
      // Hand-entered credentials — we must not silently DCR against an AS the
      // user never configured. Reuses `dcr_rejected` so the UI shows its
      // existing manual-registration form.
      throw oauthError(
        `Der Authorization-Server dieses Eintrags hat sich geändert (${stored.issuer} → ${authorizationServerUrl}). Registriere die App dort neu mit der Redirect-URI ${redirectUri} und trage Client-ID und Client-Secret erneut ein.`,
        400,
        'dcr_rejected'
      );
    }
    if (issuerChanged) {
      log.warn('MCP OAuth issuer changed; re-registering client', {
        serverId,
        from: stored?.issuer,
        to: authorizationServerUrl,
      });
    }

    // One invariant, one expression: when the issuer moved we keep neither the
    // client_id nor the secret, so both hang off `existing`.
    const existing = issuerChanged ? null : stored;
    // A CIMD client is re-derived every time: its URL follows BASE_URL, and the
    // AS may stop reading documents. Everything else is reused as stored.
    const reusable = existing?.scheme === 'cimd' ? null : existing;
    let clientId = reusable?.clientId;
    let clientSecret =
      reusable && server.oauth_client_secret_encrypted
        ? decryptCredential(server.oauth_client_secret_encrypted)
        : undefined;
    const scopes =
      existing?.scopes && existing.scopes.length
        ? existing.scopes
        : selectScopes(info.resourceMetadata?.scopes_supported, metadata.scopes_supported);
    // A reused client keeps the scheme it was obtained under — re-authorizing a
    // DCR client must not turn it into a hand-entered one.
    let scheme: McpOidcConfig['scheme'] = clientId
      ? (reusable?.scheme ?? 'pre_registration')
      : 'dcr';
    // A client obtained in this call replaces the stored secret, including with
    // none: a public client (CIMD, or DCR with `none`) must not inherit one.
    let freshClient = false;

    // SEP-991: where the AS reads Client ID Metadata Documents, our published
    // document is the client — nothing to register, nothing stored at the
    // provider per connection. Same preference order as the SDK's own `auth()`.
    const metadataUrl = clientMetadataDocumentUrl();
    if (!clientId && metadataUrl && metadata.client_id_metadata_document_supported === true) {
      clientId = metadataUrl;
      scheme = 'cimd';
      freshClient = true;
    }

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
          // SEP-837: `application_type` must be declared, or AS's that default
          // it to `native` reject our https redirect URI. The SDK's
          // OAuthClientMetadata type is `.strip()`ed and has no such field, but
          // `registerClient` spreads this object into the POST body unparsed —
          // so the cast is on the literal only, keeping the rest type-checked.
          clientMetadata: {
            client_name: 'Grünerator',
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: selectTokenEndpointAuthMethod(
              metadata.token_endpoint_auth_methods_supported
            ),
            application_type: 'web',
            ...(scopes?.length ? { scope: scopes.join(' ') } : {}),
          } as Parameters<typeof registerClient>[1]['clientMetadata'],
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
      freshClient = true;
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
        ...(freshClient && {
          oauth_client_secret_encrypted: clientSecret ? encryptCredential(clientSecret) : null,
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
    await saveOAuthState(state, {
      userId,
      serverId,
      codeVerifier,
      authorizationServerUrl,
      expectedIssuer: metadata.issuer ?? authorizationServerUrl,
      issRequired: metadata.authorization_response_iss_parameter_supported === true,
    });

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

  /**
   * Exchange the authorization code and persist encrypted tokens.
   *
   * `iss` is the RFC 9207 authorization-response parameter; validating it is
   * what stops an AS mix-up from steering our code to the wrong token endpoint.
   */
  static async handleCallback(
    code: string,
    state: string,
    iss?: string
  ): Promise<{ serverId: string }> {
    const st = await consumeOAuthState(state);
    if (!st)
      throw Object.assign(new Error('Ungültiger oder abgelaufener OAuth-State'), {
        statusCode: 400,
      });

    // MUST run before the code is redeemed below — afterwards it has already
    // left for whichever token endpoint we were steered to.
    assertIssuerMatches(st, iss);

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
      AsMetadata | undefined;

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
   * near expiry. Returns null when the server has no token, or when the token
   * has expired and could not be refreshed — the caller then reports "neu
   * autorisieren" instead of sending a dead token that comes back as a bare 401.
   * Never throws.
   *
   * `force` refreshes regardless of the stored expiry — for a server that just
   * answered 401. Providers that send no `expires_in` are otherwise never
   * refreshed at all, since there is no expiry to compare against.
   */
  static async getValidAccessToken(
    userId: string,
    serverId: string,
    opts?: { force?: boolean }
  ): Promise<string | null> {
    const server = await getServer(userId, serverId);
    if (!server?.token_encrypted) return null;

    const expiresAt = server.token_expires_at?.getTime();
    const stored = safeDecrypt(server.token_encrypted);
    const force = opts?.force === true;
    if (!force && (!expiresAt || Date.now() < expiresAt - EXPIRY_SKEW_MS)) return stored;
    // Inside the skew window the stored token still works; past expiry — or
    // after the server rejected it — it doesn't.
    const fallback = !force && expiresAt && Date.now() < expiresAt ? stored : null;
    if (!server.refresh_token_encrypted || !server.oauth_meta?.clientId) return fallback;

    // Lock so concurrent tool calls don't double-refresh a single-use token.
    await ensureConnected();
    const lockKey = `oauth:mcp:refresh:${serverId}`;
    const acquired = await redisClient.set(lockKey, '1', { NX: true, PX: REFRESH_LOCK_MS });
    if (!acquired) return this.awaitConcurrentRefresh(userId, serverId, lockKey, stored, fallback);

    try {
      const oidc = server.oauth_meta;
      if (!oidc?.issuer || !oidc.clientId) return fallback;
      const clientSecret = server.oauth_client_secret_encrypted
        ? decryptCredential(server.oauth_client_secret_encrypted)
        : undefined;
      const metadata = (await discoverAuthorizationServerMetadata(oidc.issuer)) as
        AsMetadata | undefined;
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
      log.warn('MCP token refresh failed', {
        serverId,
        expired: fallback === null,
        error: err instanceof Error ? err.message : String(err),
      });
      return fallback;
    } finally {
      await redisClient.del(lockKey).catch(() => {});
    }
  }

  /**
   * RFC 7009: tell the provider the tokens are dead. Without it, removing a
   * connector only forgets the tokens on our side; the provider keeps them
   * valid until they expire — a refresh token often for months.
   *
   * Two phases, because the row is about to go: this reads what revocation
   * needs and returns the network part, which the caller runs only once the
   * delete succeeded — and in the background, so a slow provider never holds
   * up the removal. Null when there is nothing to revoke. The returned
   * function never throws; a provider without a revocation endpoint is skipped.
   */
  static async tokenRevocation(
    userId: string,
    serverId: string
  ): Promise<(() => Promise<void>) | null> {
    const server = await getServer(userId, serverId).catch(() => undefined);
    const oidc = server?.oauth_meta;
    if (!server || server.auth_type !== 'oauth' || !oidc?.issuer || !oidc.clientId) return null;
    const tokens = [
      { value: server.refresh_token_encrypted, hint: 'refresh_token' },
      { value: server.token_encrypted, hint: 'access_token' },
    ]
      .map((t) => ({ hint: t.hint, token: t.value ? safeDecrypt(t.value) : null }))
      .filter((t): t is { hint: string; token: string } => t.token !== null);
    if (tokens.length === 0) return null;

    const issuer = oidc.issuer;
    const clientId = oidc.clientId;
    const clientSecret = server.oauth_client_secret_encrypted
      ? safeDecrypt(server.oauth_client_secret_encrypted)
      : null;

    return async () => {
      try {
        // The issuer came from discovery on a user-supplied server: same SSRF
        // gate as every other fetch it steers.
        const issuerCheck = await validateUrlForFetch(issuer);
        if (!issuerCheck.isValid) return;
        const metadata = (await discoverAuthorizationServerMetadata(issuer)) as
          AsMetadata | undefined;
        const endpointCheck = metadata?.revocation_endpoint
          ? await validateUrlForFetch(metadata.revocation_endpoint)
          : null;
        if (!metadata || !endpointCheck?.isValid || !endpointCheck.url) return;
        const endpoint = endpointCheck.url;

        const method = selectClientAuthMethod(
          { client_id: clientId, ...(clientSecret && { client_secret: clientSecret }) },
          metadata.revocation_endpoint_auth_methods_supported ??
            metadata.token_endpoint_auth_methods_supported ??
            []
        );
        await Promise.all(
          tokens.map(async ({ token, hint }) => {
            const body = new URLSearchParams({ token, token_type_hint: hint });
            const headers: Record<string, string> = {
              'Content-Type': 'application/x-www-form-urlencoded',
            };
            if (method === 'client_secret_basic' && clientSecret) {
              // Encoded exactly as the SDK does at the token endpoint, so one
              // client authenticates the same way on both.
              headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
            } else {
              body.set('client_id', clientId);
              if (method === 'client_secret_post' && clientSecret)
                body.set('client_secret', clientSecret);
            }
            const res = await fetch(endpoint, {
              method: 'POST',
              headers,
              body,
              signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
            });
            if (!res.ok)
              log.warn('MCP token revocation refused', { serverId, hint, status: res.status });
          })
        );
      } catch (err) {
        log.warn('MCP token revocation failed', {
          serverId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };
  }

  /**
   * Another request holds the refresh lock: wait for it to finish, then take
   * the token it stored. Returning early would hand this caller the token that
   * is being replaced — expired, or just rejected with a 401.
   */
  private static async awaitConcurrentRefresh(
    userId: string,
    serverId: string,
    lockKey: string,
    stored: string | null,
    fallback: string | null
  ): Promise<string | null> {
    const deadline = Date.now() + REFRESH_LOCK_MS;
    while (Date.now() < deadline && (await redisClient.exists(lockKey))) {
      await new Promise((resolve) => setTimeout(resolve, REFRESH_POLL_MS));
    }
    const server = await getServer(userId, serverId);
    const current = server?.token_encrypted ? safeDecrypt(server.token_encrypted) : null;
    return current && current !== stored ? current : fallback;
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
