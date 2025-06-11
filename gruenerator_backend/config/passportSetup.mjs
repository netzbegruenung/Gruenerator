import passport from 'passport';
import { Issuer, Strategy as OidcClientStrategy } from 'openid-client';
import { Strategy as SamlStrategy } from '@node-saml/passport-saml';

// Import Supabase clients using CommonJS require
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { supabaseAnon, supabaseService } = require('../utils/supabaseClient.js');

// Helper function to extract authentication source from Authentik profile
function extractAuthSource(profile) {
  if (profile.source) return profile.source;
  if (profile.groups && Array.isArray(profile.groups)) {
    if (profile.groups.includes('netzbegruenung-users')) return 'netzbegruenung-login';
    if (profile.groups.includes('gruenes-netz-users')) return 'gruenes-netz-login';
  }
  const email = profile.email;
  if (email) {
    if (email.includes('@netzbegruenung.') || email.includes('@gruene-')) return 'netzbegruenung-login';
  }
  return 'gruenerator-login';
}

// Configure OIDC client
const authentikIssuer = await Issuer.discover('https://auth.services.moritz-waechter.de/application/o/gruenerator/');

const client = new authentikIssuer.Client({
  client_id: process.env.AUTHENTIK_CLIENT_ID,
  client_secret: process.env.AUTHENTIK_CLIENT_SECRET,
  redirect_uris: [`${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/callback`],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_post' // Or 'client_secret_basic', check Authentik config
});
console.log('[PassportSetup] Authentik OIDC client created:', client ? 'Client object exists' : 'Client object IS NULL OR UNDEFINED', client);

// Passport OIDC Strategy Configuration using openid-client
passport.use('oidc', new OidcClientStrategy({
  client,
  params: {
    scope: 'openid profile email offline_access',
  },
  passReqToCallback: true,
  usePKCE: false,
  sessionKey: 'passport:oidc:authentik'
}, async (req, tokenset, userinfo, done) => {
  console.log('[PassportSetup OIDC Verify Callback] Reached verify callback.');
  console.log('[PassportSetup OIDC Verify Callback] req.session:', JSON.stringify(req.session, null, 2));
  console.log('[PassportSetup OIDC Verify Callback] Tokenset:', JSON.stringify(tokenset, null, 2));
  console.log('[PassportSetup OIDC Verify Callback] Userinfo:', JSON.stringify(userinfo, null, 2));
  try {
    if (!tokenset || !userinfo) {
      console.error('[PassportSetup OIDC Verify Callback] Tokenset or userinfo is undefined');
      return done(new Error('Tokenset or userinfo is undefined'), null);
    }

    const claims = tokenset.claims();

    // Construct a profile object similar to what the old strategy provided
    // This needs careful mapping based on what handleUserProfile expects
    // and what Authentik provides in claims and userinfo.
    const profile = {
      id: userinfo.sub || claims.sub, // Subject identifier
      displayName: userinfo.name || claims.name || userinfo.preferred_username || claims.preferred_username,
      emails: userinfo.email ? [{ value: userinfo.email }] : (claims.email ? [{ value: claims.email }] : []),
      username: userinfo.preferred_username || claims.preferred_username,
      // Add other fields from userinfo or claims that handleUserProfile might need
      // For example, groups if Authentik puts them in userinfo or id_token claims
      groups: userinfo.groups || claims.groups,
      // Raw userinfo and claims can be useful for debugging or more complex mapping
      _raw_userinfo: userinfo,
      _raw_claims: claims
    };
    
    // If your handleUserProfile relied on specific fields like `profile.id` being the Authentik user ID directly,
    // ensure `userinfo.sub` or `claims.sub` is that value.
    // It seems your `handleUserProfile` expects `profile.id` to be the Authentik specific ID if present,
    // and `profile.emails` to be an array of objects with a `value` property.

    const user = await handleUserProfile(profile);

    if (user && tokenset.id_token) {
      user.id_token = tokenset.id_token;
      console.log('[Passport OIDC - openid-client] Attached id_token to user object.');
    }

    return done(null, user);
  } catch (error) {
    console.error('[PassportSetup OIDC Verify Callback] Error in strategy callback:', error);
    return done(error, null);
  }
}));

