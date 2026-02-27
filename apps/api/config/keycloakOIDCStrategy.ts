import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  fetchUserInfo,
  randomState,
  skipSubjectCheck,
} from 'openid-client';

import { isAllowedDomain, buildDomainUrl, URLS } from '../utils/domainUtils.js';
import { storeOIDCState, consumeOIDCState } from '../utils/redis/OIDCStateStore.js';

import type { Request } from 'express';
import type { Strategy } from 'passport';

/** Maximum age of OIDC session data before it's considered stale (15 minutes). */
const OIDC_SESSION_MAX_AGE_MS = 900_000;

/** Window in which rapid login clicks reuse existing OIDC state instead of overwriting. */
const OIDC_DEDUP_WINDOW_MS = 30_000;

/** HTTP status codes considered transient for token exchange retry. */
const TRANSIENT_STATUS_CODES = [502, 503, 504];

/** Max total token exchange attempts (1 retry). */
const TOKEN_EXCHANGE_MAX_ATTEMPTS = 2;

/** Delay between token exchange retry attempts (ms). */
const TOKEN_EXCHANGE_RETRY_DELAY_MS = 2_000;

// openid-client v6 types (extracted from return types)
type Config = Awaited<ReturnType<typeof discovery>>;
type TokenSet = Awaited<ReturnType<typeof authorizationCodeGrant>>;
type UserInfo = Awaited<ReturnType<typeof fetchUserInfo>>;

/**
 * Passport profile format
 */
export interface PassportProfile {
  id: string;
  displayName: string;
  emails: { value: string }[];
  username: string;
  _raw: string;
  _json: any;
}

/**
 * OIDC session data stored in express-session
 */
export interface OIDCSessionData {
  state: string;
  redirectTo: string | null;
  originDomain: string | null;
  correlationId: string;
  timestamp: number;
}

/**
 * Strategy options
 */
interface KeycloakOIDCOptions {
  sessionKey: string;
}

/**
 * Passport verify callback signature
 */
type VerifyCallback = (err: Error | null, user?: any, info?: any) => void;

/**
 * Verify function type for OIDC
 */
type VerifyFunction = (
  req: Request,
  tokenSet: TokenSet,
  userinfo: UserInfo,
  profile: PassportProfile,
  done: VerifyCallback
) => Promise<void> | void;

/**
 * Augment express-session types for type-safe session access
 */
declare module 'express-session' {
  interface SessionData {
    'oidc:keycloak'?: OIDCSessionData;
    redirectTo?: string;
    originDomain?: string;
    preferredSource?: string;
  }
}

/**
 * Custom Keycloak OIDC Strategy using openid-client v6
 */
class KeycloakOIDCStrategy extends (class {} as any as typeof Strategy) {
  override name: string;
  options: KeycloakOIDCOptions;
  verify: VerifyFunction;
  config: Config | null;

  constructor(options: KeycloakOIDCOptions, verify: VerifyFunction) {
    super();
    this.name = 'oidc';
    this.options = options;
    this.verify = verify;
    this.config = null;
  }

  override async authenticate(req: Request, options: any = {}): Promise<void> {
    try {
      if (!this.config) {
        await this.initialize();
      }

      if (req.query.code) {
        return await this.handleCallback(req, options);
      }

      return await this.initiateAuthorization(req, options);
    } catch (error) {
      console.error('[KeycloakOIDC] Authentication error:', error);
      return this.error(error);
    }
  }

  async initialize(): Promise<void> {
    const issuerUrl = new URL(
      `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`
    );
    console.log('[KeycloakOIDC] Discovering issuer:', issuerUrl.href);

    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

    if (!clientId || typeof clientId !== 'string') {
      throw new Error('KEYCLOAK_CLIENT_ID environment variable is required and must be a string');
    }
    if (!clientSecret || typeof clientSecret !== 'string') {
      throw new Error(
        'KEYCLOAK_CLIENT_SECRET environment variable is required and must be a string'
      );
    }

    console.log('[KeycloakOIDC] Client ID:', clientId);
    console.log('[KeycloakOIDC] Client Secret present:', !!clientSecret);

    this.config = await discovery(issuerUrl, clientId, clientSecret);

    console.log('[KeycloakOIDC] Discovery successful');
  }

