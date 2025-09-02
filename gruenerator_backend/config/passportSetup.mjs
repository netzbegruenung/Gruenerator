import passport from 'passport';
import { KeycloakStrategy } from './keycloakStrategy.mjs';

// Import ProfileService for database operations
import { getProfileService } from '../services/ProfileService.js';

console.log('[PassportSetup] Initializing Keycloak OpenID Connect strategy');

// Passport Keycloak Strategy Configuration (extends OpenID Connect)
passport.use('oidc', new KeycloakStrategy({
  issuer: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}`,
  authorizationURL: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/auth`,
  tokenURL: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`,
  userInfoURL: `${process.env.KEYCLOAK_BASE_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
  clientID: process.env.KEYCLOAK_CLIENT_ID,
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  callbackURL: `${process.env.AUTH_BASE_URL || process.env.BASE_URL || 'https://beta.gruenerator.de'}/auth/callback`,
  scope: 'openid profile email offline_access'
}, async (issuer, profile, done) => {
  try {
    if (!profile) {
      console.error('[PassportSetup OIDC Verify Callback] Profile is undefined');
      return done(new Error('Profile is undefined'), null);
    }

    // passport-openidconnect provides profile in standard format
    const normalizedProfile = {
      id: profile.id,
      displayName: profile.displayName || profile.username || profile.preferred_username,
      emails: profile.emails || [],
      username: profile.username || profile.preferred_username,
      _raw: profile._raw,
      _json: profile._json
    };

    // Create a mock request object for handleUserProfile  
    const mockReq = { user: null };
    const user = await handleUserProfile(normalizedProfile, mockReq);

    // Note: passport-openidconnect doesn't provide tokenset in callback

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
      console.log(`[Auth] 🔄 Deserializing user ${userData.id}, session avatar_robot_id=${userData.avatar_robot_id}`);
      const userToReturn = await getUserById(userData.id);
      if (userToReturn) {
        console.log(`[Auth] 🔄 Database avatar_robot_id=${userToReturn.avatar_robot_id}, session avatar_robot_id=${userData.avatar_robot_id}`);
        
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
        // CRITICAL: Preserve avatar_robot_id from session if it was updated
        if (userData.hasOwnProperty('avatar_robot_id') && userData.avatar_robot_id) {
          console.log(`[Auth] 🎨 Using session avatar_robot_id: ${userData.avatar_robot_id} (overriding DB value: ${userToReturn.avatar_robot_id})`);
          userToReturn.avatar_robot_id = userData.avatar_robot_id;
        }
        
        console.log(`[Auth] ✅ Final user object avatar_robot_id=${userToReturn.avatar_robot_id}`);
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
    console.log(`[Auth] 🔍 Looking up user by Keycloak ID: ${keycloakId}`);
    const profileService = getProfileService();
    const profile = await profileService.getProfileByKeycloakId(keycloakId);
    if (profile) {
      console.log(`[Auth] ✅ User found by Keycloak ID ${keycloakId}: user_id=${profile.id}, avatar_robot_id=${profile.avatar_robot_id}`);
    } else {
      console.log(`[Auth] ❌ No user found for Keycloak ID: ${keycloakId}`);
    }
    return profile;
  } catch (error) {
    console.error('[getUserByKeycloakId] Error:', error);
    return null;
  }
}

// Get user by email
async function getUserByEmail(email) {
  try {
    const profileService = getProfileService();
    const profile = await profileService.getProfileByEmail(email.toLowerCase());
    return profile;
  } catch (error) {
    console.error('[getUserByEmail] Error:', error);
    return null;
  }
}

// Get user by ID
async function getUserById(id) {
  try {
    console.log(`[Auth] 🔍 Looking up user by ID: ${id}`);
    const profileService = getProfileService();
    const profile = await profileService.getProfileById(id);
    if (profile) {
      console.log(`[Auth] ✅ User found by ID ${id}: avatar_robot_id=${profile.avatar_robot_id}`);
    } else {
      console.log(`[Auth] ❌ No user found for ID: ${id}`);
    }
    return profile;
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

    const profileService = getProfileService();
    const profile = await profileService.createProfile(newProfileData);
    
    return profile;
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

    const profileService = getProfileService();
    const profile = await profileService.updateProfile(userId, updates);
    
    return profile;
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

    const profileService = getProfileService();
    const profile = await profileService.updateProfile(userId, updates);
    
    return profile;
  } catch (error) {
    console.error('[linkUser] Error:', error);
    throw new Error(`Failed to link user: ${error.message}`);
  }
}





export default passport; 