// Conditional SAML Strategy Configuration for Netzbegrünung
// Only configure SAML strategy if properly configured or in development mode
const configureSamlStrategy = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const hasCustomCert = !!process.env.NETZBEGRUENUNG_SAML_CERT;
  const samlEnabled = process.env.SAML_ENABLED !== 'false';
  
  // For development, disable cert validation entirely using wantAssertionsSigned: false
  const developmentCert = null; // No cert required in development mode

  console.log(`[SAML Config] Development: ${isDevelopment}, Custom Cert: ${hasCustomCert}, SAML Enabled: ${samlEnabled}`);

  if (!samlEnabled) {
    console.log('[SAML Config] SAML strategy disabled via SAML_ENABLED=false');
    return;
  }

  let samlCert;
  let allowUnsignedAssertions = false;

  if (hasCustomCert) {
    // Production configuration with real certificate
    samlCert = process.env.NETZBEGRUENUNG_SAML_CERT;
    console.log('[SAML Config] Using production SAML certificate');
  } else if (isDevelopment) {
    // Development configuration with no certificate and relaxed security
    samlCert = null;
    allowUnsignedAssertions = true;
    console.log('[SAML Config] ⚠️  Using development mode without certificate validation (NOT FOR PRODUCTION!)');
  } else {
    // Production without certificate - don't configure SAML
    console.log('[SAML Config] ❌ SAML strategy not configured: Missing NETZBEGRUENUNG_SAML_CERT in production');
    return;
  }

  try {
    // Build SAML strategy configuration
    const samlConfig = {
      callbackUrl: `${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/saml/callback`,
      entryPoint: process.env.NETZBEGRUENUNG_SAML_SSO_URL || 'https://user.netzbegruenung.de/realms/netzbegruenung/protocol/saml',
      issuer: process.env.NETZBEGRUENUNG_SAML_ISSUER || 'https://user.netzbegruenung.de/realms/netzbegruenung',
      acceptedClockSkewMs: 5000,
      identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      validateInResponseTo: 'never',
      disableRequestedAuthnContext: true,
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      passReqToCallback: true,
      // Security settings based on environment
      wantAssertionsSigned: !allowUnsignedAssertions,
      wantAuthnResponseSigned: !allowUnsignedAssertions
    };
    
    // Only add cert if it's available
    if (samlCert) {
      samlConfig.cert = samlCert;
      samlConfig.idpCert = samlCert; // Some versions expect idpCert instead of cert
    }
    
    passport.use('saml-netzbegruenung', new SamlStrategy(samlConfig, async (req, profile, done) => {
      console.log('[PassportSetup SAML Verify Callback] Reached SAML verify callback.');
      console.log('[PassportSetup SAML Verify Callback] req.session:', JSON.stringify(req.session, null, 2));
      console.log('[PassportSetup SAML Verify Callback] SAML Profile:', JSON.stringify(profile, null, 2));
      
      try {
        // Transform SAML profile to match the expected format for handleUserProfile
        const transformedProfile = {
          id: profile.nameID || profile.sub, // SAML NameID
          displayName: profile.displayName || profile.cn || profile.name || '',
          emails: profile.email ? [{ value: profile.email }] : [],
          username: profile.username || profile.uid || profile.sAMAccountName || '',
          groups: profile.groups || [],
          source: 'netzbegruenung-login', // Mark this as netzbegruenung source
          // Keep raw SAML profile for debugging
          _raw_saml_profile: profile
        };

        console.log('[PassportSetup SAML Verify Callback] Transformed profile:', JSON.stringify(transformedProfile, null, 2));

        const user = await handleUserProfile(transformedProfile);

        // SAML doesn't provide id_token like OIDC, but we can mark the auth method
        if (user) {
          user.auth_method = 'saml-netzbegruenung';
          console.log('[Passport SAML - netzbegruenung] User processed successfully');
        }

        return done(null, user);
      } catch (error) {
        console.error('[PassportSetup SAML Verify Callback] Error in SAML strategy callback:', error);
        return done(error, null);
      }
    }));

    console.log('[SAML Config] ✅ SAML strategy configured successfully');
  } catch (error) {
    console.error('[SAML Config] ❌ Failed to configure SAML strategy:', error.message);
  }
};