  async initiateAuthorization(req: Request, options: any): Promise<void> {
    try {
      // Dedup guard: if a recent OIDC flow is already in progress, reuse its state
      const existingOidc = req.session['oidc:keycloak'];
      if (existingOidc?.timestamp && Date.now() - existingOidc.timestamp < OIDC_DEDUP_WINDOW_MS) {
        console.log(
          `[KeycloakOIDC:${existingOidc.correlationId}] Reusing existing auth flow (${Math.round((Date.now() - existingOidc.timestamp) / 1000)}s old)`
        );
        const authUrl = this.buildAuthUrl(req, existingOidc.state, options);
        return this.redirect(authUrl);
      }

      const correlationId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`[KeycloakOIDC:${correlationId}] Auth init (session=${req.sessionID})`);

      const state = randomState();

      const storedOriginDomain = req.session.originDomain || null;
      req.session['oidc:keycloak'] = {
        state,
        redirectTo: req.session.redirectTo || null,
        originDomain: storedOriginDomain,
        correlationId,
        timestamp: Date.now(),
      };
      const originDomain = req.session.originDomain;
      const isSecure =
        process.env.NODE_ENV === 'production' ||
        req.secure ||
        req.headers['x-forwarded-proto'] === 'https';

      let redirectUri: string;
      if (originDomain && isAllowedDomain(originDomain)) {
        redirectUri = buildDomainUrl(originDomain, '/api/auth/callback', isSecure);
        console.log(
          `[KeycloakOIDC:${correlationId}] Using origin domain for redirect_uri: ${redirectUri}`
        );
      } else {
        redirectUri = URLS.callback;
        console.warn(
          `[KeycloakOIDC:${correlationId}] WARNING: originDomain missing or not allowed, using fallback redirect_uri: ${redirectUri}`,
          {
            originDomain: originDomain ?? 'undefined',
            isAllowed: originDomain ? isAllowedDomain(originDomain) : false,
            sessionID: req.sessionID,
            sessionKeys: Object.keys(req.session),
            host: req.headers.host,
            xForwardedHost: req.headers['x-forwarded-host'] ?? 'not set',
            referer: req.headers.referer ?? 'not set',
            originalUrl: req.originalUrl,
          }
        );
      }

      const authParams: any = {
        scope: 'openid profile email offline_access',
        state,
        redirect_uri: redirectUri,
        response_type: 'code',
      };

      if (options.kc_idp_hint) {
        authParams.kc_idp_hint = options.kc_idp_hint;
      }

      if (options.prompt) {
        authParams.prompt = options.prompt;
      }

      const authUrl = buildAuthorizationUrl(this.config!, authParams);

      const saveSession = (): Promise<void> => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Session save timeout after 5 seconds'));
          }, 5000);

          req.session.save((err) => {
            clearTimeout(timeout);
            if (err) {
              console.error(`[KeycloakOIDC:${correlationId}] Session save error:`, err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      };

      try {
        await saveSession();

        if (!req.session['oidc:keycloak']) {
          throw new Error('Session data verification failed - data not found after save');
        }

        // Store state in Redis as fallback for privacy browsers that block cookies
        try {
          await storeOIDCState(state, req.session['oidc:keycloak']!);
        } catch (redisErr) {
          console.warn(
            `[KeycloakOIDC:${correlationId}] Redis state store failed (cookie flow still works):`,
            redisErr
          );
        }

        this.redirect(authUrl.href);
      } catch (saveError) {
        console.error(`[KeycloakOIDC:${correlationId}] Failed to save session:`, saveError);
        return this.redirect(
          `/auth/error?message=session_save_failed&correlationId=${correlationId}`
        );
      }
    } catch (error) {
      console.error('[KeycloakOIDC] Authorization initiation error:', error);
      return this.error(error);
    }
  }

  async handleCallback(req: Request, _options: any): Promise<void> {
    const startMs = Date.now();
    const elapsed = () => Date.now() - startMs;

    try {
      const hasCookie = !!req.headers.cookie?.includes('gruenerator.sid');
      console.log(`[KeycloakOIDC:callback] START (session=${req.sessionID}, cookie=${hasCookie})`);

      let sessionData = req.session['oidc:keycloak'];

      // Fallback: if session cookie was blocked (privacy browsers), recover from Redis
      if (!sessionData) {
        const stateParam = req.query.state as string | undefined;
        if (stateParam) {
          console.warn(
            `[KeycloakOIDC:callback] Session cookie missing, attempting Redis state fallback`
          );
          try {
            const redisData = await consumeOIDCState(stateParam);
            if (redisData) {
              console.log(
                `[KeycloakOIDC:${redisData.correlationId}] Redis state fallback successful`
              );
              sessionData = redisData;
              req.session['oidc:keycloak'] = sessionData;
            }
          } catch (redisErr) {
            console.error('[KeycloakOIDC:callback] Redis state fallback failed:', redisErr);
          }
        }
      }

      const correlationId = sessionData?.correlationId || 'unknown';
      const sessionValidatedMs = elapsed();

      if (!sessionData) {
        console.error(
          `[KeycloakOIDC:${correlationId}] No session data found - possible session loss`
        );
        console.error(
          `[KeycloakOIDC:${correlationId}] Full session object: ${JSON.stringify(req.session)}`
        );
        return this.redirect(`/auth/error?message=session_not_found&retry=true`);
      }

      if (sessionData.timestamp && Date.now() - sessionData.timestamp > OIDC_SESSION_MAX_AGE_MS) {
        const ageSeconds = Math.round((Date.now() - sessionData.timestamp) / 1000);
        console.warn(
          `[KeycloakOIDC:${correlationId}] Session data is stale (${ageSeconds}s old), redirecting to login`
        );

        // Preserve redirect target and login source for seamless re-auth
        const redirectTo = sessionData.redirectTo || req.session.redirectTo || '';
        const source = req.session.preferredSource || '';

        // Clean up stale OIDC data to prevent infinite redirect loop
        delete req.session['oidc:keycloak'];

        const params = new URLSearchParams();
        if (source) params.set('source', source);
        if (redirectTo) params.set('redirectTo', redirectTo);
        const qs = params.toString();

        return this.redirect(`/auth/login${qs ? `?${qs}` : ''}`);
      }

      const protocol =
        req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = req.headers.host || 'localhost:3001';
      const currentUrl = new URL(`${protocol}://${host}${req.originalUrl}`);

      let tokenSet: TokenSet;
      try {
        tokenSet = await this.tokenExchangeWithRetry(currentUrl, sessionData.state, correlationId);
      } catch (tokenError) {
        console.error(
          `[KeycloakOIDC:${correlationId}] Token exchange failed (+${elapsed()}ms):`,
          tokenError
        );
        return this.redirect(
          `/auth/error?message=token_exchange_failed&retry=true&correlationId=${correlationId}`
        );
      }
      const tokenExchangeMs = elapsed();

      let expectedSubject: string | undefined;
      if (tokenSet.id_token) {
        try {
          const idTokenPayload = JSON.parse(
            Buffer.from(tokenSet.id_token.split('.')[1], 'base64').toString()
          );
          expectedSubject = idTokenPayload.sub;
        } catch (error) {
          console.warn(
            `[KeycloakOIDC:${correlationId}] Could not extract subject from ID token:`,
            error
          );
        }
      }

      let userinfo: UserInfo;
      try {
        userinfo = await fetchUserInfo(
          this.config!,
          tokenSet.access_token || (tokenSet as any).access,
          expectedSubject || skipSubjectCheck
        );
      } catch (userinfoError) {
        console.error(
          `[KeycloakOIDC:${correlationId}] Failed to fetch user info (+${elapsed()}ms):`,
          userinfoError
        );
        return this.redirect(
          `/auth/error?message=userinfo_fetch_failed&retry=true&correlationId=${correlationId}`
        );
      }
      const userinfoMs = elapsed();

      const profile: PassportProfile = {
        id: userinfo.sub!,
        displayName: userinfo.name || userinfo.preferred_username || '',
        emails: userinfo.email ? [{ value: userinfo.email }] : [],
        username: userinfo.preferred_username || '',
        _raw: JSON.stringify(userinfo),
        _json: userinfo,
      };

      if (sessionData.redirectTo) {
        req.session.redirectTo = sessionData.redirectTo;
      }

      this.verify(req, tokenSet, userinfo, profile, (err, user, info) => {
        if (err) {
          console.error(
            `[KeycloakOIDC:${correlationId}] verify callback error (+${elapsed()}ms):`,
            err
          );
          return this.error(err);
        }
        if (!user) {
          console.warn(`[KeycloakOIDC:${correlationId}] verify callback no user (+${elapsed()}ms)`);
          return this.fail(info);
        }

        delete req.session['oidc:keycloak'];

        console.log(
          `[KeycloakOIDC:${correlationId}] Callback complete: session +${sessionValidatedMs}ms, token +${tokenExchangeMs}ms, userinfo +${userinfoMs}ms, total +${elapsed()}ms`
        );
        return this.success(user, info);
      });
    } catch (error) {
      console.error('[KeycloakOIDC] Callback handling error:', error);
      return this.error(error);
    }
  }

  /**
   * Build the Keycloak authorization URL for a given state and options.
   */
  private buildAuthUrl(req: Request, state: string, options: any): string {
    const originDomain = req.session.originDomain;
    const isSecure =
      process.env.NODE_ENV === 'production' ||
      req.secure ||
      req.headers['x-forwarded-proto'] === 'https';

    let redirectUri: string;
    if (originDomain && isAllowedDomain(originDomain)) {
      redirectUri = buildDomainUrl(originDomain, '/api/auth/callback', isSecure);
    } else {
      redirectUri = URLS.callback;
    }

    const authParams: any = {
      scope: 'openid profile email offline_access',
      state,
      redirect_uri: redirectUri,
      response_type: 'code',
    };

    if (options.kc_idp_hint) {
      authParams.kc_idp_hint = options.kc_idp_hint;
    }
    if (options.prompt) {
      authParams.prompt = options.prompt;
    }

    return buildAuthorizationUrl(this.config!, authParams).href;
  }

  /**
   * Check if an openid-client error is a transient gateway error (502/503/504).
   */
  private isTransientTokenError(error: unknown): boolean {
    const err = error as { code?: string; cause?: { status?: number } };
    if (err.code === 'OAUTH_RESPONSE_IS_NOT_CONFORM' && err.cause?.status) {
      return TRANSIENT_STATUS_CODES.includes(err.cause.status);
    }
    return false;
  }

  /**
   * Attempt authorizationCodeGrant with a single retry on transient errors.
   */
  private async tokenExchangeWithRetry(
    currentUrl: URL,
    expectedState: string,
    correlationId: string
  ): Promise<TokenSet> {
    for (let attempt = 1; attempt <= TOKEN_EXCHANGE_MAX_ATTEMPTS; attempt++) {
      try {
        return await authorizationCodeGrant(this.config!, currentUrl, { expectedState });
      } catch (error) {
        if (attempt < TOKEN_EXCHANGE_MAX_ATTEMPTS && this.isTransientTokenError(error)) {
          const cause = (error as { cause?: { status?: number } }).cause;
          console.warn(
            `[KeycloakOIDC:${correlationId}] Token exchange attempt ${attempt} failed with ${cause?.status}, retrying in ${TOKEN_EXCHANGE_RETRY_DELAY_MS}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, TOKEN_EXCHANGE_RETRY_DELAY_MS));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Token exchange exhausted all attempts');
  }
}

/**
 * Initialize Keycloak OIDC Strategy using openid-client v6
 */
export async function initializeKeycloakOIDCStrategy(): Promise<KeycloakOIDCStrategy> {
  try {
    console.log('[KeycloakOIDC] Initializing Keycloak OIDC strategy with openid-client v6...');

    const strategy = new KeycloakOIDCStrategy(
      {
        sessionKey: 'oidc:keycloak',
      },
      async (req, tokenSet, userinfo, profile, done) => {
        const verifyStartMs = Date.now();
        const correlationId = req.session['oidc:keycloak']?.correlationId || 'unknown';
        try {
          const { handleUserProfile } = await import('./passportSetup.js');
          const user = await handleUserProfile(profile, req);
          const profileMs = Date.now() - verifyStartMs;

          const sessionData = req.session['oidc:keycloak'];
          if (sessionData?.redirectTo) {
            user._redirectTo = sessionData.redirectTo;
          }
          if (sessionData?.originDomain) {
            user._originDomain = sessionData.originDomain;
          }

          const origin = sessionData?.originDomain || 'unknown';
          console.log(
            `[KeycloakOIDC:${correlationId}] Verify complete: profile +${profileMs}ms, origin=${origin}, total +${Date.now() - verifyStartMs}ms`
          );
          return done(null, user);
        } catch (error) {
          console.error(
            `[KeycloakOIDC:${correlationId}] Error in verify callback (+${Date.now() - verifyStartMs}ms):`,
            error
          );
          return done(error as Error, null);
        }
      }
    );

    if (URLS.callback.includes('/api/api/')) {
      console.warn(
        `[KeycloakOIDC] WARNING: callback URL contains double /api/ prefix: ${URLS.callback}`
      );
    }

    console.log('[KeycloakOIDC] Pre-warming Keycloak discovery...');
    try {
      await strategy.initialize();
      console.log('[KeycloakOIDC] Strategy initialized and discovery pre-warmed successfully');
    } catch (warmupError) {
      console.warn(
        '[KeycloakOIDC] Pre-warming failed, strategy will lazy-initialize on first auth request:',
        (warmupError as Error).message
      );
    }
    return strategy;
  } catch (error) {
    console.error('[KeycloakOIDC] Failed to create strategy:', error);
    throw error;
  }
}
