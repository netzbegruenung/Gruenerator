import passport from 'passport';
import { Issuer, Strategy as OidcClientStrategy } from 'openid-client';

// Import Supabase clients using CommonJS require
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { supabaseService } = require('../utils/supabaseClient.js');

// Configure OIDC client for Keycloak
const keycloakIssuer = await Issuer.discover(`${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`);

const client = new keycloakIssuer.Client({
  client_id: process.env.KEYCLOAK_CLIENT_ID,
  client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
  redirect_uris: [`${process.env.AUTH_BASE_URL || process.env.BASE_URL || 'https://beta.gruenerator.de'}/auth/callback`],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_post'
});
console.log('[PassportSetup] Keycloak OIDC client initialized');

// Passport OIDC Strategy Configuration for Keycloak
passport.use('oidc', new OidcClientStrategy({
  client,
  params: {
    scope: 'openid profile email offline_access',
  },
  passReqToCallback: true,
  usePKCE: false,
  sessionKey: 'passport:oidc:keycloak'
}, async (req, tokenset, userinfo, done) => {
  try {
    if (!tokenset || !userinfo) {
      console.error('[PassportSetup OIDC Verify Callback] Tokenset or userinfo is undefined');
      return done(new Error('Tokenset or userinfo is undefined'), null);
    }

    const claims = tokenset.claims();

    // Construct a profile object for handleUserProfile
    const profile = {
      id: userinfo.sub || claims.sub,
      displayName: userinfo.name || claims.name || userinfo.preferred_username || claims.preferred_username,
      emails: userinfo.email ? [{ value: userinfo.email }] : (claims.email ? [{ value: claims.email }] : []),
      username: userinfo.preferred_username || claims.preferred_username,
      _raw_userinfo: userinfo,
      _raw_claims: claims
    };

    const user = await handleUserProfile(profile, req);

    if (user && tokenset.id_token) {
      user.id_token = tokenset.id_token;
    }

    return done(null, user);
  } catch (error) {
    console.error('[PassportSetup OIDC Verify Callback] Error in strategy callback:', error);
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser(async (userData, done) => {
  try {
    if (typeof userData === 'object' && userData.id) {
      const userToReturn = await getUserById(userData.id);
      if (userToReturn) {
        // Preserve session data that might have been updated
        if (userData.id_token) {
          userToReturn.id_token = userData.id_token;
        }
        // CRITICAL: Preserve beta_features from session if they were updated
        if (userData.beta_features) {
          userToReturn.beta_features = userData.beta_features;
        }
        // Also preserve user_metadata if it exists
        if (userData.user_metadata) {
          userToReturn.user_metadata = userData.user_metadata;
        }
        // Preserve supabaseSession if it exists
        if (userData.supabaseSession) {
          userToReturn.supabaseSession = userData.supabaseSession;
        }
        // CRITICAL: Preserve profile settings that may have been updated in session
        if (userData.hasOwnProperty('bundestag_api_enabled')) {
          userToReturn.bundestag_api_enabled = userData.bundestag_api_enabled;
        }
        if (userData.hasOwnProperty('igel_modus')) {
          userToReturn.igel_modus = userData.igel_modus;
        }
      }
      return done(null, userToReturn || userData);
    }
    
    const user = await getUserById(userData);
    done(null, user);
  } catch (error) {
    console.error('[Passport] Error deserializing user:', error);
    done(error, null);
  }
});

// Helper function to handle user profile from Keycloak
async function handleUserProfile(profile, req = null) {
  console.log('[handleUserProfile] Processing profile for ID:', profile.id);

  const keycloakId = profile.id;
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName || '';
  const username = profile.username || profile.preferred_username || keycloakId;

  if (!keycloakId) {
    throw new Error('No Keycloak ID (sub) found in profile');
  }

  // Determine auth source based on session data or claims
  let authSource = req?.session?.preferredSource || 'gruenerator-login';

  // Allow users without email (use username or keycloak ID as fallback)
  const userIdentifier = email || username || keycloakId;

  // Check for existing user by keycloak_id
  let existingUser = await getUserByKeycloakId(keycloakId);
  
  if (existingUser) {
    
    // Check if email change would cause conflict
    if (existingUser.email !== email) {
      const emailConflictUser = await getUserByEmail(email);
      if (emailConflictUser && emailConflictUser.id !== existingUser.id) {
        console.error('[handleUserProfile] Email conflict detected:', {
          existingUserId: existingUser.id,
          existingUserEmail: existingUser.email,
          conflictUserId: emailConflictUser.id,
          newEmail: email
        });
        
        console.warn('[handleUserProfile] Keeping existing email to avoid conflict');
        return await updateUser(existingUser.id, {
          display_name: name,
          username,
          email: existingUser.email || null, // Keep existing email to avoid conflict
          last_login: new Date().toISOString(),
        }, authSource);
      }
    }
    
    return await updateUser(existingUser.id, {
      display_name: name,
      username,
      email: email || existingUser.email || null, // Sync email from auth, preserve existing if no new email
      last_login: new Date().toISOString(),
    }, authSource);
  }

  // Check for existing user by email (only if email exists)
  if (email) {
    const userByEmail = await getUserByEmail(email);
    
    if (userByEmail) {
      return await linkUser(userByEmail.id, {
        keycloak_id: keycloakId,
        display_name: name,
        username,
        last_login: new Date().toISOString(),
      }, authSource);
    }
  }

  return await createProfileUser({
    keycloak_id: keycloakId,
    email: email || null,
    name,
    username,
    last_login: new Date().toISOString(),
    auth_source: authSource,
  });
}

// Get user by Keycloak ID
async function getUserByKeycloakId(keycloakId) {
  try {
    const { data, error } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('keycloak_id', keycloakId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('[getUserByKeycloakId] Error:', error);
    return null;
  }
}

// Get user by email
async function getUserByEmail(email) {
  try {
    const { data, error } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('[getUserByEmail] Error:', error);
    return null;
  }
}

// Get user by ID
async function getUserById(id) {
  try {
    const { data, error } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!data) return null;

    // Load user's groups if groups beta feature is enabled
    if (data.beta_features?.groups) {
      try {
        const { data: memberships, error: membershipError } = await supabaseService
          .from('group_memberships')
          .select(`
            group_id,
            role,
            joined_at,
            groups!inner(id, name, created_at, created_by, join_token)
          `)
          .eq('user_id', id);

        if (!membershipError && memberships) {
          data.groups = memberships.map(m => ({
            id: m.groups.id,
            name: m.groups.name,
            created_at: m.groups.created_at,
            created_by: m.groups.created_by,
            join_token: m.groups.join_token,
            role: m.role,
            joined_at: m.joined_at,
            isAdmin: m.groups.created_by === id || m.role === 'admin'
          }));
        }
      } catch (groupError) {
        console.warn('[getUserById] Error loading groups:', groupError);
        // Don't fail authentication if groups fail to load
      }
    }

    return data;
  } catch (error) {
    console.error('[getUserById] Error:', error);
    return null;
  }
}


// Create new user (profiles-only, no Supabase Auth)
async function createProfileUser(profileData) {
  try {
    
    // Generate UUID for new user (using built-in crypto)
    const { randomUUID } = require('crypto');
    const newUserId = randomUUID();
    
    const newProfileData = {
      id: newUserId,
      keycloak_id: profileData.keycloak_id,
      username: profileData.username,
      display_name: profileData.name,
      email: profileData.email || null,
      last_login: profileData.last_login,
      // Default values
      beta_features: {
        memory_enabled: false // Default memory disabled for new users
      }
    };

    const { data, error } = await supabaseService
      .from('profiles')
      .insert([newProfileData])
      .select()
      .single();

    if (error) {
      console.error('[createProfileUser] Error creating profile:', error);
      throw new Error(`Failed to create profile: ${error.message}`);
    }

    
    // No Supabase Auth session creation - use only profile data
    return data;
  } catch (error) {
    console.error('[createProfileUser] Error:', error);
    throw new Error(`Failed to create profile user: ${error.message}`);
  }
}

// Update existing user (profiles-only, no Supabase Auth)
async function updateUser(userId, updates, authSource = null) {
  try {
    
    // Add auth_source to updates if provided
    if (authSource) {
      updates.auth_source = authSource;
    }

    const { data, error } = await supabaseService
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[updateUser] Error updating user:', error);
      throw new Error(`Failed to update user: ${error.message}`);
    }


    // No Supabase Auth session creation - use only profile data
    return data;
  } catch (error) {
    console.error('[updateUser] Error:', error);
    throw new Error(`Failed to update user: ${error.message}`);
  }
}

// Link Keycloak ID to existing user (profiles-only, no Supabase Auth)
async function linkUser(userId, updates, authSource = null) {
  try {
    
    // Add auth_source to updates if provided
    if (authSource) {
      updates.auth_source = authSource;
    }

    const { data, error } = await supabaseService
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('[linkUser] Error linking user:', error);
      throw new Error(`Failed to link user: ${error.message}`);
    }


    // No Supabase Auth session creation - use only profile data
    return data;
  } catch (error) {
    console.error('[linkUser] Error:', error);
    throw new Error(`Failed to link user: ${error.message}`);
  }
}





export default passport; 