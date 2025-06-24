import express from 'express';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add debugging middleware to all profile routes
router.use((req, res, next) => {
  console.log(`[User Profile] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

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
      
      // Enhance new profile with auth email information and beta features
      const authBetaFeatures = authUser?.user?.raw_user_meta_data?.beta_features || {};
      const profileBetaFeatures = newProfile.beta_features || {};
      
      // Merge beta features: profiles table takes precedence over auth metadata
      const mergedBetaFeatures = {
        ...authBetaFeatures,
        ...profileBetaFeatures
      };
      
      const enhancedNewProfile = {
        ...newProfile,
        auth_email: authUser?.user?.email || null, // Email from auth.users
        is_sso_user: !!newProfile.keycloak_id, // Detect SSO users
        beta_features: mergedBetaFeatures // Merged beta features
      };
      
      return res.json({ 
        success: true, 
        user: enhancedNewProfile
      });
    }
    
    // Enhance profile with auth email information and beta features
    const authBetaFeatures = authUser?.user?.raw_user_meta_data?.beta_features || {};
    const profileBetaFeatures = profile.beta_features || {};
    const sessionBetaFeatures = req.user?.beta_features || {};
    
    // Merge beta features: session takes precedence over profiles table, which takes precedence over auth metadata
    const mergedBetaFeatures = {
      ...authBetaFeatures,
      ...profileBetaFeatures,
      ...sessionBetaFeatures
    };
    
    const enhancedProfile = {
      ...profile,
      auth_email: authUser?.user?.email || null, // Email from auth.users
      is_sso_user: !!profile.keycloak_id, // Detect SSO users
      beta_features: mergedBetaFeatures // Merged beta features with session priority
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
    
    // Check user's auth source to determine if email updates are allowed
    let canUpdateEmail = false;
    if (email !== undefined) {
      try {
        const { data: authUser, error: authError } = await supabaseService.auth.admin.getUserById(req.user.id);
        if (authError) {
          console.error('[User Profile /profile PUT] Auth user lookup error:', authError);
        } else {
          const authSource = authUser?.user?.raw_user_meta_data?.auth_source;
          
          // Allow email updates for gruenerator-login users or users without auth_source (legacy)
          canUpdateEmail = authSource === 'gruenerator-login' || authSource === null || authSource === undefined;
          
          if (!canUpdateEmail) {
            return res.status(400).json({
              success: false,
              message: 'E-Mail kann nicht geändert werden. Bitte wenden Sie sich an den Administrator oder loggen Sie sich über das ursprüngliche System ein.'
            });
          }
        }
      } catch (authCheckError) {
        console.error('[User Profile /profile PUT] Auth check error:', authCheckError);
        // If we can't check auth source, allow the update (will be caught by DB trigger if needed)
        canUpdateEmail = true;
      }
    }
    
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
    
    
    // Handle email updates manually if user is allowed to change it
    if (email !== undefined && canUpdateEmail) {
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
    
    // Inform user if email update was skipped
    let message = 'Profil erfolgreich aktualisiert!';
    if (email !== undefined && !canUpdateEmail) {
      message = 'Profil aktualisiert! E-Mail konnte nicht geändert werden - diese wird über Ihr Authentifizierungssystem verwaltet.';
    }
    
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
    
    // Get auth user to access metadata
    const { data: authUser, error: authError } = await supabaseService.auth.admin.getUserById(req.user.id);
    if (authError) {
      console.error('[User Profile /profile/beta-features GET] Auth user error:', authError);
    }
    
    // Get profile from database to access beta_features
    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('beta_features')
      .eq('id', req.user.id)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[User Profile /profile/beta-features GET] Profile error:', profileError);
      throw new Error('Fehler beim Laden der Beta Features aus der Datenbank');
    }
    
    // Merge beta features: auth metadata as base, profiles table takes precedence
    const authBetaFeatures = authUser?.user?.raw_user_meta_data?.beta_features || {};
    const profileBetaFeatures = profile?.beta_features || {};
    
    const mergedBetaFeatures = {
      ...authBetaFeatures,
      ...profileBetaFeatures
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
      'advanced_editor',
      'collaborative_editing',
      'customGruenerator'
    ];
    if (!allowedFeatures.includes(feature)) {
      return res.status(400).json({
        success: false,
        message: 'Unbekanntes Beta Feature.'
      });
    }
    
    // Get current user metadata from Supabase Auth
    const { data: authUser, error: getUserError } = await supabaseService.auth.admin.getUserById(req.user.id);
    
    if (getUserError) {
      console.error('[User Profile /profile/beta-features PATCH] Get user error:', getUserError);
      throw new Error('Benutzer nicht gefunden');
    }
    
    const currentMetadata = authUser.user.user_metadata || {};
    const currentBetaFeatures = currentMetadata.beta_features || {};
    
    // Update beta features
    const updatedBetaFeatures = {
      ...currentBetaFeatures,
      [feature]: enabled
    };
    
    const updatedMetadata = {
      ...currentMetadata,
      beta_features: updatedBetaFeatures
    };
    
    // Try to update user metadata in Supabase Auth (best effort for non-SSO users)
    try {
      const { error: updateError } = await supabaseService.auth.admin.updateUserById(req.user.id, {
        user_metadata: updatedMetadata
      });
      
      if (updateError) {
        console.warn('[User Profile /profile/beta-features PATCH] Auth metadata update failed (may be SSO user):', updateError.message);
      }
    } catch (authError) {
      console.warn('[User Profile /profile/beta-features PATCH] Auth metadata update failed (non-critical):', authError.message);
    }
    
    // Primary storage: Always store in profiles table for reliability
    try {
      const { error: profileUpdateError } = await supabaseService
        .from('profiles')
        .upsert({
          id: req.user.id,
          beta_features: updatedBetaFeatures,
          updated_at: new Date().toISOString()
        });
      
      if (profileUpdateError) {
        console.error('[User Profile /profile/beta-features PATCH] Profile storage failed:', profileUpdateError);
        throw new Error('Beta Features konnten nicht in der Datenbank gespeichert werden');
      }
    } catch (profileError) {
      console.error('[User Profile /profile/beta-features PATCH] Profile storage error:', profileError);
      throw new Error('Fehler beim Speichern der Beta Features');
    }
    
    // Also update session for immediate UI feedback
    if (req.user) {
      console.log(`[User Profile] Beta feature '${feature}' ${enabled ? 'enabled' : 'disabled'}`);
      
      // Update beta_features directly on user object (from profiles table)
      req.user.beta_features = updatedBetaFeatures;
      
      // Also update in user_metadata for consistency
      if (req.user.user_metadata) {
        req.user.user_metadata.beta_features = updatedBetaFeatures;
      } else {
        req.user.user_metadata = { beta_features: updatedBetaFeatures };
      }
      
      // CRITICAL: Force session to update by modifying session.passport.user directly
      if (req.session.passport && req.session.passport.user) {
        req.session.passport.user = req.user;
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
    
    // Get current user metadata from Supabase Auth
    const { data: authUser, error: getUserError } = await supabaseService.auth.admin.getUserById(req.user.id);
    
    if (getUserError) {
      console.error('[User Profile /profile/message-color PATCH] Get user error:', getUserError);
      throw new Error('Benutzer nicht gefunden');
    }
    
    const currentMetadata = authUser.user.user_metadata || {};
    
    // Update message color
    const updatedMetadata = {
      ...currentMetadata,
      chat_color: color
    };
    
    // Update user metadata in Supabase Auth
    const { error: updateError } = await supabaseService.auth.admin.updateUserById(req.user.id, {
      user_metadata: updatedMetadata
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
    console.log('[User Profile /profile/memory-settings PATCH] Memory settings update for user:', req.user.id);
    const { memory_enabled } = req.body;
    
    if (typeof memory_enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Memory enabled status ist erforderlich.'
      });
    }
    
    // Get current user metadata from Supabase Auth
    const { data: authUser, error: getUserError } = await supabaseService.auth.admin.getUserById(req.user.id);
    
    if (getUserError) {
      console.error('[User Profile /profile/memory-settings PATCH] Get user error:', getUserError);
      throw new Error('Benutzer nicht gefunden');
    }
    
    const currentMetadata = authUser.user.user_metadata || {};
    
    // Update memory settings
    const updatedMetadata = {
      ...currentMetadata,
      memory_enabled: memory_enabled
    };
    
    // Update user metadata in Supabase Auth
    const { error: updateError } = await supabaseService.auth.admin.updateUserById(req.user.id, {
      user_metadata: updatedMetadata
    });
    
    if (updateError) {
      console.error('[User Profile /profile/memory-settings PATCH] Update error:', updateError);
      throw new Error('Memory-Einstellungen konnten nicht aktualisiert werden');
    }
    
    // Also update the profiles table for consistency (the trigger should handle this, but let's be explicit)
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
    
    console.log(`[User Profile /profile/memory-settings PATCH] Memory settings updated to ${memory_enabled}`);
    
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
    console.log('[User Profile /profile/igel-modus PATCH] Igel-Modus update for user:', req.user.id);
    const { igel_modus } = req.body;
    
    if (typeof igel_modus !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Igel-Modus Status ist erforderlich.'
      });
    }
    
    // Get current user metadata from Supabase Auth
    const { data: authUser, error: getUserError } = await supabaseService.auth.admin.getUserById(req.user.id);
    
    if (getUserError) {
      console.error('[User Profile /profile/igel-modus PATCH] Get user error:', getUserError);
      throw new Error('Benutzer nicht gefunden');
    }
    
    const currentMetadata = authUser.user.user_metadata || {};
    
    // Update Igel-Modus settings - ensure we have a clean object
    const updatedMetadata = {
      ...currentMetadata,
      igel_modus: Boolean(igel_modus) // Ensure it's a proper boolean
    };
    
    console.log('[User Profile /profile/igel-modus PATCH] Using direct profiles table update (bypassing problematic Admin API)');
    console.log('[User Profile /profile/igel-modus PATCH] Igel modus value:', igel_modus, typeof igel_modus);
    
    // Primary approach: Update profiles table directly, then update auth metadata  
    // This bypasses Admin API restrictions for SSO/invited users
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
    
    // Secondary: Also try to update auth metadata for consistency (best effort)
    try {
      const { error: authUpdateError } = await supabaseService.auth.admin.updateUserById(req.user.id, {
        user_metadata: updatedMetadata
      });
      
      if (authUpdateError) {
        console.warn('[User Profile /profile/igel-modus PATCH] Auth metadata update failed (non-critical):', authUpdateError.message);
        // Don't fail the request - profiles table is our primary source
      } else {
        console.log('[User Profile /profile/igel-modus PATCH] Auth metadata also updated successfully');
      }
    } catch (authError) {
      console.warn('[User Profile /profile/igel-modus PATCH] Auth metadata update failed (non-critical):', authError.message);
    }
    
    console.log(`[User Profile /profile/igel-modus PATCH] Igel-Modus updated to ${igel_modus}`);
    
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

export default router; 