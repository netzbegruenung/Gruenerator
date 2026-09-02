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
import { setUserLocale } from '../../services/localization/localeCache.js';
import { assignInstanceRole } from '../../services/roles/instanceRoleAssignment.js';
import { getProfileService } from '../../services/user/ProfileService.js';
import { forwardBetterAuthCookies } from '../../utils/betterAuthBridge.js';
import { refreshSessionUserSnapshot } from '../../utils/betterAuthSessionUser.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { KeycloakApiClient } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request, Response } from 'express';

const log = createLogger('userProfileContract');

function getUserId(req: Request): string {
  return (req.user as UserProfile).id;
}

function getUser(req: Request): UserProfile {
  return req.user as UserProfile;
}

/**
 * Push a Drizzle profile write into both Better Auth session caches, in order.
 *
 * A profile write bypasses Better Auth entirely, so two independent caches keep
 * serving the pre-write user and the change silently reverts on reload:
 *
 *  1. **Secondary storage (Redis).** `ba:<token>` holds a user snapshot frozen
 *     at session creation and kept for the full 30-day session lifetime;
 *     `getSession` resolves the user from it, and `disableCookieCache` does NOT
 *     reach past it. Must be refreshed FIRST — otherwise step 2 just re-signs
 *     the stale copy.
 *  2. **The 300s `ba.session_data` cookie cache.** Refreshed by re-reading the
 *     session with `disableCookieCache` (which now sees the fresh snapshot) and
 *     forwarding the resulting Set-Cookie to the browser.
 */
