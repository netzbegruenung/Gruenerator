/**
 * User profile management routes
 * Handles profile CRUD, beta features, user defaults, and account deletion
 */

import express, { Router, Response } from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { getQdrantDocumentService } from '../../services/document-services/DocumentSearchService/index.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { KeycloakApiClient } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import type {
  AuthRequest,
  ProfileUpdateBody,
  AvatarUpdateBody,
  BetaFeatureToggleBody,
  MessageColorUpdateBody,
  UserDefaultUpdateBody,
  DeleteAccountBody,
} from './types.js';

const log = createLogger('userProfile');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Profile Management Endpoints
// ============================================================================

router.get(
  '/profile',
  ensureAuthenticated as any,
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { display_name, username, avatar_robot_id, email, custom_prompt } =
        req.body as ProfileUpdateBody & { email?: string; custom_prompt?: string };

      if (avatar_robot_id && (avatar_robot_id < 1 || avatar_robot_id > 9)) {
        res.status(400).json({
          success: false,
          message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.',
        });
        return;
      }

      const updateData: Record<string, any> = {};

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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { avatar_robot_id } = req.body as AvatarUpdateBody;

      const data = await profileService.updateAvatar(req.user!.id, avatar_robot_id);

      if (req.user) {
        req.user.avatar_robot_id = avatar_robot_id;
      }

      if (req.session.passport && req.session.passport.user) {
        req.session.passport.user.avatar_robot_id = avatar_robot_id;
      }

      req.session.save((err) => {
        if (err) {
          log.error('[User Profile /profile/avatar PATCH] Session save error:', err);
        } else {
          log.debug(
            '[User Profile /profile/avatar PATCH] Session saved with avatar_robot_id:',
            avatar_robot_id
          );
        }
      });

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
  ensureAuthenticated as any,
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { feature, enabled } = req.body as BetaFeatureToggleBody;

      if (!feature || typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'Feature name und enabled status sind erforderlich.',
        });
        return;
      }

      const allowedFeatures = [
        'groups',
        'database',
        'sharepic',
        'anweisungen',
        'notebook',
        'advanced_editor',
        'collaborative_editing',
        'contentManagement',
        'canva',
        'chat',
        'labor',
        'sites',
        'interactiveAntrag',
        'autoSaveOnExport',
        'website',
        'vorlagen',
        'videoEditor',
        'igel_modus',
        'automatischPlanMode',
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
        profileService.updateUserSession(req.user, updatedProfile, feature, enabled);

        if (req.session.passport && req.session.passport.user) {
          profileService.updateUserSession(
            req.session.passport.user,
            updatedProfile,
            feature,
            enabled
          );
        }

        req.session.save((err) => {
          if (err) {
            log.error('[User Profile /profile/beta-features PATCH] Session save error:', err);
          }
        });
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { color } = req.body as MessageColorUpdateBody;

      if (!color || typeof color !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Farbe ist erforderlich.',
        });
        return;
      }

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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const profile = await profileService.getProfileById(req.user!.id);

      if (!profile) {
        res.status(404).json({
          success: false,
          message: 'Profil nicht gefunden.',
        });
        return;
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
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { generator, key, value } = req.body as { generator: string; key: string; value: any };

      if (!generator || !key) {
        res.status(400).json({
          success: false,
          message: 'Generator und Key sind erforderlich.',
        });
        return;
      }

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
// Igel-Modus (Grüne Jugend)
// ============================================================================

router.patch(
  '/profile/igel-modus',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const profileService = getProfileService();
      const { igel_modus } = req.body as { igel_modus: boolean };

      if (typeof igel_modus !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'Igel-Modus Status ist erforderlich.',
        });
        return;
      }

      await profileService.updateBetaFeatures(req.user!.id, 'igel_modus', igel_modus);

      log.debug(
        `[Igel Modus Change] User ${req.user!.id}: igel_modus ${igel_modus ? 'ENABLED' : 'DISABLED'}`
      );

      const updatedProfile = await profileService.getProfileById(req.user!.id);
      if (req.user && updatedProfile) {
        profileService.updateUserSession(req.user, updatedProfile, 'igel_modus', igel_modus);

        if (req.session.passport && req.session.passport.user) {
          profileService.updateUserSession(
            req.session.passport.user,
            updatedProfile,
            'igel_modus',
            igel_modus
          );
        }

        req.session.save((err) => {
          if (err) {
            log.error('[User Profile /profile/igel-modus PATCH] Session save error:', err);
          }
        });
      }

      res.json({
        success: true,
        igelModus: igel_modus,
        message: `Igel-Modus ${igel_modus ? 'aktiviert' : 'deaktiviert'}! Du bist ${igel_modus ? 'jetzt' : 'nicht mehr'} Mitglied der Grünen Jugend.`,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[User Profile /profile/igel-modus PATCH] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Aktualisieren des Igel-Modus.',
      });
    }
  }
);

// ============================================================================
// Account Deletion
// ============================================================================

router.delete(
  '/delete-account',
  ensureAuthenticated as any,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const keycloakId = req.user!.keycloak_id;

      const { confirm, confirmation, password } =
        (req.body as { confirm?: string; confirmation?: string; password?: string }) || {};
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
          const err = keycloakErr as any;
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

      // Step 4: Logout and clear session/cookie
      log.debug(`[User Delete] Step 4: Clearing session and cookies for user ${userId}`);
      req.logout?.(() => {});
      if (req.session) {
        try {
          await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
          log.debug(`[User Delete] Session destroyed for user ${userId}`);
        } catch (e) {
          const err = e as Error;
          log.warn(`[User Delete] Session destruction warning for user ${userId}:`, err?.message);
        }
      }
      res.clearCookie('gruenerator.sid', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
      log.debug(`[User Delete] Cookies cleared for user ${userId}`);

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
