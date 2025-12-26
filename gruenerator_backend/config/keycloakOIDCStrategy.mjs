import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  fetchUserInfo,
  randomState,
  skipSubjectCheck,
  ClientSecretBasic
} from 'openid-client';
import passport from 'passport';
import { isAllowedDomain, buildDomainUrl, URLS } from '../utils/domainUtils.js';

/**
 * Custom Keycloak OIDC Strategy using openid-client v6
 */
class KeycloakOIDCStrategy extends passport.Strategy {
  constructor(options, verify) {
    super();
    this.name = 'oidc';
    this.options = options;
    this.verify = verify;
    this.config = null;
  }

  async authenticate(req, options = {}) {
    try {
      // Initialize configuration if not done yet
      if (!this.config) {
        await this.initialize();
      }

      // Handle callback
      if (req.query.code) {
        return await this.handleCallback(req, options);
      }

      // Initiate authorization
      return await this.initiateAuthorization(req, options);
    } catch (error) {
      console.error('[KeycloakOIDC] Authentication error:', error);
      return this.error(error);
    }
  }

  async initialize() {
    const issuerUrl = new URL(`${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`);
    console.log('[KeycloakOIDC] Discovering issuer:', issuerUrl.href);

    // Validate environment variables
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

    if (!clientId || typeof clientId !== 'string') {
      throw new Error('KEYCLOAK_CLIENT_ID environment variable is required and must be a string');
    }
    if (!clientSecret || typeof clientSecret !== 'string') {
      throw new Error('KEYCLOAK_CLIENT_SECRET environment variable is required and must be a string');
    }

    console.log('[KeycloakOIDC] Client ID:', clientId);
    console.log('[KeycloakOIDC] Client Secret present:', !!clientSecret);

    this.config = await discovery(
      issuerUrl,
      clientId,
      clientSecret
    );

    console.log('[KeycloakOIDC] Discovery successful');
  }