// Configure SAML strategy
configureSamlStrategy();

// Conditional SAML Strategy Configuration for Grünes Netz
const configureGruenesNetzSamlStrategy = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const hasCustomCert = !!process.env.GRUENES_NETZ_SAML_CERT;
  const samlEnabled = process.env.GRUENES_NETZ_SAML_ENABLED !== 'false';
  
  console.log(`[Grünes Netz SAML Config] Development: ${isDevelopment}, Custom Cert: ${hasCustomCert}, SAML Enabled: ${samlEnabled}`);

  if (!samlEnabled) {
    console.log('[Grünes Netz SAML Config] SAML strategy disabled via GRUENES_NETZ_SAML_ENABLED=false');
    return;
  }

  let samlCert;
  let allowUnsignedAssertions = false;

  if (hasCustomCert) {
    // Production configuration with real certificate
    samlCert = process.env.GRUENES_NETZ_SAML_CERT;
    console.log('[Grünes Netz SAML Config] Using production SAML certificate');
  } else if (isDevelopment) {
    // Development configuration with no certificate and relaxed security
    samlCert = null;
    allowUnsignedAssertions = true;
    console.log('[Grünes Netz SAML Config] ⚠️  Using development mode without certificate validation (NOT FOR PRODUCTION!)');
  } else {
    // Production without certificate - don't configure SAML
    console.log('[Grünes Netz SAML Config] ❌ SAML strategy not configured: Missing GRUENES_NETZ_SAML_CERT in production');
    return;
  }

  try {
    // Build SAML strategy configuration
    const samlConfig = {
      callbackUrl: `${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/saml/gruenes-netz/callback`,
      entryPoint: process.env.GRUENES_NETZ_SAML_SSO_URL,
      issuer: process.env.GRUENES_NETZ_SAML_ISSUER,
      acceptedClockSkewMs: 5000,
      identifierFormat: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
      validateInResponseTo: 'never',
      disableRequestedAuthnContext: true,
      signatureAlgorithm: 'sha256',
      digestAlgorithm: 'sha256',
      passReqToCallback: true,
      // Security settings based on environment
      wantAssertionsSigned: !allowUnsignedAssertions,
      wantAuthnResponseSigned: !allowUnsignedAssertions
    };
    
    // Only add cert if it's available
    if (samlCert) {
      samlConfig.cert = samlCert;
      samlConfig.idpCert = samlCert; // Some versions expect idpCert instead of cert
    }
    
    passport.use('saml-gruenes-netz', new SamlStrategy(samlConfig, async (req, profile, done) => {
      console.log('[PassportSetup Grünes Netz SAML Verify Callback] Reached SAML verify callback.');
      console.log('[PassportSetup Grünes Netz SAML Verify Callback] req.session:', JSON.stringify(req.session, null, 2));
      console.log('[PassportSetup Grünes Netz SAML Verify Callback] SAML Profile:', JSON.stringify(profile, null, 2));
      
      try {
        // Transform SAML profile to match the expected format for handleUserProfile
        const transformedProfile = {
          id: profile.nameID || profile.sub, // SAML NameID
          displayName: profile.displayName || profile.cn || profile.name || '',
          emails: profile.email ? [{ value: profile.email }] : [],
          username: profile.username || profile.uid || profile.sAMAccountName || '',
          groups: profile.groups || [],
          source: 'gruenes-netz-login', // Mark this as gruenes-netz source
          // Keep raw SAML profile for debugging
          _raw_saml_profile: profile
        };

        console.log('[PassportSetup Grünes Netz SAML Verify Callback] Transformed profile:', JSON.stringify(transformedProfile, null, 2));

        const user = await handleUserProfile(transformedProfile);

        // SAML doesn't provide id_token like OIDC, but we can mark the auth method
        if (user) {
          user.auth_method = 'saml-gruenes-netz';
          console.log('[Passport SAML - gruenes-netz] User processed successfully');
        }

        return done(null, user);
      } catch (error) {
        console.error('[PassportSetup Grünes Netz SAML Verify Callback] Error in SAML strategy callback:', error);
        return done(error, null);
      }
    }));

    console.log('[Grünes Netz SAML Config] ✅ SAML strategy configured successfully');
  } catch (error) {
    console.error('[Grünes Netz SAML Config] ❌ Failed to configure SAML strategy:', error.message);
  }
};

