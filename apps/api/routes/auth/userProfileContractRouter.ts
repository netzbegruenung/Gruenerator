/**
 * ts-rest contract router for user profile endpoints.
 *
 * Implements the userProfileContract from @gruenerator/contracts.
 * Mount this BEFORE the legacy userProfile router in routes.ts so that
 * matched routes are handled here; unmatched paths fall through to the
 * legacy router automatically.
 *
 * Usage in routes.ts:
 *   import { mountUserProfileContractRouter } from './routes/auth/userProfileContractRouter.js';
 *   mountUserProfileContractRouter(app);
 */

import { userProfileContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { fromNodeHeaders } from 'better-auth/node';

import { auth } from '../../config/betterAuth.js';
import { getQdrantDocumentService } from '../../services/document-services/DocumentSearchService/index.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { KeycloakApiClient } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('userProfileContract');

function getUserId(req: Request): string {
  return (req.user as UserProfile).id;
}

function getUser(req: Request): UserProfile {
  return req.user as UserProfile;
}

const s = initServer();

export const userProfileContractRouter = s.router(userProfileContract, {
  getProfile: async (args) => {
    try {
      const user = getUser(args.req);
      const profileService = getProfileService();
      let profile = await profileService.getProfileById(user.id);

      if (!profile) {
        const basicProfile = {
          id: user.id,
          email: user.email,
          display_name: user.display_name || user.username || 'User',
          username: user.username,
          keycloak_id: user.keycloak_id,
          avatar_robot_id: 1,
        };
        profile = await profileService.createProfile(basicProfile);
      }

      return {
        status: 200 as const,
        body: {
          success: true as const,
          user: { ...profile, is_sso_user: !!profile.keycloak_id },
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract GET /profile] Error:', err);
      return {
        status: 500 as const,
        body: { success: false as const, message: err.message || 'Fehler beim Laden des Profils.' },
      };
    }
  },

  updateProfile: async (args) => {
    try {
      const user = getUser(args.req);
      const profileService = getProfileService();
      const { display_name, username, avatar_robot_id, email, custom_prompt } = args.body;

      if (avatar_robot_id !== undefined && (avatar_robot_id < 1 || avatar_robot_id > 9)) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.',
          },
        };
      }

      const updateData: Record<string, string | number | null | undefined> = {};
      if (display_name !== undefined) updateData.display_name = display_name || null;
      if (username !== undefined) updateData.username = username || null;
      if (avatar_robot_id !== undefined) updateData.avatar_robot_id = avatar_robot_id;
      if (email !== undefined) updateData.email = email || null;
      if (custom_prompt !== undefined) updateData.custom_prompt = custom_prompt || null;

      log.debug(
        `[Profile Contract PUT /profile] Updating profile for user ${user.id}:`,
        updateData
      );
      const data = await profileService.updateProfile(user.id, updateData);

      const sessionUser = args.req.user as UserProfile | undefined;
      if (sessionUser) {
        const preservedBetaFeatures = sessionUser.beta_features;
        Object.assign(sessionUser, data);
        if (preservedBetaFeatures) {
          sessionUser.beta_features = preservedBetaFeatures;
        }
      }

      return {
        status: 200 as const,
        body: {
          success: true as const,
          profile: data,
          message: 'Profil erfolgreich aktualisiert!',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PUT /profile] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Aktualisieren des Profils.',
        },
      };
    }
  },

  updateAvatar: async (args) => {
    try {
      const userId = getUserId(args.req);
      const profileService = getProfileService();
      const { avatar_robot_id } = args.body;

      const data = await profileService.updateAvatar(userId, avatar_robot_id);

      const sessionUser = args.req.user as UserProfile | undefined;
      if (sessionUser) {
        sessionUser.avatar_robot_id = avatar_robot_id;
      }

      return {
        status: 200 as const,
        body: {
          success: true as const,
          profile: data,
          message: 'Avatar erfolgreich aktualisiert!',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PATCH /profile/avatar] Error:', err);
      const statusCode = err.message.includes('must be between') ? 400 : 500;
      return {
        status: statusCode as 400 | 500,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Aktualisieren des Avatars.',
        },
      };
    }
  },

  getBetaFeatures: async (args) => {
    try {
      const userId = getUserId(args.req);
      const profileService = getProfileService();
      const profile = await profileService.getProfileById(userId);

      if (!profile) {
        log.error('[Profile Contract GET /profile/beta-features] Profile not found');
        throw new Error('Profil nicht gefunden');
      }

      const mergedBetaFeatures = profileService.getMergedBetaFeatures(profile);

      return {
        status: 200 as const,
        body: { success: true as const, betaFeatures: mergedBetaFeatures },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract GET /profile/beta-features] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Laden der Beta Features.',
        },
      };
    }
  },

  updateBetaFeatures: async (args) => {
    try {
      const userId = getUserId(args.req);
      const profileService = getProfileService();
      const { feature, enabled } = args.body;

      const allowedFeatures = [
        'database',
        'sharepic',
        'anweisungen',
        'notebook',
        'advanced_editor',
        'collaborative_editing',
        'collab',
        'contentManagement',
        'chat',
        'labor',
        'sites',
        'interactiveAntrag',
        'website',
        'vorlagen',
        'videoEditor',
        'prompts',
        'memories',
      ];

      if (!allowedFeatures.includes(feature)) {
        return {
          status: 400 as const,
          body: { success: false as const, message: 'Unbekanntes Beta Feature.' },
        };
      }

      const updatedProfile = await profileService.updateBetaFeatures(userId, feature, enabled);
      const updatedBetaFeatures = profileService.getMergedBetaFeatures(updatedProfile);

      log.debug(
        `[Beta Feature Change] User ${userId}: ${feature} ${enabled ? 'ENABLED' : 'DISABLED'}`
      );

      const sessionUser = args.req.user as UserProfile | undefined;
      if (sessionUser) {
        profileService.updateUserSession(
          sessionUser as unknown as {
            beta_features?: Record<string, boolean>;
            [key: string]: unknown;
          },
          updatedProfile,
          feature,
          enabled
        );
      }

      return {
        status: 200 as const,
        body: {
          success: true as const,
          betaFeatures: updatedBetaFeatures,
          message: 'Beta Features erfolgreich aktualisiert!',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PATCH /profile/beta-features] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Aktualisieren der Beta Features.',
        },
      };
    }
  },

  updateMessageColor: async (args) => {
    try {
      const userId = getUserId(args.req);
      const profileService = getProfileService();
      const { color } = args.body;

      await profileService.updateChatColor(userId, color);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          messageColor: color,
          message: 'Nachrichtenfarbe erfolgreich aktualisiert!',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PATCH /profile/message-color] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Aktualisieren der Nachrichtenfarbe.',
        },
      };
    }
  },

  getUserDefaults: async (args) => {
    try {
      const user = getUser(args.req);
      const profileService = getProfileService();
      let profile = await profileService.getProfileById(user.id);

      if (!profile) {
        profile = await profileService.createProfile({
          id: user.id,
          email: user.email,
          display_name: user.display_name || user.username || 'User',
          username: user.username,
          keycloak_id: user.keycloak_id,
          avatar_robot_id: 1,
        });
      }

      const userDefaults = profileService.getUserDefaults(profile);
      log.info(
        `[User Defaults GET contract] user=${user.id} keys=${JSON.stringify(Object.keys(userDefaults))} profile.roles=${JSON.stringify((userDefaults as { profile?: { roles?: unknown } }).profile?.roles)}`
      );

      return {
        status: 200 as const,
        body: { success: true as const, userDefaults },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract GET /profile/user-defaults] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Laden der User Defaults.',
        },
      };
    }
  },

  updateUserDefaults: async (args) => {
    try {
      const userId = getUserId(args.req);
      const profileService = getProfileService();
      const { generator, key, value } = args.body;

      log.info(
        `[User Defaults PATCH contract] user=${userId} gen=${generator} key=${key} value=${JSON.stringify(value)}`
      );
      const updatedProfile = await profileService.updateUserDefault(userId, generator, key, value);
      const userDefaults = profileService.getUserDefaults(updatedProfile);
      log.info(
        `[User Defaults PATCH contract] result user=${userId} keys=${JSON.stringify(Object.keys(userDefaults))} profile.roles=${JSON.stringify((userDefaults as { profile?: { roles?: unknown } }).profile?.roles)}`
      );

      return {
        status: 200 as const,
        body: {
          success: true as const,
          userDefaults,
          message: 'Einstellung erfolgreich gespeichert!',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PATCH /profile/user-defaults] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Speichern der Einstellung.',
        },
      };
    }
  },

  getNotificationPreferences: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { getPreferencesForUser, getDefaultPreferences } =
        await import('../../services/notifications/notificationPreferences.js');
      const preferences = await getPreferencesForUser(userId);
      const defaults = getDefaultPreferences();

      return {
        status: 200 as const,
        body: { success: true as const, preferences, defaults },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract GET /profile/notification-preferences] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Laden der Benachrichtigungseinstellungen.',
        },
      };
    }
  },

  updateNotificationPreferences: async (args) => {
    try {
      const userId = getUserId(args.req);
      const { category, channels } = args.body;

      const { ALL_NOTIFICATION_TYPES } = await import('../../services/notifications/types.js');
      if (!(ALL_NOTIFICATION_TYPES as readonly string[]).includes(category)) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message: `Unbekannter Benachrichtigungstyp: ${category}`,
          },
        };
      }

      const profileService = getProfileService();
      const profile = await profileService.getProfileById(userId);
      const currentNotifications = profile?.user_defaults?.notifications ?? {};
      const { getDefaultPreferences } =
        await import('../../services/notifications/notificationPreferences.js');
      const defaults = getDefaultPreferences();
      const currentChannels = currentNotifications[category];

      let base: { email: boolean; push: boolean; in_app: boolean };
      if (
        currentChannels &&
        typeof currentChannels === 'object' &&
        !Array.isArray(currentChannels)
      ) {
        base = currentChannels as { email: boolean; push: boolean; in_app: boolean };
      } else if (typeof currentChannels === 'boolean') {
        base = {
          email: currentChannels,
          push: defaults[category as keyof typeof defaults]?.push ?? true,
          in_app: defaults[category as keyof typeof defaults]?.in_app ?? true,
        };
      } else {
        base = {
          ...(defaults[category as keyof typeof defaults] ?? {
            email: true,
            push: true,
            in_app: true,
          }),
        };
      }

      const merged = {
        email: typeof channels.email === 'boolean' ? channels.email : base.email,
        push: typeof channels.push === 'boolean' ? channels.push : base.push,
        in_app: typeof channels.in_app === 'boolean' ? channels.in_app : base.in_app,
      };

      await profileService.updateUserDefault(userId, 'notifications', category, merged);

      const { getPreferencesForUser } =
        await import('../../services/notifications/notificationPreferences.js');
      const preferences = await getPreferencesForUser(userId);

      log.debug(
        `[Notification Preferences] User ${userId}: ${category} = ${JSON.stringify(merged)}`
      );

      return {
        status: 200 as const,
        body: {
          success: true as const,
          preferences,
          message: 'Benachrichtigungseinstellung gespeichert.',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PATCH /profile/notification-preferences] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: err.message || 'Fehler beim Speichern der Benachrichtigungseinstellung.',
        },
      };
    }
  },

  deleteAccount: async (args) => {
    try {
      const user = getUser(args.req);
      const userId = user.id;
      const keycloakId = user.keycloak_id;

      const { confirm, confirmation, password } = args.body;
      const qsConfirm = args.req.query?.confirm as string | undefined;
      const rawConfirm = confirm || confirmation || password || qsConfirm || '';
      const normalized = String(rawConfirm).trim().toLowerCase();

      const acceptedPhrases = new Set([
        'löschen',
        'loeschen',
        'konto löschen',
        'konto loeschen',
        'delete',
      ]);

      if (!acceptedPhrases.has(normalized)) {
        log.debug(`[User Delete] Invalid confirmation attempt for user ${userId}: "${rawConfirm}"`);
        return {
          status: 400 as const,
          body: {
            success: false as const,
            error: 'invalid_confirmation',
            message: 'Bestätigungstext fehlt oder ist falsch. Bitte gib "löschen" ein.',
          },
        };
      }

      log.debug(`[User Delete] Starting account deletion process for user ${userId}`);

      // Step 1: Delete vectors in Qdrant (best-effort)
      log.debug(`[User Delete] Step 1: Deleting Qdrant vectors for user ${userId}`);
      try {
        const qdrantDocService = getQdrantDocumentService();
        await qdrantDocService.deleteUserDocuments(userId);
        log.debug(`[User Delete] Successfully deleted Qdrant vectors for user ${userId}`);
      } catch (vectorErr) {
        const err = vectorErr as Error;
        log.warn(`[User Delete] Warning deleting Qdrant vectors for user ${userId}:`, err.message);
      }

      // Step 2: Delete from Keycloak (if keycloak_id exists)
      if (keycloakId) {
        log.debug(`[User Delete] Step 2: Deleting user from Keycloak with ID ${keycloakId}`);
        try {
          const keycloakClient = new KeycloakApiClient();
          await keycloakClient.deleteUser(keycloakId);
          log.debug(`[User Delete] Successfully deleted user from Keycloak: ${keycloakId}`);
        } catch (keycloakErr) {
          const err = keycloakErr as Error & {
            code?: string;
            response?: { status?: number; statusText?: string; data?: unknown };
          };
          log.error(`[User Delete] Error deleting user from Keycloak ${keycloakId}:`, err);
          log.warn(`[User Delete] Continuing with database deletion despite Keycloak error`);
        }
      }

      // Step 3: Delete user profile (cascades to most user-owned data)
      log.debug(`[User Delete] Step 3: Deleting user profile for user ${userId}`);
      const profileService = getProfileService();
      const deleteResult = await profileService.deleteProfile(userId);
      log.debug(`[User Delete] Profile deletion result for user ${userId}:`, deleteResult);

      // Step 4: Revoke Better Auth session
      log.debug(`[User Delete] Step 4: Revoking sessions for user ${userId}`);
      try {
        await auth.api.signOut({ headers: fromNodeHeaders(args.req.headers) });
      } catch {
        // Session may already be gone after profile deletion cascade
      }

      log.debug(`[User Delete] Account deletion completed successfully for user ${userId}`);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Dein Account wurde erfolgreich gelöscht.',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error(`[User Delete] Error during account deletion:`, err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          error: 'deletion_failed',
          message:
            'Es gab einen Fehler beim Löschen deines Accounts. Bitte kontaktiere den Support.',
        },
      };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts BEFORE mounting the legacy userProfile router.
 */
export function mountUserProfileContractRouter(app: Application): void {
  createExpressEndpoints(userProfileContract, userProfileContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userProfileContract'),
  });
}
