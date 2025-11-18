import express from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getProfileService } from '../../services/ProfileService.mjs';
import { getQdrantDocumentService } from '../../services/DocumentSearchService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { KeycloakApiClient } from '../../utils/keycloakApiClient.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();


// === PROFILE MANAGEMENT ENDPOINTS ===

// Get user profile
router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();

    let profile = await profileService.getProfileById(req.user.id);

    if (!profile) {
      const basicProfile = {
        id: req.user.id,
        display_name: req.user.display_name || req.user.username || 'User',
        username: req.user.username,
        keycloak_id: req.user.keycloak_id,
        avatar_robot_id: 1
      };
      
      profile = await profileService.createProfile(basicProfile);

      const enhancedNewProfile = {
        ...profile,
        is_sso_user: !!profile.keycloak_id // Detect SSO users
      };
      
      return res.json({ 
        success: true, 
        user: enhancedNewProfile
      });
    }

    const enhancedProfile = {
      ...profile,
      is_sso_user: !!profile.keycloak_id // Detect SSO users
    };
    
    res.json({ 
      success: true, 
      user: enhancedProfile
    });
    
  } catch (error) {
    console.error('[User Profile /profile GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Laden des Profils.'
    });
  }
});

// Update user profile
router.put('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    const { display_name, username, avatar_robot_id, email } = req.body;

    // Validate input
    if (avatar_robot_id && (avatar_robot_id < 1 || avatar_robot_id > 9)) {
      return res.status(400).json({
        success: false,
        message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.'
      });
    }

    // Prepare update data - NEVER include beta_features here
    // Beta features are managed exclusively via /profile/beta-features endpoint
    const updateData = {};

    if (display_name !== undefined) updateData.display_name = display_name || null;
    if (username !== undefined) updateData.username = username || null;
    if (avatar_robot_id !== undefined) updateData.avatar_robot_id = avatar_robot_id;

    // Handle email updates in profiles table
    if (email !== undefined) {
      updateData.email = email || null;
    }

    // Update profile using ProfileService
    console.log(`[User Profile /profile PUT] Updating profile for user ${req.user.id}:`, updateData);
    const data = await profileService.updateProfile(req.user.id, updateData);
    
    // Log the result of the update
    if (updateData.avatar_robot_id !== undefined) {
      console.log(`[User Profile /profile PUT] Avatar update result: avatar_robot_id=${data.avatar_robot_id}`);
    }
    
    // Update user object in session while preserving beta_features
    if (req.user) {
      const preservedBetaFeatures = req.user.beta_features;
      Object.assign(req.user, data);
      // Restore beta_features from session (don't let DB overwrite them)
      if (preservedBetaFeatures) {
        req.user.beta_features = preservedBetaFeatures;
      }
    }
    
    let message = 'Profil erfolgreich aktualisiert!';
    
    res.json({ 
      success: true, 
      profile: data,
      message: message
    });
    
  } catch (error) {
    console.error('[User Profile /profile PUT] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren des Profils.'
    });
  }
});

// Update user avatar
router.patch('/profile/avatar', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    const { avatar_robot_id } = req.body;
    
    // ProfileService handles validation and database update
    const data = await profileService.updateAvatar(req.user.id, avatar_robot_id);
    
    // Update session with the new avatar (HTTP layer responsibility)
    if (req.user) {
      req.user.avatar_robot_id = avatar_robot_id;
    }
    
    if (req.session.passport && req.session.passport.user) {
      req.session.passport.user.avatar_robot_id = avatar_robot_id;
    }
    
    // Force session save to persist the avatar change
    req.session.save((err) => {
      if (err) {
        console.error('[User Profile /profile/avatar PATCH] Session save error:', err);
      } else {
        console.log('[User Profile /profile/avatar PATCH] Session saved with avatar_robot_id:', avatar_robot_id);
      }
    });
    
    res.json({ 
      success: true, 
      profile: data,
      message: 'Avatar erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[User Profile /profile/avatar PATCH] Error:', error);
    // Return validation errors from ProfileService
    const statusCode = error.message.includes('must be between') ? 400 : 500;
    res.status(statusCode).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren des Avatars.'
    });
  }
});

