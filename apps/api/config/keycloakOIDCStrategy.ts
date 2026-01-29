import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  fetchUserInfo,
  randomState,
  skipSubjectCheck,
} from 'openid-client';

import { isAllowedDomain, buildDomainUrl, URLS } from '../utils/domainUtils.js';

import type { Request } from 'express';
import type { Strategy } from 'passport';

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
interface OIDCSessionData {
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
      const correlationId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Debug: Log session info at initiation
      console.log(`[KeycloakOIDC:${correlationId}] Session ID at init: ${req.sessionID}`);
      console.log(`[KeycloakOIDC:${correlationId}] Cookie header at init: ${!!req.headers.cookie}`);

      const state = randomState();

      const storedOriginDomain = req.session.originDomain || null;
      req.session['oidc:keycloak'] = {
        state,
        redirectTo: req.session.redirectTo || null,
        originDomain: storedOriginDomain,
        correlationId,
        timestamp: Date.now(),
      };
      console.log(
        `[KeycloakOIDC:${correlationId}] Stored originDomain in OIDC session: ${storedOriginDomain}`
      );

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
    try {
      // Debug: Log incoming request details
      const cookieHeader = req.headers.cookie;
      const sessionId = req.sessionID;
      console.log(`[KeycloakOIDC:callback] Cookie header present: ${!!cookieHeader}`);
      console.log(`[KeycloakOIDC:callback] Session ID: ${sessionId}`);
      console.log(`[KeycloakOIDC:callback] Session exists: ${!!req.session}`);
      console.log(
        `[KeycloakOIDC:callback] Session keys: ${req.session ? Object.keys(req.session).join(', ') : 'none'}`
      );
      if (cookieHeader) {
        // Check if our session cookie is in the header
        const hasOurCookie = cookieHeader.includes('gruenerator.sid');
        console.log(`[KeycloakOIDC:callback] gruenerator.sid cookie present: ${hasOurCookie}`);
      }

      const sessionData = req.session['oidc:keycloak'];
      const correlationId = sessionData?.correlationId || 'unknown';

      if (!sessionData) {
        console.error(
          `[KeycloakOIDC:${correlationId}] No session data found - possible session loss`
        );
        console.error(
          `[KeycloakOIDC:${correlationId}] Full session object: ${JSON.stringify(req.session)}`
        );
        return this.redirect(`/auth/error?message=session_not_found&retry=true`);
      }

      if (sessionData.timestamp && Date.now() - sessionData.timestamp > 600000) {
        console.error(
          `[KeycloakOIDC:${correlationId}] Session data is stale (${Math.round((Date.now() - sessionData.timestamp) / 1000)}s old)`
        );
        return this.redirect(`/auth/error?message=session_expired&retry=true`);
      }

      const protocol =
        req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = req.headers.host || 'localhost:3001';
      const currentUrl = new URL(`${protocol}://${host}${req.originalUrl}`);

      let tokenSet: TokenSet;
      try {
        tokenSet = await authorizationCodeGrant(this.config!, currentUrl, {
          expectedState: sessionData.state,
        });
      } catch (tokenError) {
        console.error(`[KeycloakOIDC:${correlationId}] Token exchange failed:`, tokenError);
        return this.redirect(
          `/auth/error?message=token_exchange_failed&retry=true&correlationId=${correlationId}`
        );
      }

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
        console.error(`[KeycloakOIDC:${correlationId}] Failed to fetch user info:`, userinfoError);
        return this.redirect(
          `/auth/error?message=userinfo_fetch_failed&retry=true&correlationId=${correlationId}`
        );
      }

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
          return this.error(err);
        }
        if (!user) {
          return this.fail(info);
        }

        delete req.session['oidc:keycloak'];

        return this.success(user, info);
      });
    } catch (error) {
      console.error('[KeycloakOIDC] Callback handling error:', error);
      return this.error(error);
    }
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
        try {
          const { handleUserProfile } = await import('./passportSetup.js');
          const user = await handleUserProfile(profile, req);

          const sessionData = req.session['oidc:keycloak'];
          if (sessionData?.redirectTo) {
            user._redirectTo = sessionData.redirectTo;
          }
          if (sessionData?.originDomain) {
            user._originDomain = sessionData.originDomain;
            console.log(
              `[KeycloakOIDC] Attached _originDomain to user: ${sessionData.originDomain}`
            );
          }

          return done(null, user);
        } catch (error) {
          console.error('[KeycloakOIDC] Error in verify callback:', error);
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
    await strategy.initialize();
    console.log('[KeycloakOIDC] Strategy initialized and discovery pre-warmed successfully');
    return strategy;
  } catch (error) {
    console.error('[KeycloakOIDC] Failed to initialize strategy:', error);
    throw error;
  }
}
