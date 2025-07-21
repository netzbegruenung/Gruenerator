import express from 'express';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();


// === PROFILE MANAGEMENT ENDPOINTS ===

// Get user profile
router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    
    // Get auth user to access email from auth.users
    const { data: authUser, error: authError } = await supabaseService.auth.admin.getUserById(req.user.id);
    if (authError) {
      console.error('[User Profile /profile GET] Auth user error:', authError);
    }
    
    // Get profile from database
    const { data: profile, error } = await supabaseService
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();
      
    if (error && error.code !== 'PGRST116') {
      console.error('[User Profile /profile GET] Supabase error:', error);
      throw new Error(error.message);
    }
    
    // If no profile exists, create a basic one
    if (!profile) {
        const basicProfile = {
        id: req.user.id,
        display_name: req.user.display_name || req.user.username || 'User',
        username: req.user.username,
        keycloak_id: req.user.keycloak_id,
        avatar_robot_id: 1,
        updated_at: new Date().toISOString()
      };
      
      const { data: newProfile, error: createError } = await supabaseService
        .from('profiles')
        .upsert(basicProfile)
        .select()
        .single();
        
      if (createError) {
        console.error('[User Profile /profile GET] Error creating profile:', createError);
        throw new Error(createError.message);
      }
      
      // Enhance new profile with auth email information
      const enhancedNewProfile = {
        ...newProfile,
        auth_email: authUser?.user?.email || null, // Email from auth.users
        is_sso_user: !!newProfile.keycloak_id // Detect SSO users
      };
      
      return res.json({ 
        success: true, 
        user: enhancedNewProfile
      });
    }
    
    // Enhance profile with auth email information
    const enhancedProfile = {
      ...profile,
      auth_email: authUser?.user?.email || null, // Email from auth.users
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
    const { first_name, last_name, display_name, avatar_robot_id, email } = req.body;
    
    // Validate input
    if (avatar_robot_id && (avatar_robot_id < 1 || avatar_robot_id > 9)) {
      return res.status(400).json({
        success: false,
        message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.'
      });
    }
    
    // Allow all users to update their display email in profiles table
    
    // Prepare update data - NEVER include beta_features here
    // Beta features are managed exclusively via /profile/beta-features endpoint
    const updateData = {
      id: req.user.id,
      updated_at: new Date().toISOString()
    };
    
    if (first_name !== undefined) updateData.first_name = first_name || null;
    if (last_name !== undefined) updateData.last_name = last_name || null;
    if (display_name !== undefined) updateData.display_name = display_name || null;
    if (avatar_robot_id !== undefined) updateData.avatar_robot_id = avatar_robot_id;
    
    
    // Handle email updates - update both profiles table and auth.users (best effort)
    if (email !== undefined) {
      updateData.email = email || null;
      
      // Also update the email in auth.users directly to avoid trigger permission issues
      try {
        if (email) {
          await supabaseService.auth.admin.updateUserById(req.user.id, {
            email: email
          });
        }
      } catch (authUpdateError) {
        console.error('[User Profile /profile PUT] Error updating email in auth.users:', authUpdateError);
        // Continue with profile update even if auth.users update fails
      }
    }
    
    
    // Update profile using Service Role Key (bypasses RLS)
    const { data, error } = await supabaseService
      .from('profiles')
      .upsert(updateData)
      .select()
      .single();
      
    if (error) {
      console.error('[User Profile /profile PUT] Supabase error:', error);
      throw new Error(error.message);
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
    const { avatar_robot_id } = req.body;
    
    // Validate avatar_robot_id
    if (!avatar_robot_id || avatar_robot_id < 1 || avatar_robot_id > 9) {
      return res.status(400).json({
        success: false,
        message: 'Avatar Robot ID muss zwischen 1 und 9 liegen.'
      });
    }
    
    // Update avatar using Service Role Key
    const { data, error } = await supabaseService
      .from('profiles')
      .upsert({
        id: req.user.id,
        avatar_robot_id: avatar_robot_id,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
      
    if (error) {
      console.error('[User Profile /profile/avatar PATCH] Supabase error:', error);
      throw new Error(error.message);
    }
    
    
    // Update user object in session
    if (req.user) {
      req.user.avatar_robot_id = avatar_robot_id;
    }
    
    res.json({ 
      success: true, 
      profile: data,
      message: 'Avatar erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[User Profile /profile/avatar PATCH] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren des Avatars.'
    });
  }
});

// Get user beta features
router.get('/profile/beta-features', ensureAuthenticated, async (req, res) => {
  try {
    
    // No longer need auth metadata - use profiles table only
    
    // Get profile from database to access beta_features and ALL individual beta feature columns
    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('beta_features, igel_modus, bundestag_api_enabled, groups, custom_generators, database_access, you_generator, collab, qa, sharepic, anweisungen')
      .eq('id', req.user.id)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[User Profile /profile/beta-features GET] Profile error:', profileError);
      throw new Error('Fehler beim Laden der Beta Features aus der Datenbank');
    }
    
    // Use profiles table data only
    const profileBetaFeatures = profile?.beta_features || {};
    
    // Include ALL individual profile settings as beta features for consistency
    const profileSettingsAsBetaFeatures = {
      igel_modus: profile?.igel_modus || false,
      bundestag_api_enabled: profile?.bundestag_api_enabled || false,
      groups: profile?.groups || false,
      customGenerators: profile?.custom_generators || false,
      database: profile?.database_access || false,
      you: profile?.you_generator || false,
      collab: profile?.collab || false,
      qa: profile?.qa || false,
      sharepic: profile?.sharepic || false,
      anweisungen: profile?.anweisungen || false
    };
    
    const mergedBetaFeatures = {
      ...profileBetaFeatures,
      ...profileSettingsAsBetaFeatures
    };
    
    
    
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
    
    // Get current beta features from profiles table
    const { data: currentProfile, error: profileError } = await supabaseService
      .from('profiles')
      .select('beta_features')
      .eq('id', req.user.id)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[User Profile /profile/beta-features PATCH] Profile error:', profileError);
      throw new Error('Fehler beim Laden der aktuellen Beta Features');
    }
    
    const currentBetaFeatures = currentProfile?.beta_features || {};
    
    // Update beta features
    const updatedBetaFeatures = {
      ...currentBetaFeatures,
      [feature]: enabled
    };
    
    // Store in profiles table
    try {
      // Prepare update data with beta features
      const updateData = {
        id: req.user.id,
        beta_features: updatedBetaFeatures,
        updated_at: new Date().toISOString()
      };
      
      // Special handling: Also update individual columns for all beta features
      if (feature === 'igel_modus') {
        updateData.igel_modus = Boolean(enabled);
      }
      if (feature === 'bundestag_api_enabled') {
        updateData.bundestag_api_enabled = Boolean(enabled);
      }
      if (feature === 'groups') {
        updateData.groups = Boolean(enabled);
      }
      if (feature === 'customGenerators') {
        updateData.custom_generators = Boolean(enabled);
      }
      if (feature === 'database') {
        updateData.database_access = Boolean(enabled);
      }
      if (feature === 'you') {
        updateData.you_generator = Boolean(enabled);
      }
      if (feature === 'collab') {
        updateData.collab = Boolean(enabled);
      }
      if (feature === 'qa') {
        updateData.qa = Boolean(enabled);
      }
      if (feature === 'sharepic') {
        updateData.sharepic = Boolean(enabled);
      }
      if (feature === 'anweisungen') {
        updateData.anweisungen = Boolean(enabled);
      }
      if (feature === 'qa') {
        updateData.qa = Boolean(enabled);
      }
      
      const { error: profileUpdateError } = await supabaseService
        .from('profiles')
        .upsert(updateData);
      
      if (profileUpdateError) {
        console.error('[User Profile /profile/beta-features PATCH] Profile storage failed:', profileUpdateError);
        throw new Error('Beta Features konnten nicht in der Datenbank gespeichert werden');
      }
    } catch (profileError) {
      console.error('[User Profile /profile/beta-features PATCH] Profile storage error:', profileError);
      throw new Error('Fehler beim Speichern der Beta Features');
    }
    
    // Log beta feature change
    console.log(`[Beta Feature Change] User ${req.user.id}: ${feature} ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Also update session for immediate UI feedback
    if (req.user) {
      // Update beta_features directly on user object (from profiles table)
      req.user.beta_features = updatedBetaFeatures;
      
      // Special handling: Also update individual profile settings in session for compatibility
      if (feature === 'igel_modus') {
        req.user.igel_modus = Boolean(enabled);
      }
      if (feature === 'bundestag_api_enabled') {
        req.user.bundestag_api_enabled = Boolean(enabled);
      }
      if (feature === 'groups') {
        req.user.groups = Boolean(enabled);
      }
      if (feature === 'customGenerators') {
        req.user.custom_generators = Boolean(enabled);
      }
      if (feature === 'database') {
        req.user.database_access = Boolean(enabled);
      }
      if (feature === 'you') {
        req.user.you_generator = Boolean(enabled);
      }
      if (feature === 'collab') {
        req.user.collab = Boolean(enabled);
      }
      if (feature === 'qa') {
        req.user.qa = Boolean(enabled);
      }
      if (feature === 'sharepic') {
        req.user.sharepic = Boolean(enabled);
      }
      if (feature === 'anweisungen') {
        req.user.anweisungen = Boolean(enabled);
      }
      if (feature === 'qa') {
        req.user.qa = Boolean(enabled);
      }
      
      // Remove user_metadata - no longer needed
      
      // CRITICAL: Force session to update by modifying session.passport.user directly
      if (req.session.passport && req.session.passport.user) {
        req.session.passport.user = req.user;
        
        // Special handling: Also update individual profile settings in session.passport.user
        if (feature === 'igel_modus') {
          req.session.passport.user.igel_modus = Boolean(enabled);
        }
        if (feature === 'bundestag_api_enabled') {
          req.session.passport.user.bundestag_api_enabled = Boolean(enabled);
        }
        if (feature === 'groups') {
          req.session.passport.user.groups = Boolean(enabled);
        }
        if (feature === 'customGenerators') {
          req.session.passport.user.custom_generators = Boolean(enabled);
        }
        if (feature === 'database') {
          req.session.passport.user.database_access = Boolean(enabled);
        }
        if (feature === 'you') {
          req.session.passport.user.you_generator = Boolean(enabled);
        }
        if (feature === 'collab') {
          req.session.passport.user.collab = Boolean(enabled);
        }
        if (feature === 'qa') {
          req.session.passport.user.qa = Boolean(enabled);
        }
        if (feature === 'sharepic') {
          req.session.passport.user.sharepic = Boolean(enabled);
        }
        if (feature === 'anweisungen') {
          req.session.passport.user.anweisungen = Boolean(enabled);
        }
        if (feature === 'qa') {
          req.session.passport.user.qa = Boolean(enabled);
        }
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
    const { color } = req.body;
    
    if (!color || typeof color !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Farbe ist erforderlich.'
      });
    }
    
    // Update chat_color in profiles table
    const { error: updateError } = await supabaseService
      .from('profiles')
      .upsert({
        id: req.user.id,
        chat_color: color,
        updated_at: new Date().toISOString()
      });
    
    if (updateError) {
      console.error('[User Profile /profile/message-color PATCH] Update error:', updateError);
      throw new Error('Nachrichtenfarbe konnte nicht aktualisiert werden');
    }
    
    
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
    const { memory_enabled } = req.body;
    
    if (typeof memory_enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Memory enabled status ist erforderlich.'
      });
    }
    
    // Update memory_enabled in profiles table only
    try {
      const { error: profileUpdateError } = await supabaseService
        .from('profiles')
        .upsert({
          id: req.user.id,
          memory_enabled: memory_enabled,
          updated_at: new Date().toISOString()
        });
      
      if (profileUpdateError) {
        console.warn('[User Profile /profile/memory-settings PATCH] Profile update warning:', profileUpdateError);
        // Don't fail the request if profile update fails since auth.users is the primary source
      }
    } catch (profileError) {
      console.warn('[User Profile /profile/memory-settings PATCH] Profile update failed:', profileError);
    }
    
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
    const { igel_modus } = req.body;
    
    if (typeof igel_modus !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Igel-Modus Status ist erforderlich.'
      });
    }
    
    // Update igel_modus in profiles table only
    const { error: profileUpdateError } = await supabaseService
      .from('profiles')
      .upsert({
        id: req.user.id,
        igel_modus: Boolean(igel_modus),
        updated_at: new Date().toISOString()
      });
    
    if (profileUpdateError) {
      console.error('[User Profile /profile/igel-modus PATCH] Profile update failed:', profileUpdateError);
      throw new Error('Igel-Modus konnte nicht aktualisiert werden');
    }
    
    // Log igel modus change
    console.log(`[Igel Modus Change] User ${req.user.id}: igel_modus ${igel_modus ? 'ENABLED' : 'DISABLED'}`);
    
    // Update user object in session to keep it in sync with database
    if (req.user) {
      req.user.igel_modus = Boolean(igel_modus);
      
      // CRITICAL: Also update req.session.passport.user to ensure session.save() persists the change
      if (req.session.passport && req.session.passport.user) {
        req.session.passport.user.igel_modus = Boolean(igel_modus);
      }
      
      // CRITICAL: Save session to persist the change across page reloads
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
    const { bundestag_api_enabled } = req.body;
    
    if (typeof bundestag_api_enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Bundestag API Status ist erforderlich.'
      });
    }
    
    // Update bundestag_api_enabled in profiles table only
    const { error: profileUpdateError } = await supabaseService
      .from('profiles')
      .upsert({
        id: req.user.id,
        bundestag_api_enabled: Boolean(bundestag_api_enabled),
        updated_at: new Date().toISOString()
      });
    
    if (profileUpdateError) {
      console.error('[User Profile /profile/bundestag-api PATCH] Profile update failed:', profileUpdateError);
      throw new Error('Bundestag API Einstellung konnte nicht aktualisiert werden');
    }
    
    // Log bundestag API change
    console.log(`[Bundestag API Change] User ${req.user.id}: bundestag_api_enabled ${bundestag_api_enabled ? 'ENABLED' : 'DISABLED'}`);
    
    // Update user object in session to keep it in sync with database
    if (req.user) {
      req.user.bundestag_api_enabled = Boolean(bundestag_api_enabled);
      
      // CRITICAL: Also update req.session.passport.user to ensure session.save() persists the change
      if (req.session.passport && req.session.passport.user) {
        req.session.passport.user.bundestag_api_enabled = Boolean(bundestag_api_enabled);
      }
      
      // CRITICAL: Save session to persist the change across page reloads
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