// Get user beta features
router.get('/profile/beta-features', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    
    // Get profile from database using ProfileService
    const profile = await profileService.getProfileById(req.user.id);
    
    if (!profile) {
      console.error('[User Profile /profile/beta-features GET] Profile not found');
      throw new Error('Profil nicht gefunden');
    }
    
    // Use profiles table data only
    const profileBetaFeatures = profile.beta_features || {};
    
    // Get merged beta features from ProfileService (includes individual settings)
    const mergedBetaFeatures = profileService.getMergedBetaFeatures(profile);
    
    res.json({ 
      success: true, 
      betaFeatures: mergedBetaFeatures
    });
    
  } catch (error) {
    console.error('[User Profile /profile/beta-features GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Laden der Beta Features.'
    });
  }
});

// Update user beta features
router.patch('/profile/beta-features', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    const { feature, enabled } = req.body;
    
    if (!feature || typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Feature name und enabled status sind erforderlich.'
      });
    }
    
    // List of allowed beta features - must match frontend expectations
    const allowedFeatures = [
      'groups',
      'database',
      'sharepic',
      'anweisungen',
      'you',
      'qa',
      'advanced_editor',
      'collaborative_editing',
      'customGruenerator',
      'e_learning',
      'memory',
      'contentManagement',
      'canva',
      'chat',
      'labor',
      // Profile settings treated as beta features for consistency
      'igel_modus',
      'bundestag_api_enabled'
    ];
    if (!allowedFeatures.includes(feature)) {
      return res.status(400).json({
        success: false,
        message: 'Unbekanntes Beta Feature.'
      });
    }
    
    // Update beta features using ProfileService
    const updatedProfile = await profileService.updateBetaFeatures(req.user.id, feature, enabled);
    
    // Get updated beta features for response using ProfileService
    const updatedBetaFeatures = profileService.getMergedBetaFeatures(updatedProfile);
    
    // Log beta feature change
    console.log(`[Beta Feature Change] User ${req.user.id}: ${feature} ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Update session for immediate UI feedback using ProfileService
    if (req.user) {
      profileService.updateUserSession(req.user, updatedProfile, feature, enabled);
      
      // Update session.passport.user as well
      if (req.session.passport && req.session.passport.user) {
        profileService.updateUserSession(req.session.passport.user, updatedProfile, feature, enabled);
      }
      
      // Force session save to persist the updated user object
      req.session.save((err) => {
        if (err) {
          console.error('[User Profile /profile/beta-features PATCH] Session save error:', err);
        }
      });
    }
    
    res.json({ 
      success: true, 
      betaFeatures: updatedBetaFeatures,
      message: 'Beta Features erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[User Profile /profile/beta-features PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Beta Features.'
    });
  }
});

// Update user message color
router.patch('/profile/message-color', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    const { color } = req.body;
    
    if (!color || typeof color !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Farbe ist erforderlich.'
      });
    }
    
    // Update chat_color using ProfileService
    await profileService.updateChatColor(req.user.id, color);
    
    res.json({ 
      success: true, 
      messageColor: color,
      message: 'Nachrichtenfarbe erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[User Profile /profile/message-color PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Nachrichtenfarbe.'
    });
  }
});

// Update user memory settings
router.patch('/profile/memory-settings', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    const { memory_enabled } = req.body;
    
    if (typeof memory_enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Memory enabled status ist erforderlich.'
      });
    }
    
    // Update memory_enabled using ProfileService
    await profileService.updateMemorySettings(req.user.id, memory_enabled);
    
    res.json({ 
      success: true, 
      memoryEnabled: memory_enabled,
      message: 'Memory-Einstellungen erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[User Profile /profile/memory-settings PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Memory-Einstellungen.'
    });
  }
});

// Update user Igel-Modus (Grüne Jugend membership)
router.patch('/profile/igel-modus', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    const { igel_modus } = req.body;
    
    if (typeof igel_modus !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Igel-Modus Status ist erforderlich.'
      });
    }
    
    // Update igel_modus using ProfileService (through beta features)
    await profileService.updateBetaFeatures(req.user.id, 'igel_modus', igel_modus);
    
    // Log igel modus change
    console.log(`[Igel Modus Change] User ${req.user.id}: igel_modus ${igel_modus ? 'ENABLED' : 'DISABLED'}`);
    
    // Get updated profile and update session using ProfileService
    const updatedProfile = await profileService.getProfileById(req.user.id);
    if (req.user) {
      profileService.updateUserSession(req.user, updatedProfile, 'igel_modus', igel_modus);
      
      if (req.session.passport && req.session.passport.user) {
        profileService.updateUserSession(req.session.passport.user, updatedProfile, 'igel_modus', igel_modus);
      }
      
      req.session.save((err) => {
        if (err) {
          console.error('[User Profile /profile/igel-modus PATCH] Session save error:', err);
        }
      });
    }
    
    res.json({ 
      success: true, 
      igelModus: igel_modus,
      message: `Igel-Modus ${igel_modus ? 'aktiviert' : 'deaktiviert'}! Du bist ${igel_modus ? 'jetzt' : 'nicht mehr'} Mitglied der Grünen Jugend.`
    });
    
  } catch (error) {
    console.error('[User Profile /profile/igel-modus PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren des Igel-Modus.'
    });
  }
});

// Update user Bundestag API setting
router.patch('/profile/bundestag-api', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    const { bundestag_api_enabled } = req.body;
    
    if (typeof bundestag_api_enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Bundestag API Status ist erforderlich.'
      });
    }
    
    // Update bundestag_api_enabled using ProfileService (through beta features)
    await profileService.updateBetaFeatures(req.user.id, 'bundestag_api_enabled', bundestag_api_enabled);
    
    // Log bundestag API change
    console.log(`[Bundestag API Change] User ${req.user.id}: bundestag_api_enabled ${bundestag_api_enabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Get updated profile and update session using ProfileService
    const updatedProfile = await profileService.getProfileById(req.user.id);
    if (req.user) {
      profileService.updateUserSession(req.user, updatedProfile, 'bundestag_api_enabled', bundestag_api_enabled);
      
      if (req.session.passport && req.session.passport.user) {
        profileService.updateUserSession(req.session.passport.user, updatedProfile, 'bundestag_api_enabled', bundestag_api_enabled);
      }
      
      req.session.save((err) => {
        if (err) {
          console.error('[User Profile /profile/bundestag-api PATCH] Session save error:', err);
        }
      });
    }
    
    res.json({ 
      success: true, 
      bundestagApiEnabled: bundestag_api_enabled,
      message: `Bundestag API ${bundestag_api_enabled ? 'aktiviert' : 'deaktiviert'}! ${bundestag_api_enabled ? 'Du kannst jetzt parlamentarische Dokumente in deine Anträge einbeziehen.' : 'Parlamentarische Dokumente werden nicht mehr einbezogen.'}`
    });
    
  } catch (error) {
    console.error('[User Profile /profile/bundestag-api PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren der Bundestag API Einstellung.'
    });
  }
});

