import express from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getProfileService } from '../../services/ProfileService.mjs';
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();


// === PROFILE MANAGEMENT ENDPOINTS ===

// Get user profile
router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const profileService = getProfileService();
    
    // Email is now stored in profiles table after PostgreSQL migration
    
    // Get profile from database using ProfileService
    let profile = await profileService.getProfileById(req.user.id);
    
    // If no profile exists, create a basic one
    if (!profile) {
      const basicProfile = {
        id: req.user.id,
        display_name: req.user.display_name || req.user.username || 'User',
        username: req.user.username,
        keycloak_id: req.user.keycloak_id,
        avatar_robot_id: 1
      };
      
      profile = await profileService.createProfile(basicProfile);
      
      // Enhance new profile with SSO detection
      const enhancedNewProfile = {
        ...profile,
        is_sso_user: !!profile.keycloak_id // Detect SSO users
      };
      
      return res.json({ 
        success: true, 
        user: enhancedNewProfile
      });
    }
    
    // Enhance profile with SSO detection
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
      'customGenerators', 
      'sharepic', 
      'anweisungen', 
      'you', 
      'collab',
      'qa',
      'advanced_editor',
      'collaborative_editing',
      'customGruenerator',
      'e_learning',
      'memory',
      'contentManagement',
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
