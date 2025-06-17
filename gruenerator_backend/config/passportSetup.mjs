import passport from 'passport';
import { Issuer, Strategy as OidcClientStrategy } from 'openid-client';

// Import Supabase clients using CommonJS require
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { supabaseAnon, supabaseService } = require('../utils/supabaseClient.js');

// Configure OIDC client for Keycloak
const keycloakIssuer = await Issuer.discover(`${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`);

const client = new keycloakIssuer.Client({
  client_id: process.env.KEYCLOAK_CLIENT_ID,
  client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
  redirect_uris: [`${process.env.AUTH_BASE_URL || process.env.BASE_URL}/api/auth/callback`],
  response_types: ['code'],
  token_endpoint_auth_method: 'client_secret_post'
});
console.log('[PassportSetup] Keycloak OIDC client created:', client ? 'Client object exists' : 'Client object IS NULL OR UNDEFINED');

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
      console.log('[Passport OIDC - Keycloak] Attached id_token to user object.');
    }

    return done(null, user);
  } catch (error) {
    console.error('[PassportSetup OIDC Verify Callback] Error in strategy callback:', error);
    return done(error, null);
  }
}));

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

// Helper function to handle user profile from Keycloak
async function handleUserProfile(profile, req = null) {
  console.log('[handleUserProfile] Processing profile from Keycloak for ID:', profile.id);
  console.log('[handleUserProfile] Full profile object:', JSON.stringify(profile, null, 2));

  const keycloakId = profile.id;
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName || '';
  const username = profile.username || profile.preferred_username || keycloakId;

  if (!keycloakId) {
    throw new Error('No Keycloak ID (sub) found in profile');
  }

  // Determine auth source based on session data or claims
  let authSource = null;
  if (req?.session?.preferredSource) {
    authSource = req.session.preferredSource;
    console.log('[handleUserProfile] Auth source from session:', authSource);
  } else {
    // Fallback: try to determine from profile data or default to gruenerator-login
    authSource = 'gruenerator-login';
    console.log('[handleUserProfile] Auth source defaulted to:', authSource);
  }

  // Allow users without email (use username or keycloak ID as fallback)
  const userIdentifier = email || username || keycloakId;

  // Check for existing user by keycloak_id
  let existingUser = await getUserByKeycloakId(keycloakId);
  
  if (existingUser) {
    console.log('[handleUserProfile] Found existing user by Keycloak ID:', existingUser.id);
    
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
      console.log('[handleUserProfile] Found existing user by email, linking Keycloak ID:', userByEmail.id);
      return await linkUser(userByEmail.id, {
        keycloak_id: keycloakId,
        display_name: name,
        username,
        last_login: new Date().toISOString(),
      }, authSource);
    }
  }

  console.log('[handleUserProfile] Creating new user for identifier:', userIdentifier);
  return await createUser({
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

    return data;
  } catch (error) {
    console.error('[getUserById] Error:', error);
    return null;
  }
}

