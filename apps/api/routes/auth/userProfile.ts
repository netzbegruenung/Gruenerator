/**
 * User profile management routes
 * Handles profile CRUD, beta features, user defaults, and account deletion
 */

import { z } from 'zod';
import { fromNodeHeaders } from 'better-auth/node';
import express, { type Router, type Response } from 'express';

import { auth } from '../../config/betterAuth.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { getQdrantDocumentService } from '../../services/document-services/DocumentSearchService/index.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { KeycloakApiClient } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthRequest } from './types.js';

const log = createLogger('userProfile');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Zod Schemas
// ============================================================================

const profileUpdateSchema = z.object({
  display_name: z.string().optional(),
  username: z.string().optional(),
  avatar_robot_id: z.number().int().min(1).max(9).optional(),
  email: z.string().optional(),
  custom_prompt: z.string().optional(),
});

const avatarUpdateSchema = z.object({
  avatar_robot_id: z.number().int().min(1).max(9),
});

const betaFeatureToggleSchema = z.object({
  feature: z.string().min(1),
  enabled: z.boolean(),
});

const messageColorUpdateSchema = z.object({
  color: z.string().min(1),
});

const userDefaultUpdateSchema = z.object({
  generator: z.string().min(1),
  key: z.string().min(1),
  value: z.unknown(),
});

const notificationPreferencesSchema = z.object({
  category: z.string().min(1),
  channels: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    in_app: z.boolean().optional(),
  }),
});

const deleteAccountSchema = z.object({
  confirm: z.string().optional(),
  confirmation: z.string().optional(),
  password: z.string().optional(),
});

// ============================================================================
// Profile Management Endpoints
// ============================================================================

router.get(
  '/profile',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      let profile = await profileService.getProfileById(req.user!.id);

      if (!profile) {
        const basicProfile = {
          id: req.user!.id,
          email: req.user!.email,
          display_name: req.user!.display_name || req.user!.username || 'User',
          username: req.user!.username,
          keycloak_id: req.user!.keycloak_id,
          avatar_robot_id: 1,
        };

        profile = await profileService.createProfile(basicProfile);

        const enhancedNewProfile = {
          ...profile,
          is_sso_user: !!profile.keycloak_id,
        };

        res.json({
          success: true,
          user: enhancedNewProfile,
        });
        return;
      }

      const enhancedProfile = {
        ...profile,
        is_sso_user: !!profile.keycloak_id,
      };

      res.json({
        success: true,
        user: enhancedProfile,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden des Profils.',
      });
    }
  }
);

router.put(
  '/profile',
  ensureAuthenticated,
  validateBody(profileUpdateSchema),
  async (req: TypedRequest<z.infer<typeof profileUpdateSchema>>, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { display_name, username, avatar_robot_id, email, custom_prompt } = req.body;

      if (avatar_robot_id && (avatar_robot_id < 1 || avatar_robot_id > 9)) {
        res.status(400).json({
          success: false,
          message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.',
        });
        return;
      }

      const updateData: Record<string, string | number | null | undefined> = {};

      if (display_name !== undefined) updateData.display_name = display_name || null;
      if (username !== undefined) updateData.username = username || null;
      if (avatar_robot_id !== undefined) updateData.avatar_robot_id = avatar_robot_id;
      if (email !== undefined) updateData.email = email || null;
      if (custom_prompt !== undefined) updateData.custom_prompt = custom_prompt || null;

      log.debug(
        `[User Profile /profile PUT] Updating profile for user ${req.user!.id}:`,
        updateData
      );
      const data = await profileService.updateProfile(req.user!.id, updateData);

      if (updateData.avatar_robot_id !== undefined) {
        log.debug(
          `[User Profile /profile PUT] Avatar update result: avatar_robot_id=${data.avatar_robot_id}`
        );
      }

      if (req.user) {
        const preservedBetaFeatures = req.user.beta_features;
        Object.assign(req.user, data);
        if (preservedBetaFeatures) {
          req.user.beta_features = preservedBetaFeatures;
        }
      }

      res.json({
        success: true,
        profile: data,
        message: 'Profil erfolgreich aktualisiert!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile PUT] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren des Profils.',
      });
    }
  }
);