// Configure Grünes Netz SAML strategy
configureGruenesNetzSamlStrategy();

// Serialize user for session
passport.serializeUser((user, done) => {
  console.log('[Passport] Serializing user:', user.id, 'Has id_token:', !!user.id_token);
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser(async (userData, done) => {
  try {
    console.log('[Passport] Deserialize called with userData:', typeof userData, userData);
    
    if (typeof userData === 'object' && userData.id) {
      console.log('[Passport] Deserializing full user object from session for ID:', userData.id, 'Has id_token:', !!userData.id_token);
      const userToReturn = await getUserById(userData.id);
      if (userToReturn && userData.id_token) {
        userToReturn.id_token = userData.id_token;
      }
      console.log('[Passport] Returning user from deserialize:', userToReturn ? userToReturn.id : 'null');
      return done(null, userToReturn || userData);
    }
    
    console.log('[Passport] Deserializing user ID:', userData);
    const user = await getUserById(userData);
    console.log('[Passport] Found user by ID:', user ? user.id : 'null');
    done(null, user);
  } catch (error) {
    console.error('[Passport] Error deserializing user:', error);
    done(error, null);
  }
});

// Helper function to handle user profile from Authentik
async function handleUserProfile(profile) {
  console.log('[handleUserProfile] Processing profile from openid-client strategy for ID:', profile.id);
  console.log('[handleUserProfile] Full profile object:', JSON.stringify(profile, null, 2));

  const authentikId = profile.id; // Assuming profile.id is correctly mapped to userinfo.sub or claims.sub
  const email = profile.emails?.[0]?.value; // Assuming mapping is correct
  const name = profile.displayName || '';
  const username = profile.username || '';
  
  const authSource = extractAuthSource(profile); // Pass the constructed profile
  console.log('[handleUserProfile] Detected auth source:', authSource);

  if (!authentikId) {
    throw new Error('No Authentik ID (sub) found in profile');
  }

  if (!email) {
    throw new Error('No email found in profile');
  }

  // Check for existing user by authentik_id
  let existingUser = await getUserByAuthentikId(authentikId);
  
  if (existingUser) {
    console.log('[handleUserProfile] Found existing user by Authentik ID:', existingUser.id);
    return await updateUser(existingUser.id, {
      display_name: name,
      username,
      last_login: new Date().toISOString(),
      email: email,
    }, authSource);
  }

  // Check for existing user by email
  const userByEmail = await getUserByEmail(email);
  
  if (userByEmail) {
    console.log('[handleUserProfile] Found existing user by email, linking Authentik ID:', userByEmail.id);
    return await linkUser(userByEmail.id, {
      authentik_id: authentikId,
      display_name: name,
      username,
      last_login: new Date().toISOString(),
      email: email,
    }, authSource);
  }

  console.log('[handleUserProfile] Creating new user for email:', email);
  return await createUser({
    authentik_id: authentikId,
    email,
    name,
    username,
    last_login: new Date().toISOString(),
    authSource: authSource
  });
}

// Get user by ID
async function getUserById(id) {
  const { data, error } = await supabaseService
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getUserById] Error:', error);
    throw new Error(`Failed to get user by ID: ${error.message}`);
  }

  return data;
}

