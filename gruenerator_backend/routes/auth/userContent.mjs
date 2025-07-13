import express from 'express';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add debugging middleware to all user content routes
router.use((req, res, next) => {
  console.log(`[User Content] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === PERSONAL INSTRUCTIONS & KNOWLEDGE ENDPOINTS ===

// Get user instructions and knowledge
router.get('/anweisungen-wissen', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch profile prompts
    const { data: profileData, error: profileErr } = await supabaseService
      .from('profiles')
      .select('custom_antrag_prompt, custom_antrag_gliederung, custom_social_prompt, custom_universal_prompt, custom_gruenejugend_prompt, presseabbinder')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    // Fetch knowledge entries (max 3)
    const { data: knowledgeRows, error: knowledgeErr } = await supabaseService
      .from('user_knowledge')
      .select('id, title, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(3);
    if (knowledgeErr) throw knowledgeErr;

    res.json({
      success: true,
      antragPrompt: profileData?.custom_antrag_prompt || '',
      antragGliederung: profileData?.custom_antrag_gliederung || '',
      socialPrompt: profileData?.custom_social_prompt || '',
      universalPrompt: profileData?.custom_universal_prompt || '',
      gruenejugendPrompt: profileData?.custom_gruenejugend_prompt || '',
      presseabbinder: profileData?.presseabbinder || '',
      knowledge: knowledgeRows || []
    });
    
  } catch (error) {
    console.error('[User Content /anweisungen-wissen GET] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Laden der Daten', 
      details: error.message 
    });
  }
});

// Update user instructions and knowledge
router.put('/anweisungen-wissen', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { custom_antrag_prompt, custom_antrag_gliederung, custom_social_prompt, custom_universal_prompt, custom_gruenejugend_prompt, presseabbinder, knowledge = [] } = req.body || {};
    console.log('[User Content /anweisungen-wissen PUT] Incoming request body for user:', userId);
    console.log(JSON.stringify(req.body, null, 2));

    // 1. Upsert profile prompts
    const profilePayload = {
      id: userId,
      updated_at: new Date().toISOString(),
      custom_antrag_prompt: custom_antrag_prompt ?? null,
      custom_antrag_gliederung: custom_antrag_gliederung ?? null,
      custom_social_prompt: custom_social_prompt ?? null,
      custom_universal_prompt: custom_universal_prompt ?? null,
      custom_gruenejugend_prompt: custom_gruenejugend_prompt ?? null,
      presseabbinder: presseabbinder ?? null,
    };
    console.log('[User Content /anweisungen-wissen PUT] Prepared profile payload:');
    console.log(JSON.stringify(profilePayload, null, 2));
    
    const { error: profileErr } = await supabaseService.from('profiles').upsert(profilePayload);
    if (profileErr) throw profileErr;

    // 2. Sync knowledge entries: a full replace is simpler and more robust.
    
    // Filter out completely empty entries submitted by the frontend
    const validEntries = knowledge.filter(entry => 
      (entry.title || '').trim() || (entry.content || '').trim()
    );

    const submittedIds = validEntries
      .map(entry => entry.id)
      .filter(id => id && !(typeof id === 'string' && id.startsWith('new-')));

    // 3. Delete entries that are no longer present in the submitted list
    const deleteQuery = supabaseService
        .from('user_knowledge')
        .delete()
        .eq('user_id', userId);
    
    if (submittedIds.length > 0) {
        deleteQuery.not('id', 'in', `(${submittedIds.join(',')})`);
    }
    console.log(`[User Content /anweisungen-wissen PUT] Deleting knowledge entries for user ${userId} NOT in this list of IDs: [${submittedIds.join(',')}]`);

    const { error: deleteErr } = await deleteQuery;
    if (deleteErr) throw deleteErr;
    
    // 4. Upsert existing and insert new entries
    if (validEntries.length > 0) {
        const toUpdate = validEntries
            .filter(e => e.id && !(typeof e.id === 'string' && e.id.startsWith('new-')))
            .map(e => ({
                id: e.id,
                user_id: userId,
                title: e.title?.trim() || 'Unbenannter Eintrag',
                content: e.content?.trim() || '',
            }));

        const toInsert = validEntries
            .filter(e => !e.id || (typeof e.id === 'string' && e.id.startsWith('new-')))
            .map(e => ({
                user_id: userId,
                title: e.title?.trim() || 'Unbenannter Eintrag',
                content: e.content?.trim() || '',
            }));

        if (toUpdate.length > 0) {
            console.log('[User Content /anweisungen-wissen PUT] Updating knowledge entries:');
            console.log(JSON.stringify(toUpdate, null, 2));
            const { error: updateErr } = await supabaseService.from('user_knowledge').upsert(toUpdate);
            if (updateErr) throw updateErr;
        }

        if (toInsert.length > 0) {
            console.log('[User Content /anweisungen-wissen PUT] Inserting new knowledge entries:');
            console.log(JSON.stringify(toInsert, null, 2));
            const { error: insertErr } = await supabaseService.from('user_knowledge').insert(toInsert);
            if (insertErr) throw insertErr;
        }
    }

    res.json({ 
      success: true, 
      message: 'Anweisungen & Wissen gespeichert' 
    });
    
  } catch (error) {
    console.error('[User Content /anweisungen-wissen PUT] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Speichern', 
      details: error.message 
    });
  }
});

// Delete specific knowledge entry
router.delete('/anweisungen-wissen/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Keine ID angegeben.' 
      });
    }

    const { error } = await supabaseService
      .from('user_knowledge')
      .delete()
      .match({ id: id, user_id: userId });

    if (error) throw error;

    res.json({ 
      success: true, 
      message: 'Wissenseintrag gelöscht.' 
    });
    
  } catch (error) {
    console.error(`[User Content /anweisungen-wissen/${req.params.id} DELETE] Error:`, error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Löschen des Eintrags.', 
      details: error.message 
    });
  }
});

// === SAVE TO LIBRARY ENDPOINT ===

// Save generated text to user's library
router.post('/save-to-library', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, title, type = 'generated_text' } = req.body;
    console.log(`[User Content /save-to-library POST] Request from user ${userId}`);

    // Validate input
    if (!content || !title) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content und Titel sind erforderlich.' 
      });
    }

    // Insert into user_generated_texts table
    const { data, error } = await supabaseService
      .from('user_generated_texts')
      .insert([{
        user_id: userId,
        title: title.trim(),
        content: content.trim(),
        type: type,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('[User Content /save-to-library POST] Database error:', error);
      throw error;
    }

    console.log(`[User Content /save-to-library POST] Successfully saved text ${data.id} for user ${userId}`);
    res.json({ 
      success: true, 
      message: 'Text erfolgreich in der Bibliothek gespeichert.',
      data: data
    });
    
  } catch (error) {
    console.error('[User Content /save-to-library POST] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Speichern in der Bibliothek.', 
      details: error.message 
    });
  }
});

// Get user's saved texts from library
router.get('/saved-texts', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;
    
    let query = supabaseService
      .from('user_generated_texts')
      .select('id, title, content, type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('[User Content /saved-texts GET] Database error:', error);
      throw error;
    }

    res.json({ 
      success: true, 
      data: data || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('[User Content /saved-texts GET] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Laden der gespeicherten Texte.', 
      details: error.message 
    });
  }
});

// Delete saved text from library
router.delete('/saved-texts/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Text-ID ist erforderlich.' 
      });
    }

    const { error } = await supabaseService
      .from('user_generated_texts')
      .delete()
      .match({ id: id, user_id: userId });

    if (error) {
      console.error(`[User Content /saved-texts/${id} DELETE] Database error:`, error);
      throw error;
    }

    res.json({ 
      success: true, 
      message: 'Text erfolgreich gelöscht.' 
    });
    
  } catch (error) {
    console.error(`[User Content /saved-texts/${req.params.id} DELETE] Error:`, error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Löschen des Textes.', 
      details: error.message 
    });
  }
});

export default router; 