router.patch(
  '/profile/avatar',
  ensureAuthenticated,
  validateBody(avatarUpdateSchema),
  async (req: TypedRequest<z.infer<typeof avatarUpdateSchema>>, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { avatar_robot_id } = req.body;

      const data = await profileService.updateAvatar(req.user!.id, avatar_robot_id);

      if (req.user) {
        req.user.avatar_robot_id = avatar_robot_id;
      }

      res.json({
        success: true,
        profile: data,
        message: 'Avatar erfolgreich aktualisiert!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile/avatar PATCH] Error:', err);
      const statusCode = err.message.includes('must be between') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren des Avatars.',
      });
    }
  }
);

// ============================================================================
// Beta Features Endpoints
// ============================================================================

router.get(
  '/profile/beta-features',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const profile = await profileService.getProfileById(req.user!.id);

      if (!profile) {
        log.error('[User Profile /profile/beta-features GET] Profile not found');
        throw new Error('Profil nicht gefunden');
      }

      const mergedBetaFeatures = profileService.getMergedBetaFeatures(profile);

      res.json({
        success: true,
        betaFeatures: mergedBetaFeatures,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile/beta-features GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Beta Features.',
      });
    }
  }
);

router.patch(
  '/profile/beta-features',
  ensureAuthenticated,
  validateBody(betaFeatureToggleSchema),
  async (req: TypedRequest<z.infer<typeof betaFeatureToggleSchema>>, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { feature, enabled } = req.body;

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
        res.status(400).json({
          success: false,
          message: 'Unbekanntes Beta Feature.',
        });
        return;
      }

      const updatedProfile = await profileService.updateBetaFeatures(
        req.user!.id,
        feature,
        enabled
      );
      const updatedBetaFeatures = profileService.getMergedBetaFeatures(updatedProfile);

      log.debug(
        `[Beta Feature Change] User ${req.user!.id}: ${feature} ${enabled ? 'ENABLED' : 'DISABLED'}`
      );

      if (req.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profileService.updateUserSession(
          req.user as any,
          updatedProfile,
          feature,
          enabled
        );
      }

      res.json({
        success: true,
        betaFeatures: updatedBetaFeatures,
        message: 'Beta Features erfolgreich aktualisiert!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile/beta-features PATCH] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Beta Features.',
      });
    }
  }
);

// ============================================================================
// Message Color & User Defaults
// ============================================================================

router.patch(
  '/profile/message-color',
  ensureAuthenticated,
  validateBody(messageColorUpdateSchema),
  async (req: TypedRequest<z.infer<typeof messageColorUpdateSchema>>, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { color } = req.body;

      await profileService.updateChatColor(req.user!.id, color);

      res.json({
        success: true,
        messageColor: color,
        message: 'Nachrichtenfarbe erfolgreich aktualisiert!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile/message-color PATCH] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren der Nachrichtenfarbe.',
      });
    }
  }
);

router.get(
  '/profile/user-defaults',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      let profile = await profileService.getProfileById(req.user!.id);

      if (!profile) {
        profile = await profileService.createProfile({
          id: req.user!.id,
          email: req.user!.email,
          display_name: req.user!.display_name || req.user!.username || 'User',
          username: req.user!.username,
          keycloak_id: req.user!.keycloak_id,
          avatar_robot_id: 1,
        });
      }

      const userDefaults = profileService.getUserDefaults(profile);

      res.json({
        success: true,
        userDefaults,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile/user-defaults GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der User Defaults.',
      });
    }
  }
);

router.patch(
  '/profile/user-defaults',
  ensureAuthenticated,
  validateBody(userDefaultUpdateSchema),
  async (req: TypedRequest<z.infer<typeof userDefaultUpdateSchema>>, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { generator, key, value } = req.body;

      const updatedProfile = await profileService.updateUserDefault(
        req.user!.id,
        generator,
        key,
        value
      );
      const userDefaults = profileService.getUserDefaults(updatedProfile);

      log.debug(`[User Defaults Change] User ${req.user!.id}: ${generator}.${key} = ${value}`);

      res.json({
        success: true,
        userDefaults,
        message: 'Einstellung erfolgreich gespeichert!',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile/user-defaults PATCH] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Speichern der Einstellung.',
      });
    }
  }
);

// ============================================================================
// Notification Preferences (per-category, per-channel)
// ============================================================================

router.get(
  '/profile/notification-preferences',
  ensureAuthenticated,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { getPreferencesForUser, getDefaultPreferences } =
        await import('../../services/notifications/notificationPreferences.js');
      const preferences = await getPreferencesForUser(req.user!.id);
      const defaults = getDefaultPreferences();

      res.json({ success: true, preferences, defaults });
    } catch (error) {
      const err = error as Error;
      log.error('[Notification Preferences GET] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Laden der Benachrichtigungseinstellungen.',
      });
    }
  }
);

