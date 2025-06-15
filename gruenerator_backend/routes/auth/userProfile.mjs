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
      
      return res.json({ 
        success: true, 
        user: newProfile
      });
    }
    
    console.log('[User Profile /profile GET] Profile found:', profile.id);
    
    res.json({ 
      success: true, 
      user: profile
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
    
    // Prepare update data
    const updateData = {
      id: req.user.id,
      updated_at: new Date().toISOString()
    };
    
    if (first_name !== undefined) updateData.first_name = first_name || null;
    if (last_name !== undefined) updateData.last_name = last_name || null;
    if (display_name !== undefined) updateData.display_name = display_name || null;
    if (avatar_robot_id !== undefined) updateData.avatar_robot_id = avatar_robot_id;
    if (email !== undefined) updateData.email = email || null;
    
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
    
    res.json({ 
      success: true, 
      profile: data,
      message: 'Profil erfolgreich aktualisiert!'
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

export default router; 