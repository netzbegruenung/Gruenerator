import passport from 'passport';
import { initializeKeycloakOIDCStrategy } from './keycloakOIDCStrategy.mjs';
import { getProfileService } from '../services/ProfileService.mjs';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Passport');

// Initialize the new OpenID Connect strategy
try {
  const keycloakStrategy = await initializeKeycloakOIDCStrategy();
  passport.use(keycloakStrategy);
  log.info('Keycloak OIDC initialized');
} catch (error) {
  log.error(`OIDC init failed: ${error.message}`);
  throw error;
}

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
        if (userData.hasOwnProperty('igel_modus')) {
          userToReturn.igel_modus = userData.igel_modus;
        }
        // CRITICAL: Preserve avatar_robot_id from session if it was updated
        if (userData.hasOwnProperty('avatar_robot_id') && userData.avatar_robot_id) {
          userToReturn.avatar_robot_id = userData.avatar_robot_id;
        }
        // Preserve _redirectTo field if it exists (used for redirect after auth)
        if (userData._redirectTo) {
          userToReturn._redirectTo = userData._redirectTo;
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
export async function handleUserProfile(profile, req = null) {

  const keycloakId = profile.id;
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName || '';
  const username = profile.username || profile.preferred_username || keycloakId;

  if (!keycloakId) {
    throw new Error('No Keycloak ID (sub) found in profile');
  }

  // Determine auth source based on session data or claims
  let authSource = req?.session?.preferredSource || 'gruenerator-login';

  // Determine locale based on auth source
  let locale = 'de-DE'; // Default to German
  if (authSource === 'gruene-oesterreich-login') {
    locale = 'de-AT'; // Austrian German
  }

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
          locale: existingUser.locale || locale, // Preserve existing locale or set new one
          last_login: new Date().toISOString(),
        }, authSource);
      }
    }
    
    return await updateUser(existingUser.id, {
      display_name: name,
      username,
      email: email || existingUser.email || null, // Sync email from auth, preserve existing if no new email
      locale: existingUser.locale || locale, // Preserve existing locale or set new one
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
        locale: userByEmail.locale || locale, // Preserve existing locale or set new one
        last_login: new Date().toISOString(),
      }, authSource);
    }
  }

  return await createProfileUser({
    keycloak_id: keycloakId,
    email: email || null,
    name,
    username,
    locale,
    last_login: new Date().toISOString(),
    auth_source: authSource,
  });
}

// Get user by Keycloak ID
async function getUserByKeycloakId(keycloakId) {
  try {
    const profileService = getProfileService();
    const profile = await profileService.getProfileByKeycloakId(keycloakId);
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
    const profileService = getProfileService();
    const profile = await profileService.getProfileById(id);
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
    const { randomUUID } = await import('crypto');
    const newUserId = randomUUID();
    
    const newProfileData = {
      id: newUserId,
      keycloak_id: profileData.keycloak_id,
      username: profileData.username,
      display_name: profileData.name,
      email: profileData.email || null,
      locale: profileData.locale || 'de-DE',
      last_login: profileData.last_login,
      // Default values
      beta_features: {}
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