export default router; 

// === ACCOUNT DELETION (placed at end to keep exports intact) ===
// Single route to delete all user data and account
router.delete('/delete-account', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const keycloakId = req.user.keycloak_id;

    // Accept confirmation from body or query; support multiple variants
    const { confirm, confirmation, password } = req.body || {};
    const qsConfirm = req.query?.confirm;
    const rawConfirm = confirm || confirmation || password || qsConfirm || '';
    const normalized = String(rawConfirm).trim().toLowerCase();

    const acceptedPhrases = new Set([
      'löschen',
      'loeschen',
      'konto löschen',
      'konto loeschen',
      'konto löschen',
      'konto loeschen',
      'delete'
    ]);

    if (!acceptedPhrases.has(normalized)) {
      console.log(`[User Delete] Invalid confirmation attempt for user ${userId}: "${rawConfirm}"`);
      return res.status(400).json({
        success: false,
        error: 'invalid_confirmation',
        message: 'Bestätigungstext fehlt oder ist falsch. Bitte gib "löschen" ein.'
      });
    }

    console.log(`[User Delete] Starting account deletion process for user ${userId}`);
    console.log(`[User Delete] User email: ${req.user.email || 'N/A'}, username: ${req.user.username || 'N/A'}, keycloak_id: ${keycloakId || 'N/A'}`);

    // Step 1: Delete vectors in Qdrant (best-effort)
    console.log(`[User Delete] Step 1: Deleting Qdrant vectors for user ${userId}`);
    try {
      const qdrantDocService = getQdrantDocumentService();
      await qdrantDocService.deleteUserDocuments(userId);
      console.log(`[User Delete] Successfully deleted Qdrant vectors for user ${userId}`);
    } catch (vectorErr) {
      console.warn(`[User Delete] Warning deleting Qdrant vectors for user ${userId}:`, vectorErr.message);
    }

    // Step 2: Delete from Keycloak (if keycloak_id exists)
    if (keycloakId) {
      console.log(`[User Delete] Step 2: Deleting user from Keycloak with ID ${keycloakId}`);
      try {
        const keycloakClient = new KeycloakApiClient();
        console.log(`[User Delete] Keycloak client initialized, attempting deletion...`);
        
        await keycloakClient.deleteUser(keycloakId);
        console.log(`[User Delete] ✅ Successfully deleted user from Keycloak: ${keycloakId}`);
      } catch (keycloakErr) {
        console.error(`[User Delete] ❌ Error deleting user from Keycloak ${keycloakId}:`, keycloakErr);
        console.error(`[User Delete] Keycloak error details:`, {
          message: keycloakErr.message,
          code: keycloakErr.code,
          status: keycloakErr.response?.status,
          statusText: keycloakErr.response?.statusText,
          data: keycloakErr.response?.data,
          stack: keycloakErr.stack
        });
        console.warn(`[User Delete] ⚠️ Continuing with database deletion despite Keycloak error`);
        // Don't fail the entire deletion if Keycloak deletion fails
        // The user might have been deleted from Keycloak already or there might be connectivity issues
      }
    } else {
      console.log(`[User Delete] Step 2: Skipping Keycloak deletion - no keycloak_id found for user ${userId}`);
      console.log(`[User Delete] User object keycloak_id field:`, req.user.keycloak_id);
    }

    // Step 3: Delete user profile (cascades to most user-owned data)
    console.log(`[User Delete] Step 3: Deleting user profile and cascading data for user ${userId}`);
    const profileService = getProfileService();
    const deleteResult = await profileService.deleteProfile(userId);
    console.log(`[User Delete] Profile deletion result for user ${userId}:`, deleteResult);

    // Step 4: Logout and clear session/cookie
    console.log(`[User Delete] Step 4: Clearing session and cookies for user ${userId}`);
    req.logout?.(() => {});
    if (req.session) {
      try {
        await new Promise((resolve) => req.session.destroy(() => resolve()));
        console.log(`[User Delete] Session destroyed for user ${userId}`);
      } catch (e) {
        console.warn(`[User Delete] Session destruction warning for user ${userId}:`, e?.message);
      }
    }
    res.clearCookie('gruenerator.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    console.log(`[User Delete] Cookies cleared for user ${userId}`);

    console.log(`[User Delete] ✅ Account deletion completed successfully for user ${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Dein Account wurde erfolgreich gelöscht.'
    });

  } catch (error) {
    console.error(`[User Delete] ❌ Error during account deletion for user ${req.user?.id}:`, error);
    return res.status(500).json({
      success: false,
      error: 'deletion_failed',
      message: 'Es gab einen Fehler beim Löschen deines Accounts. Bitte kontaktiere den Support.'
    });
  }
});