  async initiateAuthorization(req, options) {
    try {
      // Generate correlation ID for tracking
      const correlationId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Generate state
      const state = randomState();

      // Store state, redirect URL, and origin domain in session
      // originDomain must be preserved through session regeneration
      const storedOriginDomain = req.session.originDomain || null;
      req.session['oidc:keycloak'] = {
        state,
        redirectTo: req.session.redirectTo || null,
        originDomain: storedOriginDomain,
        correlationId,
        timestamp: Date.now()
      };
      console.log(`[KeycloakOIDC:${correlationId}] Stored originDomain in OIDC session: ${storedOriginDomain}`);

      // Build dynamic redirect_uri based on origin domain for multi-domain support
      const originDomain = req.session.originDomain;
      const isSecure = process.env.NODE_ENV === 'production' ||
                       req.secure ||
                       req.headers['x-forwarded-proto'] === 'https';

      let redirectUri;
      if (originDomain && isAllowedDomain(originDomain)) {
        redirectUri = buildDomainUrl(originDomain, '/api/auth/callback', isSecure);
        console.log(`[KeycloakOIDC:${correlationId}] Using origin domain for redirect_uri: ${redirectUri}`);
      } else {
        redirectUri = URLS.callback;
        console.log(`[KeycloakOIDC:${correlationId}] Using fallback redirect_uri: ${redirectUri}`);
      }

      // Build authorization parameters
      const authParams = {
        scope: 'openid profile email offline_access',
        state,
        redirect_uri: redirectUri,
        response_type: 'code'
      };

      // Add Keycloak-specific parameters
      if (options.kc_idp_hint) {
        authParams.kc_idp_hint = options.kc_idp_hint;
      }

      if (options.prompt) {
        authParams.prompt = options.prompt;
      }

      // Build authorization URL
      const authUrl = buildAuthorizationUrl(this.config, authParams);

      // Promisified session save with timeout
      const saveSession = () => {
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

      // Save session with timeout and verification
      try {
        await saveSession();

        // Verify session was actually saved by checking if we can retrieve it
        if (!req.session['oidc:keycloak']) {
          throw new Error('Session data verification failed - data not found after save');
        }

        this.redirect(authUrl.href);
      } catch (saveError) {
        console.error(`[KeycloakOIDC:${correlationId}] Failed to save session:`, saveError);
        // Redirect to error page with recovery option
        return this.redirect(`/auth/error?message=session_save_failed&correlationId=${correlationId}`);
      }
    } catch (error) {
      console.error('[KeycloakOIDC] Authorization initiation error:', error);
      return this.error(error);
    }
  }

  async handleCallback(req, options) {
    try {
      // Retrieve session data
      const sessionData = req.session['oidc:keycloak'];
      const correlationId = sessionData?.correlationId || 'unknown';

      if (!sessionData) {
        console.error(`[KeycloakOIDC:${correlationId}] No session data found - possible session loss`);
        // Redirect to error page with retry option
        return this.redirect(`/auth/error?message=session_not_found&retry=true`);
      }

      // Check for stale session (older than 10 minutes)
      if (sessionData.timestamp && (Date.now() - sessionData.timestamp) > 600000) {
        console.error(`[KeycloakOIDC:${correlationId}] Session data is stale (${Math.round((Date.now() - sessionData.timestamp) / 1000)}s old)`);
        return this.redirect(`/auth/error?message=session_expired&retry=true`);
      }

      // State validation will be handled by the library

      // Build the current callback URL from the request
      const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const host = req.headers.host || 'localhost:3001';
      const currentUrl = new URL(`${protocol}://${host}${req.originalUrl}`);

      // Exchange code for tokens with expected state for validation
      let tokenSet;
      try {
        tokenSet = await authorizationCodeGrant(
          this.config,
          currentUrl,
          { expectedState: sessionData.state }
        );
      } catch (tokenError) {
        console.error(`[KeycloakOIDC:${correlationId}] Token exchange failed:`, tokenError);
        // Redirect to error page with specific error info
        return this.redirect(`/auth/error?message=token_exchange_failed&retry=true&correlationId=${correlationId}`);
      }

      // Extract the subject from ID token claims if available
      let expectedSubject;
      if (tokenSet.id_token) {
        try {
          // Parse the ID token to get claims (the library provides this via the claims() helper)
          // For openid-client v6, we need to decode the JWT to get the subject
          const idTokenPayload = JSON.parse(
            Buffer.from(tokenSet.id_token.split('.')[1], 'base64').toString()
          );
          expectedSubject = idTokenPayload.sub;
        } catch (error) {
          console.warn(`[KeycloakOIDC:${correlationId}] Could not extract subject from ID token:`, error);
        }
      }

      // Fetch user info - fetchUserInfo requires config, access token, and expectedSubject
      let userinfo;
      try {
        userinfo = await fetchUserInfo(
          this.config,
          tokenSet.access_token || tokenSet.access,
          expectedSubject || skipSubjectCheck
        );
      } catch (userinfoError) {
        console.error(`[KeycloakOIDC:${correlationId}] Failed to fetch user info:`, userinfoError);
        return this.redirect(`/auth/error?message=userinfo_fetch_failed&retry=true&correlationId=${correlationId}`);
      }

      // Convert userinfo to passport-compatible profile format
      const profile = {
        id: userinfo.sub,
        displayName: userinfo.name || userinfo.preferred_username,
        emails: userinfo.email ? [{ value: userinfo.email }] : [],
        username: userinfo.preferred_username,
        _raw: JSON.stringify(userinfo),
        _json: userinfo,
      };

      // Restore redirect URL to session for handleUserProfile
      if (sessionData.redirectTo) {
        req.session.redirectTo = sessionData.redirectTo;
      }

      // Call verify callback BEFORE cleaning up OAuth session data
      // This ensures the verify callback can access the session data
      this.verify(req, tokenSet, userinfo, profile, (err, user, info) => {
        if (err) {
          return this.error(err);
        }
        if (!user) {
          return this.fail(info);
        }

        // Clean up OAuth session data AFTER verify callback completes
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
export async function initializeKeycloakOIDCStrategy() {
  try {
    console.log('[KeycloakOIDC] Initializing Keycloak OIDC strategy with openid-client v6...');

    // Create strategy
    const strategy = new KeycloakOIDCStrategy(
      {
        sessionKey: 'oidc:keycloak'
      },
      async (req, tokenSet, userinfo, profile, done) => {
        try {
          // Import handleUserProfile dynamically to avoid circular imports
          const { handleUserProfile } = await import('./passportSetup.mjs');
          const user = await handleUserProfile(profile, req);

          // Attach redirectTo and originDomain to user object to survive session regeneration
          const sessionData = req.session['oidc:keycloak'];
          if (sessionData?.redirectTo) {
            user._redirectTo = sessionData.redirectTo;
          }
          if (sessionData?.originDomain) {
            user._originDomain = sessionData.originDomain;
            console.log(`[KeycloakOIDC] Attached _originDomain to user: ${sessionData.originDomain}`);
          }

          return done(null, user);
        } catch (error) {
          console.error('[KeycloakOIDC] Error in verify callback:', error);
          return done(error, null);
        }
      }
    );

    // Pre-warm discovery to avoid cold start delays on first login
    console.log('[KeycloakOIDC] Pre-warming Keycloak discovery...');
    await strategy.initialize();
    console.log('[KeycloakOIDC] Strategy initialized and discovery pre-warmed successfully');
    return strategy;

  } catch (error) {
    console.error('[KeycloakOIDC] Failed to initialize strategy:', error);
    throw error;
  }
}