router.patch(
  '/profile/notification-preferences',
  ensureAuthenticated,
  validateBody(notificationPreferencesSchema),
  async (req: TypedRequest<z.infer<typeof notificationPreferencesSchema>>, res: Response): Promise<void> => {
    try {
      const { category, channels } = req.body;

      const { ALL_NOTIFICATION_TYPES } = await import('../../services/notifications/types.js');
      if (!(ALL_NOTIFICATION_TYPES as readonly string[]).includes(category)) {
        res.status(400).json({
          success: false,
          message: `Unbekannter Benachrichtigungstyp: ${category}`,
        });
        return;
      }

      const profileService = getProfileService();
      const profile = await profileService.getProfileById(req.user!.id);
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

      await profileService.updateUserDefault(req.user!.id, 'notifications', category, merged);

      const { getPreferencesForUser } =
        await import('../../services/notifications/notificationPreferences.js');
      const preferences = await getPreferencesForUser(req.user!.id);

      log.debug(
        `[Notification Preferences] User ${req.user!.id}: ${category} = ${JSON.stringify(merged)}`
      );

      res.json({
        success: true,
        preferences,
        message: 'Benachrichtigungseinstellung gespeichert.',
      });
    } catch (error) {
      const err = error as Error;
      log.error('[Notification Preferences PATCH] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Speichern der Benachrichtigungseinstellung.',
      });
    }
  }
);

// ============================================================================
// Account Deletion
// ============================================================================

router.delete(
  '/delete-account',
  ensureAuthenticated,
  validateBody(deleteAccountSchema),
  async (req: TypedRequest<z.infer<typeof deleteAccountSchema>>, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const keycloakId = req.user!.keycloak_id;

      const { confirm, confirmation, password } = req.body;
      const qsConfirm = req.query?.confirm as string | undefined;
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
        res.status(400).json({
          success: false,
          error: 'invalid_confirmation',
          message: 'Bestätigungstext fehlt oder ist falsch. Bitte gib "löschen" ein.',
        });
        return;
      }

      log.debug(`[User Delete] Starting account deletion process for user ${userId}`);
      log.debug(
        `[User Delete] User email: ${req.user!.email || 'N/A'}, username: ${req.user!.username || 'N/A'}, keycloak_id: ${keycloakId || 'N/A'}`
      );

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
          log.debug(`[User Delete] Keycloak client initialized, attempting deletion...`);

          await keycloakClient.deleteUser(keycloakId);
          log.debug(`[User Delete] ✅ Successfully deleted user from Keycloak: ${keycloakId}`);
        } catch (keycloakErr) {
          const err = keycloakErr as Error & {
            code?: string;
            response?: { status?: number; statusText?: string; data?: unknown };
          };
          log.error(`[User Delete] ❌ Error deleting user from Keycloak ${keycloakId}:`, err);
          log.error(`[User Delete] Keycloak error details:`, {
            message: err.message,
            code: err.code,
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            stack: err.stack,
          });
          log.warn(`[User Delete] ⚠️ Continuing with database deletion despite Keycloak error`);
        }
      } else {
        log.debug(
          `[User Delete] Step 2: Skipping Keycloak deletion - no keycloak_id found for user ${userId}`
        );
        log.debug(`[User Delete] User object keycloak_id field:`, req.user!.keycloak_id);
      }

      // Step 3: Delete user profile (cascades to most user-owned data)
      log.debug(
        `[User Delete] Step 3: Deleting user profile and cascading data for user ${userId}`
      );
      const profileService = getProfileService();
      const deleteResult = await profileService.deleteProfile(userId);
      log.debug(`[User Delete] Profile deletion result for user ${userId}:`, deleteResult);

      // Step 4: Revoke Better Auth session
      log.debug(`[User Delete] Step 4: Revoking sessions for user ${userId}`);
      try {
        await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
      } catch {
        // Session may already be gone after profile deletion cascade
      }

      log.debug(`[User Delete] ✅ Account deletion completed successfully for user ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Dein Account wurde erfolgreich gelöscht.',
      });
    } catch (error) {
      const err = error as Error;
      log.error(`[User Delete] ❌ Error during account deletion for user ${req.user?.id}:`, err);
      res.status(500).json({
        success: false,
        error: 'deletion_failed',
        message: 'Es gab einen Fehler beim Löschen deines Accounts. Bitte kontaktiere den Support.',
      });
    }
  }
);

export default router;