// Get user by Authentik ID
async function getUserByAuthentikId(authentikId) {
  const { data, error } = await supabaseService
    .from('profiles')
    .select('*')
    .eq('authentik_id', authentikId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('[getUserByAuthentikId] Error:', error);
    throw new Error(`Failed to get user by Authentik ID: ${error.message}`);
  }

  return data;
}

// Get user by email
async function getUserByEmail(email) {
  try {
    const { data: authUsers, error: authError } = await supabaseService.auth.admin.listUsers();
    
    if (authError) {
      console.error('[getUserByEmail] Error fetching auth users:', authError);
      throw new Error(`Failed to get user by email: ${authError.message}`);
    }
    
    const authUser = authUsers.users.find(user => user.email === email);
    
    if (!authUser) {
      return null;
    }
    
    const { data, error } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (error && error.code !== 'PGRST116') { 
      console.error('[getUserByEmail] Error:', error);
      throw new Error(`Failed to get user profile by email: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('[getUserByEmail] Error:', error);
    throw new Error(`Failed to get user by email: ${error.message}`);
  }
}

// Create new user
async function createUser(profileData) { // Renamed parameter to avoid confusion
  try {
    const { data: authUser, error: authError } = await supabaseService.auth.admin.createUser({
      email: profileData.email,
      email_confirm: true,
      user_metadata: {
        name: profileData.name,
        username: profileData.username,
        authentik_id: profileData.authentik_id,
        auth_source: profileData.authSource
      }
    });

    if (authError) {
      console.error('[createUser] Error creating auth user:', authError);
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    console.log('[createUser] Created auth user:', authUser.user.id);

    const newProfileData = {
      id: authUser.user.id,
      authentik_id: profileData.authentik_id,
      username: profileData.username,
      display_name: profileData.name,
      last_login: profileData.last_login,
      email: profileData.email,
    };

    const { data, error } = await supabaseService
      .from('profiles')
      .upsert([newProfileData])
      .select()
      .single();

    if (error) {
      console.error('[createUser] Error creating/updating profile:', error);
      throw new Error(`Failed to create profile: ${error.message}`);
    }

    console.log('[createUser] Created/updated profile:', data.id);

    // Create Supabase session for frontend
    const supabaseSession = await createSupabaseSessionForUser(authUser.user);
    
    // Attach session info to user object for frontend consumption
    data.supabaseSession = supabaseSession;
    
    return data;
  } catch (error) {
    console.error('[createUser] Error:', error);
    throw new Error(`Failed to create user: ${error.message}`);
  }
}

// Update existing user
async function updateUser(userId, updates, authSource) {
  const { data, error } = await supabaseService
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('[updateUser] Error:', error);
    throw new Error(`Failed to update user: ${error.message}`);
  }

  console.log('[updateUser] Updated user:', data.id);

  // Create Supabase session for frontend
  try {
    const { data: authUser } = await supabaseService.auth.admin.getUserById(userId);
    if (authUser?.user) {
      const supabaseSession = await createSupabaseSessionForUser(authUser.user);
      data.supabaseSession = supabaseSession;
    }
  } catch (sessionError) {
    console.warn('[updateUser] Could not create session:', sessionError.message);
    // Don't fail the update if session creation fails
  }

  return data;
}

// Link Authentik ID to existing user
async function linkUser(userId, updates) {
  const { data, error } = await supabaseService
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('[linkUser] Error:', error);
    throw new Error(`Failed to link user: ${error.message}`);
  }

  console.log('[linkUser] Linked Authentik ID to user:', data.id);

  // Create Supabase session for frontend
  try {
    const { data: authUser } = await supabaseService.auth.admin.getUserById(userId);
    if (authUser?.user) {
      const supabaseSession = await createSupabaseSessionForUser(authUser.user);
      data.supabaseSession = supabaseSession;
    }
  } catch (sessionError) {
    console.warn('[linkUser] Could not create session:', sessionError.message);
    // Don't fail the link if session creation fails
  }

  return data;
}

/**
 * Creates a Supabase session for the frontend to use
 * This enables RLS and all Supabase features while keeping Authentik as the auth authority
 * Uses multiple approaches for reliable session creation
 */
async function createSupabaseSessionForUser(supabaseUser) {
  try {
    console.log('[createSupabaseSessionForUser] Creating session for user:', supabaseUser.id);

    // Try approach 1: JWT-based session if JWT secret is available
    if (process.env.SUPABASE_JWT_SECRET) {
      return await createJWTSession(supabaseUser);
    }

    // Try approach 2: Admin recovery link approach
    try {
      return await createRecoverySession(supabaseUser);
    } catch (recoveryError) {
      console.warn('[createSupabaseSessionForUser] Recovery approach failed:', recoveryError.message);
    }

    // Fallback approach 3: Return minimal session data for frontend to handle
    console.log('[createSupabaseSessionForUser] Using fallback approach - frontend will handle auth');
    return {
      access_token: null,
      refresh_token: null,
      expires_in: 0,
      expires_at: 0,
      token_type: 'bearer',
      user: supabaseUser,
      _backend_session_failed: true // Flag for frontend to know to handle auth directly
    };

  } catch (error) {
    console.error('[createSupabaseSessionForUser] Error:', error);
    // Don't throw - return fallback session instead
    return {
      access_token: null,
      refresh_token: null,
      expires_in: 0,
      expires_at: 0,
      token_type: 'bearer',
      user: supabaseUser,
      _backend_session_failed: true,
      _error: error.message
    };
  }
}

/**
 * Creates JWT-based session (preferred approach)
 */
async function createJWTSession(supabaseUser) {
  const jwt = await import('jsonwebtoken');
  
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600; // 1 hour
  const expiresAt = now + expiresIn;

  const payload = {
    sub: supabaseUser.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: supabaseUser.email,
    email_verified: true,
    phone_verified: false,
    iat: now,
    exp: expiresAt,
    user_metadata: supabaseUser.user_metadata || {},
    app_metadata: supabaseUser.app_metadata || {}
  };

  const accessToken = jwt.default.sign(payload, process.env.SUPABASE_JWT_SECRET, {
    algorithm: 'HS256'
  });

  console.log('[createJWTSession] Successfully created JWT session for user:', supabaseUser.id);

  return {
    access_token: accessToken,
    refresh_token: null,
    expires_in: expiresIn,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: supabaseUser
  };
}

/**
 * Creates session using recovery link approach
 */
async function createRecoverySession(supabaseUser) {
  const { data, error } = await supabaseService.auth.admin.generateLink({
    type: 'recovery',
    email: supabaseUser.email,
    options: {
      redirectTo: `${process.env.BASE_URL}/auth/callback`
    }
  });

  if (error) {
    throw new Error(`Recovery link generation failed: ${error.message}`);
  }

  // Try to extract tokens from the recovery link
  const url = new URL(data.properties.action_link);
  const accessToken = url.searchParams.get('access_token');
  const refreshToken = url.searchParams.get('refresh_token');

  if (!accessToken) {
    throw new Error('No access token in recovery link');
  }

  console.log('[createRecoverySession] Successfully created recovery session for user:', supabaseUser.id);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: supabaseUser
  };
}

export default passport;
export {
  handleUserProfile,
  getUserById,
  getUserByAuthentikId,
  getUserByEmail,
  createUser,
  updateUser,
  linkUser,
  createSupabaseSessionForUser
}; 