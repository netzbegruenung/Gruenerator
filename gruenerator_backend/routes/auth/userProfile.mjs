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
    console.log('[User Profile /profile GET] Profile get request for user:', req.user.id);
    
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
      console.log('[User Profile /profile GET] No profile found, creating basic profile');
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
    
    console.log('[User Profile /profile GET] Profile found:', profile.id);
    
    // Enhance profile with auth email information for smart email management
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
    console.log('[User Profile /profile PUT] Profile update request for user:', req.user.id);
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
          console.log('[User Profile /profile PUT] User auth source:', authSource);
          console.log('[User Profile /profile PUT] Full user metadata:', authUser?.user?.raw_user_meta_data);
          
          // Allow email updates for gruenerator-login users or users without auth_source (legacy)
          canUpdateEmail = authSource === 'gruenerator-login' || authSource === null || authSource === undefined;
          
          if (!canUpdateEmail) {
            console.log('[User Profile /profile PUT] Email update blocked for auth source:', authSource);
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
    
    // Prepare update data
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
          console.log('[User Profile /profile PUT] Updated email in auth.users directly');
        }
      } catch (authUpdateError) {
        console.error('[User Profile /profile PUT] Error updating email in auth.users:', authUpdateError);
        // Continue with profile update even if auth.users update fails
      }
    }
    
    console.log('[User Profile /profile PUT] Update data:', updateData);
    
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
    
    console.log('[User Profile /profile PUT] Profile updated successfully:', data.id);
    
    // Update user object in session
    if (req.user) {
      Object.assign(req.user, data);
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
    console.log('[User Profile /profile/avatar PATCH] Avatar update request for user:', req.user.id);
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
    
    console.log('[User Profile /profile/avatar PATCH] Avatar updated successfully');
    
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

// Update user beta features
router.patch('/profile/beta-features', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[User Profile /profile/beta-features PATCH] Beta features update for user:', req.user.id);
    const { feature, enabled } = req.body;
    
    if (!feature || typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Feature name und enabled status sind erforderlich.'
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
    
    // Update user metadata in Supabase Auth
    const { error: updateError } = await supabaseService.auth.admin.updateUserById(req.user.id, {
      user_metadata: updatedMetadata
    });
    
    if (updateError) {
      console.error('[User Profile /profile/beta-features PATCH] Update error:', updateError);
      throw new Error('Beta Features konnten nicht aktualisiert werden');
    }
    
    console.log(`[User Profile /profile/beta-features PATCH] Beta feature '${feature}' updated to ${enabled}`);
    
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
    console.log('[User Profile /profile/message-color PATCH] Message color update for user:', req.user.id);
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
    
    console.log(`[User Profile /profile/message-color PATCH] Message color updated to ${color}`);
    
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

export default router; 