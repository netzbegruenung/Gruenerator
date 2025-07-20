import express from 'express';
import { supabaseService } from '../../utils/supabaseClient.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';

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
      message: 'Profil gespeichert' 
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

// Helper function to extract title from HTML/markdown content
function extractTitleFromContent(content) {
  console.log('[Title Extraction] Starting extraction for content:', content?.substring(0, 100) + '...');
  
  if (!content || typeof content !== 'string') {
    console.log('[Title Extraction] No content or invalid type');
    return null;
  }

  // Try to find h2 tag first (most common in generated content)
  const h2Match = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
  if (h2Match && h2Match[1]) {
    const h2Title = cleanTitle(h2Match[1]);
    console.log('[Title Extraction] Found h2 title:', h2Title);
    return h2Title;
  }
  console.log('[Title Extraction] No h2 tag found');

  // Fallback to h1 tag
  const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const h1Title = cleanTitle(h1Match[1]);
    console.log('[Title Extraction] Found h1 title:', h1Title);
    return h1Title;
  }
  console.log('[Title Extraction] No h1 tag found');

  // Fallback to h3 tag
  const h3Match = content.match(/<h3[^>]*>(.*?)<\/h3>/i);
  if (h3Match && h3Match[1]) {
    const h3Title = cleanTitle(h3Match[1]);
    console.log('[Title Extraction] Found h3 title:', h3Title);
    return h3Title;
  }
  console.log('[Title Extraction] No h3 tag found');

  // Special handling for social media content - look for platform names
  const socialPlatforms = ['Twitter', 'Facebook', 'Instagram', 'LinkedIn', 'TikTok'];
  for (const platform of socialPlatforms) {
    if (content.toLowerCase().includes(platform.toLowerCase())) {
      const title = `${platform}-Beitrag`;
      console.log('[Title Extraction] Found social media platform, using title:', title);
      return title;
    }
  }

  // Look for common German content types
  const contentTypes = [
    { pattern: /tweet|twitter/i, title: 'Twitter-Beitrag' },
    { pattern: /facebook/i, title: 'Facebook-Beitrag' },
    { pattern: /instagram/i, title: 'Instagram-Beitrag' },
    { pattern: /linkedin/i, title: 'LinkedIn-Beitrag' },
    { pattern: /antrag/i, title: 'Antrag' },
    { pattern: /pressemitteilung|presse/i, title: 'Pressemitteilung' },
    { pattern: /rede/i, title: 'Rede' },
    { pattern: /wahlprogramm/i, title: 'Wahlprogramm' }
  ];

  for (const type of contentTypes) {
    if (type.pattern.test(content)) {
      console.log('[Title Extraction] Found content type pattern, using title:', type.title);
      return type.title;
    }
  }

  // Fallback to first meaningful sentence
  const textContent = content.replace(/<[^>]*>/g, '').trim();
  const sentences = textContent.split(/[.!?]/);
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim();
    if (firstSentence && firstSentence.length > 10 && firstSentence.length < 100) {
      const sentenceTitle = cleanTitle(firstSentence);
      console.log('[Title Extraction] Using first sentence as title:', sentenceTitle);
      return sentenceTitle;
    }
  }

  // Final fallback to first line of text
  const firstLine = textContent.split('\n')[0];
  if (firstLine && firstLine.length > 0) {
    const firstLineTitle = cleanTitle(firstLine.substring(0, 60));
    console.log('[Title Extraction] Using first line as title:', firstLineTitle);
    return firstLineTitle;
  }

  console.log('[Title Extraction] No title could be extracted');
  return null;
}