// Create new user
async function createUser(profileData) {
  try {
    const { data: authUser, error: authError } = await supabaseService.auth.admin.createUser({
      email: profileData.email,
      email_confirm: true,
      user_metadata: {
        name: profileData.name,
        username: profileData.username,
        keycloak_id: profileData.keycloak_id,
        auth_source: profileData.auth_source,
        memory_enabled: false, // Default memory disabled for new users
      }
    });

    if (authError) {
      // Handle email_exists error by linking to existing auth user
      if (authError.code === 'email_exists') {
        console.log('[createUser] Email exists in auth, attempting to link existing user:', profileData.email);
        return await linkExistingAuthUser(profileData);
      }
      
      console.error('[createUser] Error creating auth user:', authError);
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    console.log('[createUser] Created auth user:', authUser.user.id);

    const newProfileData = {
      id: authUser.user.id,
      keycloak_id: profileData.keycloak_id,
      username: profileData.username,
      display_name: profileData.name,
      email: profileData.email || null, // Sync email from auth.users to profiles
      last_login: profileData.last_login,
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
async function updateUser(userId, updates, authSource = null) {
  try {
    // Update user metadata in Supabase Auth if auth_source is provided
    if (authSource) {
      const { data: authUser } = await supabaseService.auth.admin.getUserById(userId);
      if (authUser?.user) {
        const updatedMetadata = {
          ...authUser.user.user_metadata,
          auth_source: authSource,
        };
        
        await supabaseService.auth.admin.updateUserById(userId, {
          user_metadata: updatedMetadata
        });
        
        console.log('[updateUser] Updated auth_source in user metadata:', authSource);
      }
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

    console.log('[updateUser] Updated user profile:', data.id);

    // Get auth user for session creation
    const { data: authUser } = await supabaseService.auth.admin.getUserById(userId);
    
    // Create/refresh Supabase session
    if (authUser?.user) {
      const supabaseSession = await createSupabaseSessionForUser(authUser.user);
      data.supabaseSession = supabaseSession;
    }

    return data;
  } catch (error) {
    console.error('[updateUser] Error:', error);
    throw new Error(`Failed to update user: ${error.message}`);
  }
}

// Link Keycloak ID to existing user
async function linkUser(userId, updates, authSource = null) {
  try {
    // Update user metadata in Supabase Auth if auth_source is provided
    if (authSource) {
      const { data: authUser } = await supabaseService.auth.admin.getUserById(userId);
      if (authUser?.user) {
        const updatedMetadata = {
          ...authUser.user.user_metadata,
          auth_source: authSource,
          keycloak_id: updates.keycloak_id,
        };
        
        await supabaseService.auth.admin.updateUserById(userId, {
          user_metadata: updatedMetadata
        });
        
        console.log('[linkUser] Updated auth_source in user metadata:', authSource);
      }
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

    console.log('[linkUser] Linked Keycloak ID to user:', data.id);

    // Get auth user for session creation
    const { data: authUser } = await supabaseService.auth.admin.getUserById(userId);
    
    // Create/refresh Supabase session
    if (authUser?.user) {
      const supabaseSession = await createSupabaseSessionForUser(authUser.user);
      data.supabaseSession = supabaseSession;
    }

    return data;
  } catch (error) {
    console.error('[linkUser] Error:', error);
    throw new Error(`Failed to link user: ${error.message}`);
  }
}

// Link existing auth user to profile when email exists
async function linkExistingAuthUser(profileData) {
  try {
    console.log('[linkExistingAuthUser] Searching for existing auth user with email:', profileData.email);
    
    // Get existing auth user by email
    const { data: listResponse, error: listError } = await supabaseService.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }
    
    const existingAuthUser = listResponse.users.find(u => 
      u.email?.toLowerCase() === profileData.email.toLowerCase()
    );
    
    if (!existingAuthUser) {
      throw new Error(`No auth user found with email: ${profileData.email}`);
    }
    
    console.log('[linkExistingAuthUser] Found existing auth user:', existingAuthUser.id);
    
    // Update auth user metadata with new Keycloak ID and auth_source
    const { error: updateError } = await supabaseService.auth.admin.updateUserById(
      existingAuthUser.id,
      {
        user_metadata: {
          ...existingAuthUser.user_metadata,
          name: profileData.name,
          username: profileData.username,
          keycloak_id: profileData.keycloak_id,
          auth_source: profileData.auth_source,
          memory_enabled: existingAuthUser.user_metadata?.memory_enabled || false, // Preserve existing memory settings
        }
      }
    );
    
    if (updateError) {
      console.error('[linkExistingAuthUser] Error updating auth user metadata:', updateError);
    }
    
    // Create or update profile record, sync email from auth
    const newProfileData = {
      id: existingAuthUser.id,
      keycloak_id: profileData.keycloak_id,
      username: profileData.username,
      display_name: profileData.name,
      email: profileData.email || null, // Sync email from auth.users to profiles
      last_login: profileData.last_login,
    };

    const { data, error } = await supabaseService
      .from('profiles')
      .upsert([newProfileData])
      .select()
      .single();

    if (error) {
      console.error('[linkExistingAuthUser] Error creating/updating profile:', error);
      throw new Error(`Failed to create profile: ${error.message}`);
    }

    console.log('[linkExistingAuthUser] Successfully linked auth user to profile:', data.id);

    // Create Supabase session
    const supabaseSession = await createSupabaseSessionForUser(existingAuthUser);
    data.supabaseSession = supabaseSession;
    
    return data;
  } catch (error) {
    console.error('[linkExistingAuthUser] Error:', error);
    throw new Error(`Failed to link existing user: ${error.message}`);
  }
}

/**
 * Creates session using admin session exchange approach
 */
async function createAdminSession(supabaseUser) {
  try {
    console.log('[createAdminSession] Creating session for user:', supabaseUser.id);
    
    // Method 1: Try generateLink with session access
    const { data, error } = await supabaseService.auth.admin.generateLink({
      type: 'invite',
      email: supabaseUser.email,
      options: {
        data: {
          session_access: true
        }
      }
    });

    if (!error && data?.properties?.action_link) {
      const url = new URL(data.properties.action_link);
      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');
      
      if (accessToken) {
        console.log('[createAdminSession] Session created via generateLink method');
        return {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          token_type: 'bearer',
          user: supabaseUser
        };
      }
    }

    // Method 2: Create custom JWT session
    console.log('[createAdminSession] Fallback to custom JWT method');
    return await createCustomJWTSession(supabaseUser);
    
  } catch (error) {
    console.error('[createAdminSession] Error creating admin session:', error);
    throw error;
  }
}

/**
 * Creates custom JWT session as fallback
 */
async function createCustomJWTSession(supabaseUser) {
  // Create a minimal session object for frontend
  const customSession = {
    access_token: 'custom-backend-session',
    refresh_token: null,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: supabaseUser,
    provider_token: null,
    provider_refresh_token: null
  };

  console.log('[createCustomJWTSession] Created custom session for user:', supabaseUser.id);
  return customSession;
}

/**
 * Creates Supabase session for authenticated user
 */
export async function createSupabaseSessionForUser(supabaseUser) {
  try {
    console.log('[createSupabaseSessionForUser] Creating session for user:', supabaseUser.id);
    
    const session = await createAdminSession(supabaseUser);
    
    console.log('[createSupabaseSessionForUser] Session created successfully');
    return session;
  } catch (error) {
    console.error('[createSupabaseSessionForUser] Error creating session:', error.message);
    throw error;
  }
}

export default passport; 