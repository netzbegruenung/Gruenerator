import passport from 'passport';
import { randomUUID } from 'crypto';
import { initializeKeycloakOIDCStrategy, type PassportProfile } from './keycloakOIDCStrategy.js';
import { getProfileService } from '../services/user/ProfileService.js';
import { createLogger } from '../utils/logger.js';
import type { Request } from 'express';

const log = createLogger('Passport');

/**
 * Fallback user object when profile sync fails
 */
interface FallbackUser {
  id: string;
  keycloak_id: string;
  email: string | null;
  display_name: string;
  username: string;
  locale: 'de-DE' | 'de-AT';
  _profileSyncPending: boolean;
  _profileSyncError: any | null;
  beta_features: Record<string, any>;
}

/**
 * User object with session-specific properties
 */
interface UserWithSession {
  id?: string;
  keycloak_id: string;
  email: string | null;
  display_name: string;
  username: string;
  locale: string;
  beta_features?: Record<string, any>;
  id_token?: string;
  user_metadata?: any;
  supabaseSession?: any;
  igel_modus?: any;
  avatar_robot_id?: string;
  _redirectTo?: string;
  _originDomain?: string;
  _profileSyncPending?: boolean;
  _profileSyncError?: any;
}

/**
 * Profile data for creating new user
 */
interface ProfileData {
  keycloak_id: string;
  email: string | null;
  name: string;
  username: string;
  locale: string;
  last_login: string;
  auth_source: string;
}

/**
 * User update data
 */
interface UserUpdate {
  display_name?: string;
  username?: string;
  email?: string | null;
  locale?: string;
  last_login?: string;
  keycloak_id?: string;
  auth_source?: string;
}

function createFallbackUser(profile: PassportProfile, req: Request | null): FallbackUser {
  const keycloakId = profile.id;
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName || '';
  const username = profile.username || (profile._json as any)?.preferred_username || keycloakId;
  const authSource = req?.session?.preferredSource || 'gruenerator-login';

  let locale: 'de-DE' | 'de-AT' = 'de-DE';
  if (authSource === 'gruene-oesterreich-login') {
    locale = 'de-AT';
  }

  return {
    id: randomUUID(),
    keycloak_id: keycloakId,
    email: email || null,
    display_name: name,
    username,
    locale,
    _profileSyncPending: true,
    _profileSyncError: null,
    beta_features: {},
  };
}

// Initialize the new OpenID Connect strategy with top-level await
try {
  const keycloakStrategy = await initializeKeycloakOIDCStrategy();
  passport.use(keycloakStrategy);
  log.info('Keycloak OIDC initialized');
} catch (error) {
  log.error(`OIDC init failed: ${(error as Error).message}`);
  log.error('Server will start without authentication - auth requests will fail until Keycloak is reachable');
}