// Helper function to clean and normalize title
function cleanTitle(title) {
  if (!title) return null;
  
  return title
    .replace(/<[^>]*>/g, '') // Remove any HTML tags
    .replace(/&[a-zA-Z0-9#]+;/g, '') // Remove HTML entities
    .trim()
    .substring(0, 200); // Limit length
}

// Save generated text to user's library
router.post('/save-to-library', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { content, title: manualTitle, type = 'universal' } = req.body;
    console.log(`[User Content /save-to-library POST] Request from user ${userId} with type: ${type}`);
    console.log(`[User Content /save-to-library POST] Content received (first 200 chars):`, content?.substring(0, 200));
    console.log(`[User Content /save-to-library POST] Manual title provided:`, manualTitle);

    // Valid content types for user_documents
    const validTypes = [
      'antrag', 'kleine_anfrage', 'grosse_anfrage',
      'pressemitteilung', 'instagram', 'facebook', 'twitter', 'linkedin', 
      'actionIdeas', 'reelScript',
      'gruene_jugend_instagram', 'gruene_jugend_twitter', 'gruene_jugend_tiktok',
      'gruene_jugend_messenger', 'gruene_jugend_reelScript', 'gruene_jugend_actionIdeas',
      'rede', 'wahlprogramm', 'universal', 'social',
      'template', 'pr_text', 'text'
    ];

    // Validate input
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content ist erforderlich.' 
      });
    }

    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: `Ungültiger Typ: ${type}. Erlaubte Typen: ${validTypes.join(', ')}` 
      });
    }

    // Try to extract title from content if no manual title provided
    let finalTitle = manualTitle;
    if (!finalTitle || finalTitle.trim() === '') {
      const extractedTitle = extractTitleFromContent(content);
      if (extractedTitle) {
        finalTitle = extractedTitle;
        console.log(`[User Content /save-to-library POST] Auto-detected title: "${finalTitle}"`);
      }
    }

    // Final fallback to date-based title
    if (!finalTitle || finalTitle.trim() === '') {
      finalTitle = `Gespeicherter Text vom ${new Date().toLocaleDateString('de-DE')}`;
      console.log(`[User Content /save-to-library POST] Using fallback title: "${finalTitle}"`);
    }

    // Generate unique document ID
    const documentId = uuidv4();

    // Calculate word and character counts
    const plainTextContent = content.replace(/<[^>]*>/g, '').trim();
    const wordCount = plainTextContent.split(/\s+/).filter(word => word.length > 0).length;
    const characterCount = plainTextContent.length;

    // Insert into user_documents table
    const { data, error } = await supabaseService
      .from('user_documents')
      .insert([{
        user_id: userId,
        document_id: documentId,
        title: finalTitle.trim(),
        document_type: type,
        content: plainTextContent,
        content_html: content.trim(),
        word_count: wordCount,
        character_count: characterCount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('[User Content /save-to-library POST] Database error:', error);
      throw error;
    }

    console.log(`[User Content /save-to-library POST] Successfully saved text ${data.document_id} for user ${userId} with title: "${finalTitle}"`);
    res.json({ 
      success: true, 
      message: 'Text erfolgreich in der Bibliothek gespeichert.',
      data: {
        id: data.document_id,
        title: data.title,
        type: data.document_type,
        created_at: data.created_at,
        word_count: data.word_count,
        character_count: data.character_count
      },
      detectedTitle: manualTitle ? false : true, // Indicate if title was auto-detected
      usedTitle: finalTitle
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
      .from('user_content')
      .select('id, title, description, content_data, type, created_at')
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

    // Transform data to match expected format
    const transformedData = data?.map(item => ({
      id: item.id,
      title: item.title,
      content: item.content_data?.content || '',
      type: item.type,
      created_at: item.created_at,
      description: item.description
    })) || [];

    res.json({ 
      success: true, 
      data: transformedData,
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
      .from('user_content')
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

// Bulk delete saved texts from library
router.delete('/saved-texts/bulk', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of text IDs is required'
      });
    }

    if (ids.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 texts can be deleted at once'
      });
    }

    console.log(`[User Content /saved-texts/bulk DELETE] Bulk delete request for ${ids.length} texts from user ${userId}`);

    // First, verify all texts belong to the user
    const { data: verifyTexts, error: verifyError } = await supabaseService
      .from('user_content')
      .select('id')
      .eq('user_id', userId)
      .in('id', ids);

    if (verifyError) {
      console.error('[User Content /saved-texts/bulk DELETE] Error verifying text ownership:', verifyError);
      throw new Error('Failed to verify text ownership');
    }

    const ownedIds = verifyTexts.map(text => text.id);
    const unauthorizedIds = ids.filter(id => !ownedIds.includes(id));

    if (unauthorizedIds.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Access denied for texts: ${unauthorizedIds.join(', ')}`,
        unauthorized_ids: unauthorizedIds
      });
    }

    // Perform bulk delete
    const { data: deletedData, error: deleteError } = await supabaseService
      .from('user_content')
      .delete()
      .eq('user_id', userId)
      .in('id', ids)
      .select('id');

    if (deleteError) {
      console.error('[User Content /saved-texts/bulk DELETE] Error during bulk delete:', deleteError);
      throw new Error('Failed to delete texts');
    }

    const deletedIds = deletedData ? deletedData.map(text => text.id) : [];
    const failedIds = ids.filter(id => !deletedIds.includes(id));

    console.log(`[User Content /saved-texts/bulk DELETE] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`);

    res.json({
      success: true,
      message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} texts deleted successfully`,
      deleted_count: deletedIds.length,
      failed_ids: failedIds,
      total_requested: ids.length,
      deleted_ids: deletedIds
    });

  } catch (error) {
    console.error('[User Content /saved-texts/bulk DELETE] Error:', error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform bulk delete of texts',
      details: error.message
    });
  }
});

export default router; 