async function refreshSessionCaches(req: Request, res: Response): Promise<void> {
  await refreshSessionUserSnapshot(getUserId(req));
  try {
    const betterAuthResponse = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true },
      asResponse: true,
    });
    forwardBetterAuthCookies(res, betterAuthResponse);
  } catch (err) {
    log.warn('[Profile Contract] session cache refresh threw: %s', (err as Error).message);
  }
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
        body: {
          success: false as const,
          message: toUserFacingMessage(err) || 'Fehler beim Laden des Profils.',
        },
      };
    }
  },

  updateProfile: async (args) => {
    try {
      const user = getUser(args.req);
      const profileService = getProfileService();
      const {
        display_name,
        username,
        avatar_robot_id,
        custom_prompt,
        default_startpage,
        feedback_button,
        reduce_motion,
        reduce_transparency,
        show_skip_link,
        memory_enabled,
        ai_consent,
      } = args.body;

      const updateData: Record<string, string | number | boolean | null | undefined> = {};
      if (display_name !== undefined) updateData.display_name = display_name || null;
      if (username !== undefined) updateData.username = username || null;
      if (avatar_robot_id !== undefined) updateData.avatar_robot_id = avatar_robot_id;
      // SECURITY: `email` is deliberately NOT self-settable here. Admin elevation
      // is derived from the profile email (isAdminByEmail → ADMIN_EMAILS), and this
      // path bypasses Better Auth's verified email-change flow, so honouring a
      // client-supplied email would let any user promote themselves to admin by
      // setting a known admin address. The IdP (Keycloak) is authoritative for email.
      if (custom_prompt !== undefined) updateData.custom_prompt = custom_prompt || null;
      if (default_startpage !== undefined) updateData.default_startpage = default_startpage;
      if (feedback_button !== undefined) updateData.feedback_button = feedback_button;
      if (reduce_motion !== undefined) updateData.reduce_motion = reduce_motion;
      if (reduce_transparency !== undefined) updateData.reduce_transparency = reduce_transparency;
      if (show_skip_link !== undefined) updateData.show_skip_link = show_skip_link;
      if (memory_enabled !== undefined) updateData.memory_enabled = memory_enabled;
      // Der Zeitstempel kommt vom Server, nicht vom Client: er ist der Nachweis
      // der Einwilligung (Art. 7 Abs. 1 DSGVO). Widerruf löscht ihn, damit der
      // Dialog beim nächsten Aufruf wieder erscheint.
      if (ai_consent !== undefined)
        updateData.ai_consent_at = ai_consent ? new Date().toISOString() : null;

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

      // Every column written here is also carried on the Better Auth session
      // user the frontend boots from, so the caches have to learn about the
      // Drizzle write — otherwise the next reload serves the pre-write values.
      if (Object.keys(updateData).length > 0) {
        await refreshSessionCaches(args.req, args.res);
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
          message: toUserFacingMessage(err) || 'Fehler beim Aktualisieren des Profils.',
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
      await refreshSessionCaches(args.req, args.res);

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
          message: toUserFacingMessage(err) || 'Fehler beim Aktualisieren des Avatars.',
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
          message: toUserFacingMessage(err) || 'Fehler beim Laden der Beta Features.',
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
          message: toUserFacingMessage(err) || 'Fehler beim Aktualisieren der Beta Features.',
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
      await refreshSessionCaches(args.req, args.res);

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
          message: toUserFacingMessage(err) || 'Fehler beim Aktualisieren der Nachrichtenfarbe.',
        },
      };
    }
  },

  updateChatBackground: async (args) => {
    try {
      const userId = getUserId(args.req);
      const profileService = getProfileService();
      const { background } = args.body;

      await profileService.updateChatBackground(userId, background);

      // Without this the cached session keeps the old preset for the rest of
      // the session's 30-day life and the background visibly reverts to the
      // `sunrise` fallback on the next reload.
      await refreshSessionCaches(args.req, args.res);

      const sessionUser = args.req.user as UserProfile | undefined;
      if (sessionUser) sessionUser.chat_background = background;

      return {
        status: 200 as const,
        body: {
          success: true as const,
          chatBackground: background,
          message: 'Hintergrund erfolgreich aktualisiert!',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PATCH /profile/chat-background] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: toUserFacingMessage(err, 'Fehler beim Aktualisieren des Hintergrunds.'),
        },
      };
    }
  },

  updateLocale: async (args) => {
    try {
      const user = getUser(args.req);
      const profileService = getProfileService();
      const { locale } = args.body;

      // `locale_source: 'user'` macht die Wahl unantastbar: `syncLocaleFromProvider`
      // überspringt sie ab jetzt bei jedem Login. Ohne diese Markierung setzte ein
      // Login über einen deutschen IdP die Korrektur still wieder zurück.
      await profileService.updateProfile(user.id, { locale, locale_source: 'user' });

      // Write through the DB-backed locale cache the auth middleware reads from,
      // so the change is visible on the very next request across all workers.
      await setUserLocale(user.id, locale);

      // Keep the in-memory user for the rest of this request consistent...
      const sessionUser = args.req.user as UserProfile | undefined;
      if (sessionUser) sessionUser.locale = locale;
      // ...and refresh Better Auth's session caches so the next getSession()
      // (page reload, new request, chat) sees the new locale instead of the
      // stale cached one — otherwise the switch reverts on the next reload.
      await refreshSessionCaches(args.req, args.res);

      log.debug(`[Profile Contract PUT /locale] User ${user.id} locale set to ${locale}`);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          locale,
          message: 'Sprache erfolgreich aktualisiert!',
        },
      };
    } catch (error) {
      const err = error as Error;
      log.error('[Profile Contract PUT /locale] Error:', err);
      return {
        status: 500 as const,
        body: {
          success: false as const,
          message: toUserFacingMessage(err) || 'Fehler beim Aktualisieren der Sprache.',
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

      // Eine Instanz mit genau einem Rollen-Angebot vergibt es selbst, statt
      // eine Frage mit einer möglichen Antwort zu stellen. Auf allen anderen
      // ein reiner `null`-Check ohne DB-Zugriff.
      profile = await assignInstanceRole(profile);

      const userDefaults = profileService.getUserDefaults(profile);

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
          message: toUserFacingMessage(err) || 'Fehler beim Laden der User Defaults.',
        },
      };
    }
  },

  updateUserDefaults: async (args) => {
    try {
      const userId = getUserId(args.req);
      const profileService = getProfileService();
      const { generator, key, value } = args.body;

      const updatedProfile = await profileService.updateUserDefault(userId, generator, key, value);
      const userDefaults = profileService.getUserDefaults(updatedProfile);

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
          message: toUserFacingMessage(err) || 'Fehler beim Speichern der Einstellung.',
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