// Serialize user for session
passport.serializeUser((user: Express.User, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser(async (userData: any, done) => {
  try {
    // Fallback users have no DB row yet — skip the lookup
    if (typeof userData === 'object' && userData._profileSyncPending === true) {
      return done(null, userData as Express.User);
    }

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
    done(null, user as unknown as Express.User | null);
  } catch (error) {
    console.error('[Passport] Error deserializing user:', error);
    done(error as Error, null);
  }
});

// Helper function to handle user profile from Keycloak
export async function handleUserProfile(
  profile: PassportProfile,
  req: Request | null = null
): Promise<UserWithSession> {
  const keycloakId = profile.id;
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName || '';
  const username = profile.username || (profile._json as any)?.preferred_username || keycloakId;

  if (!keycloakId) {
    throw new Error('No Keycloak ID (sub) found in profile');
  }

  // Determine auth source based on session data or claims
  const authSource = req?.session?.preferredSource || 'gruenerator-login';

  // Determine locale based on auth source
  let locale = 'de-DE';
  if (authSource === 'gruene-oesterreich-login') {
    locale = 'de-AT';
  }

  try {
    // Check for existing user by keycloak_id
    let existingUser = await getUserByKeycloakId(keycloakId);

    if (existingUser) {
      // Check if email change would cause conflict
      if (existingUser.email !== email) {
        const emailConflictUser = await getUserByEmail(email);
        if (emailConflictUser && emailConflictUser.id !== existingUser.id) {
          log.warn('[handleUserProfile] Email conflict detected, keeping existing email');
          return await updateUser(
            existingUser.id!,
            {
              display_name: name,
              username,
              email: existingUser.email || null,
              locale: existingUser.locale || locale,
              last_login: new Date().toISOString(),
            },
            authSource
          );
        }
      }

      return await updateUser(
        existingUser.id!,
        {
          display_name: name,
          username,
          email: email || existingUser.email || null,
          locale: existingUser.locale || locale,
          last_login: new Date().toISOString(),
        },
        authSource
      );
    }

    // Check for existing user by email (only if email exists)
    if (email) {
      const userByEmail = await getUserByEmail(email);

      if (userByEmail) {
        return await linkUser(
          userByEmail.id!,
          {
            keycloak_id: keycloakId,
            display_name: name,
            username,
            locale: userByEmail.locale || locale,
            last_login: new Date().toISOString(),
          },
          authSource
        );
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
  } catch (error) {
    const correlationId = randomUUID().slice(0, 8);
    log.error(`[handleUserProfile] Database error (${correlationId}): ${(error as Error).message}`);

    const fallbackUser = createFallbackUser(profile, req);
    fallbackUser._profileSyncError = {
      message: (error as Error).message,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    return fallbackUser as UserWithSession;
  }
}

// Get user by Keycloak ID
async function getUserByKeycloakId(keycloakId: string): Promise<UserWithSession | null> {
  try {
    const profileService = getProfileService();
    const profile = await profileService.getProfileByKeycloakId(keycloakId);
    return profile as unknown as UserWithSession;
  } catch (error) {
    console.error('[getUserByKeycloakId] Error:', error);
    return null;
  }
}

// Get user by email
async function getUserByEmail(email: string | undefined): Promise<UserWithSession | null> {
  if (!email) return null;

  try {
    const profileService = getProfileService();
    const profile = await profileService.getProfileByEmail(email.toLowerCase());
    return profile as unknown as UserWithSession;
  } catch (error) {
    console.error('[getUserByEmail] Error:', error);
    return null;
  }
}

// Get user by ID
async function getUserById(id: string): Promise<UserWithSession | null> {
  try {
    const profileService = getProfileService();
    const profile = await profileService.getProfileById(id);
    return profile as unknown as UserWithSession;
  } catch (error) {
    console.error('[getUserById] Error:', error);
    return null;
  }
}

// Create new user (profiles-only, no Supabase Auth)
async function createProfileUser(profileData: ProfileData): Promise<UserWithSession> {
  try {
    const newUserId = randomUUID();

    const newProfileData = {
      id: newUserId,
      keycloak_id: profileData.keycloak_id,
      username: profileData.username,
      display_name: profileData.name,
      email: profileData.email ?? undefined,
      locale: profileData.locale || 'de-DE',
      last_login: profileData.last_login,
      beta_features: {},
    };

    const profileService = getProfileService();
    const profile = await profileService.createProfile(
      newProfileData as Parameters<typeof profileService.createProfile>[0]
    );

    return profile as unknown as UserWithSession;
  } catch (error) {
    console.error('[createProfileUser] Error:', error);
    throw new Error(`Failed to create profile user: ${(error as Error).message}`);
  }
}

// Update existing user (profiles-only, no Supabase Auth)
async function updateUser(
  userId: string,
  updates: UserUpdate,
  authSource: string | null = null
): Promise<UserWithSession> {
  try {
    // Add auth_source to updates if provided
    if (authSource) {
      (updates as any).auth_source = authSource;
    }

    const profileService = getProfileService();
    // Convert null to undefined for email field to match ProfileUpdateData
    const profileUpdates = {
      ...updates,
      email: updates.email ?? undefined,
    };
    const profile = await profileService.updateProfile(userId, profileUpdates);

    return profile as unknown as UserWithSession;
  } catch (error) {
    console.error('[updateUser] Error:', error);
    throw new Error(`Failed to update user: ${(error as Error).message}`);
  }
}

// Link Keycloak ID to existing user (profiles-only, no Supabase Auth)
async function linkUser(
  userId: string,
  updates: UserUpdate,
  authSource: string | null = null
): Promise<UserWithSession> {
  try {
    // Add auth_source to updates if provided
    if (authSource) {
      (updates as any).auth_source = authSource;
    }

    const profileService = getProfileService();
    // Convert null to undefined for email field to match ProfileUpdateData
    const profileUpdates = {
      ...updates,
      email: updates.email ?? undefined,
    };
    const profile = await profileService.updateProfile(userId, profileUpdates);

    return profile as unknown as UserWithSession;
  } catch (error) {
    console.error('[linkUser] Error:', error);
    throw new Error(`Failed to link user: ${(error as Error).message}`);
  }
}

export default passport;
