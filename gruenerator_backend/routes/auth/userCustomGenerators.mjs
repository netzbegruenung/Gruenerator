import express from 'express';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add debugging middleware to all custom generators routes
router.use((req, res, next) => {
  console.log(`[User Custom Generators] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === CUSTOM GENERATORS MANAGEMENT ENDPOINTS ===

// Get user's custom generators
router.get('/custom-generators', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch user's custom generators
    const { data: generators, error } = await supabaseService
      .from('custom_generators')
      .select('id, name, slug, title, description, form_schema, prompt, contact_email, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('[User Custom Generators /custom-generators GET] Supabase error:', error);
      throw new Error(error.message);
    }
    
    res.json({ 
      success: true, 
      generators: generators || []
    });
    
  } catch (error) {
    console.error('[User Custom Generators /custom-generators GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Laden der Grüneratoren.'
    });
  }
});

// Create new custom generator
router.post('/custom-generators', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, slug, title, description, form_schema, prompt, contact_email } = req.body;
    
    // Validate required fields
    if (!name || !slug || !title || !form_schema || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'Name, Slug, Title, Form Schema und Prompt sind erforderlich.'
      });
    }
    
    // Check if slug already exists for this user
    const { data: existingGenerator, error: checkError } = await supabaseService
      .from('custom_generators')
      .select('id')
      .eq('slug', slug)
      .eq('user_id', userId)
      .maybeSingle();
      
    if (checkError) {
      console.error('[User Custom Generators /custom-generators POST] Check error:', checkError);
      throw new Error(checkError.message);
    }
    
    if (existingGenerator) {
      return res.status(400).json({
        success: false,
        message: 'Ein Grünerator mit diesem Slug existiert bereits.'
      });
    }
    
    // Create new generator
    const generatorData = {
      user_id: userId,
      name: name.trim(),
      slug: slug.trim(),
      title: title.trim(),
      description: description?.trim() || null,
      form_schema: form_schema,
      prompt: prompt.trim(),
      contact_email: contact_email?.trim() || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: newGenerator, error: createError } = await supabaseService
      .from('custom_generators')
      .insert(generatorData)
      .select()
      .single();
      
    if (createError) {
      console.error('[User Custom Generators /custom-generators POST] Create error:', createError);
      throw new Error(createError.message);
    }
    
    res.json({ 
      success: true, 
      generator: newGenerator,
      message: 'Grünerator erfolgreich erstellt!'
    });
    
  } catch (error) {
    console.error('[User Custom Generators /custom-generators POST] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Erstellen des Grünerators.'
    });
  }
});

// Update existing custom generator
router.put('/custom-generators/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, slug, title, description, form_schema, prompt, contact_email } = req.body;
    
    // Validate required fields
    if (!name || !slug || !title || !form_schema || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'Name, Slug, Title, Form Schema und Prompt sind erforderlich.'
      });
    }
    
    // Check if generator exists and belongs to user
    const { data: existingGenerator, error: checkError } = await supabaseService
      .from('custom_generators')
      .select('id, user_id')
      .eq('id', id)
      .single();
      
    if (checkError) {
      console.error('[User Custom Generators /custom-generators PUT] Check error:', checkError);
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Grünerator nicht gefunden.'
        });
      }
      throw new Error(checkError.message);
    }
    
    if (existingGenerator.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Bearbeiten dieses Grünerators.'
      });
    }
    
    // Check if slug conflicts with another generator by same user
    const { data: conflictGenerator, error: conflictError } = await supabaseService
      .from('custom_generators')
      .select('id')
      .eq('slug', slug)
      .eq('user_id', userId)
      .neq('id', id)
      .maybeSingle();
      
    if (conflictError) {
      console.error('[User Custom Generators /custom-generators PUT] Conflict check error:', conflictError);
      throw new Error(conflictError.message);
    }
    
    if (conflictGenerator) {
      return res.status(400).json({
        success: false,
        message: 'Ein anderer Grünerator mit diesem Slug existiert bereits.'
      });
    }
    
    // Update generator
    const updateData = {
      name: name.trim(),
      slug: slug.trim(),
      title: title.trim(),
      description: description?.trim() || null,
      form_schema: form_schema,
      prompt: prompt.trim(),
      contact_email: contact_email?.trim() || null,
      updated_at: new Date().toISOString()
    };
    
    const { data: updatedGenerator, error: updateError } = await supabaseService
      .from('custom_generators')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
      
    if (updateError) {
      console.error('[User Custom Generators /custom-generators PUT] Update error:', updateError);
      throw new Error(updateError.message);
    }
    
    res.json({ 
      success: true, 
      generator: updatedGenerator,
      message: 'Grünerator erfolgreich aktualisiert!'
    });
    
  } catch (error) {
    console.error('[User Custom Generators /custom-generators PUT] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Aktualisieren des Grünerators.'
    });
  }
});

// Delete custom generator
router.delete('/custom-generators/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    
    // Check if generator exists and belongs to user
    const { data: existingGenerator, error: checkError } = await supabaseService
      .from('custom_generators')
      .select('id, user_id, name')
      .eq('id', id)
      .single();
      
    if (checkError) {
      console.error('[User Custom Generators /custom-generators DELETE] Check error:', checkError);
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Grünerator nicht gefunden.'
        });
      }
      throw new Error(checkError.message);
    }
    
    if (existingGenerator.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Löschen dieses Grünerators.'
      });
    }
    
    // Delete generator
    const { error: deleteError } = await supabaseService
      .from('custom_generators')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
      
    if (deleteError) {
      console.error('[User Custom Generators /custom-generators DELETE] Delete error:', deleteError);
      throw new Error(deleteError.message);
    }
    
    console.log(`[User Custom Generators] Generator "${existingGenerator.name}" (${id}) deleted by user ${userId}`);
    
    res.json({ 
      success: true, 
      message: 'Grünerator erfolgreich gelöscht!'
    });
    
  } catch (error) {
    console.error('[User Custom Generators /custom-generators DELETE] Error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Fehler beim Löschen des Grünerators.'
    });
  }
});

export default router;