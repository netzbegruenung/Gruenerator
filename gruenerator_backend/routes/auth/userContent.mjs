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

// Check if user has instructions for a specific generator type (context-aware)
router.get('/instructions-status/:instructionType', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { instructionType } = req.params;
    
    // Validate instruction type
    const validInstructionTypes = ['antrag', 'social', 'universal', 'gruenejugend'];
    if (!validInstructionTypes.includes(instructionType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid instruction type. Valid types: ${validInstructionTypes.join(', ')}`
      });
    }
    
    // Map instruction types to database fields
    const fieldMapping = {
      antrag: ['custom_antrag_prompt', 'custom_antrag_gliederung'],
      social: ['custom_social_prompt', 'presseabbinder'], 
      universal: ['custom_universal_prompt'],
      gruenejugend: ['custom_gruenejugend_prompt']
    };
    
    const fieldsToCheck = fieldMapping[instructionType];
    
    // Check user instructions in profiles table
    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select(fieldsToCheck.join(', '))
      .eq('id', userId)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
      throw new Error(`Failed to check user instructions: ${profileError.message}`);
    }
    
    // Check if user has any instructions for this type
    const hasUserInstructions = fieldsToCheck.some(field => {
      const value = profile?.[field];
      return value && value.trim().length > 0;
    });
    
    // Get user's groups
    const { data: memberships, error: membershipError } = await supabaseService
      .from('group_memberships')
      .select('group_id')
      .eq('user_id', userId);
    
    if (membershipError) {
      throw new Error(`Failed to fetch user groups: ${membershipError.message}`);
    }
    
    const groupIds = memberships?.map(m => m.group_id) || [];
    let groupsWithInstructions = [];
    
    // Map instruction type to group instruction fields (function-scoped for response object access)
    const groupFieldMapping = {
      antrag: ['custom_antrag_prompt'],
      social: ['custom_social_prompt']
    };
    
    // Only check groups for instruction types that support group instructions
    if (groupIds.length > 0 && ['antrag', 'social'].includes(instructionType)) {
      
      const groupFieldsToCheck = groupFieldMapping[instructionType];
      
      if (groupFieldsToCheck) {
        const { data: groupInstructions, error: groupInstructionsError } = await supabaseService
          .from('group_instructions')
          .select(`group_id, ${groupFieldsToCheck.join(', ')}`)
          .in('group_id', groupIds);
        
        if (groupInstructionsError) {
          console.warn(`[Instructions Status] Warning checking group instructions for ${instructionType}:`, groupInstructionsError);
        } else {
          // Filter groups that have instructions for this type
          groupsWithInstructions = groupInstructions
            ?.filter(group => {
              return groupFieldsToCheck.some(field => {
                const value = group[field];
                return value && value.trim().length > 0;
              });
            })
            ?.map(group => group.group_id) || [];
        }
      }
    }
    
    const hasAnyInstructions = hasUserInstructions || groupsWithInstructions.length > 0;
    
    console.log(`[Instructions Status ${instructionType.toUpperCase()}] User ${userId}: hasUser=${hasUserInstructions}, groupsWithInstructions=[${groupsWithInstructions.join(',')}], hasAny=${hasAnyInstructions}`);
    
    res.json({
      success: true,
      instructionType,
      hasUserInstructions,
      groupsWithInstructions,
      totalGroups: groupIds.length,
      hasAnyInstructions,
      checkedFields: {
        user: fieldsToCheck,
        groups: ['antrag', 'social'].includes(instructionType) ? groupFieldMapping[instructionType] || [] : []
      }
    });
    
  } catch (error) {
    console.error(`[User Content /instructions-status/${req.params.instructionType} GET] Error:`, error);
    res.status(500).json({
      success: false,
      message: 'Error checking instructions status',
      details: error.message
    });
  }
});

// Unified database listing for ContentGallery (examples by default)
router.get('/database', ensureAuthenticated, async (req, res) => {
  try {
    const {
      searchTerm = '',
      searchMode = 'title',
      category,
      types, // comma-separated types
      onlyExamples = 'true',
      status = 'published',
      limit = '200'
    } = req.query;

    // Precompute type list for both SQL and query builder paths
    const typeList = types
      ? String(types)
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
      : [];

    // If we have a search term, prefer RPC with SQL to enable ranking (exact, prefix, substring)
    if (searchTerm && String(searchTerm).trim().length > 0) {
      const raw = String(searchTerm).trim();
      // Escape for LIKE and regex
      const likeTerm = raw.replace(/'/g, "''");
      const escapedRegex = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''");
      const patternExact = `E'\\m${escapedRegex}\\M'`;
      const patternPrefix = `E'\\m${escapedRegex}'`;

      const conditions = [];
      if (status) conditions.push(`status = '${String(status).replace(/'/g, "''")}'`);
      if (onlyExamples === 'true') conditions.push(`is_example = true`);
      if (typeList.length > 0) {
        const typeIn = typeList.map(t => `'${t.replace(/'/g, "''")}'`).join(',');
        conditions.push(`type IN (${typeIn})`);
      }
      if (category && category !== 'all') {
        const catJson = `[\"${String(category).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}\"]`;
        conditions.push(`categories @> '${catJson.replace(/'/g, "''")}'::jsonb`);
      }

      const likeExpr = `('%${likeTerm}%' )`;
      const searchOr = `(
        title ILIKE '%${likeTerm}%' OR
        description ILIKE '%${likeTerm}%' OR
        content_data->>'content' ILIKE '%${likeTerm}%' OR
        content_data->>'caption' ILIKE '%${likeTerm}%' OR
        content_data->>'text' ILIKE '%${likeTerm}%'
      )`;

      conditions.push(searchOr);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `
        SELECT 
          id, type, title, description, content_data, categories, tags, created_at, status, is_example, is_private,
          CASE 
            WHEN (title ~* ${patternExact} OR description ~* ${patternExact} OR content_data->>'content' ~* ${patternExact} OR content_data->>'caption' ~* ${patternExact} OR content_data->>'text' ~* ${patternExact}) THEN 0
            WHEN (title ~* ${patternPrefix} OR description ~* ${patternPrefix} OR content_data->>'content' ~* ${patternPrefix} OR content_data->>'caption' ~* ${patternPrefix} OR content_data->>'text' ~* ${patternPrefix}) THEN 1
            WHEN ${searchOr} THEN 2
            ELSE 3
          END AS rank_bucket
        FROM database
        ${where}
        ORDER BY rank_bucket ASC, created_at DESC
        LIMIT ${parseInt(limit)}
      `;

      const { data: rankedData, error: sqlError } = await supabaseService.rpc('execute_sql', { sql });
      if (!sqlError) {
        return res.json({ success: true, data: rankedData || [] });
      }
      console.warn('[Gallery] execute_sql RPC unavailable or failed, falling back to query builder:', sqlError?.message || sqlError);
    }

    // No search term: use query builder
    let query = supabaseService
      .from('database')
      .select('id, type, title, description, content_data, categories, tags, created_at, status, is_example, is_private')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }
    if (onlyExamples === 'true') {
      query = query.eq('is_example', true);
    }
    if (typeList.length > 0) {
      query = query.in('type', typeList);
    }
    if (category && category !== 'all') {
      query = query.contains('categories', [category]);
    }

    const { data, error } = await query;
    if (error) throw error;

    // If we had a search term, apply ranking in Node as fallback
    let responseData = data || [];
    if (searchTerm && String(searchTerm).trim().length > 0) {
      const q = String(searchTerm).trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRe = new RegExp(`\\b${escaped}\\b`, 'i');
      const prefixRe = new RegExp(`\\b${escaped}\\w+`, 'i');
      const substringRe = new RegExp(escaped, 'i');
      const scoreItem = (row) => {
        const textParts = [
          row?.title || '',
          row?.description || '',
          row?.content_data?.content || '',
          row?.content_data?.caption || '',
          row?.content_data?.text || ''
        ];
        const combined = textParts.join(' ');
        if (wordRe.test(combined)) return 0;
        if (prefixRe.test(combined)) return 1;
        if (substringRe.test(combined)) return 2;
        return 3;
      };
      responseData = responseData
        .map(r => ({ r, s: scoreItem(r) }))
        .sort((a, b) => {
          if (a.s !== b.s) return a.s - b.s;
          const at = new Date(a.r.created_at).getTime();
          const bt = new Date(b.r.created_at).getTime();
          return bt - at;
        })
        .map(x => x.r);
    }

    res.json({ success: true, data: responseData });
  } catch (err) {
    console.error('[Gallery] /database GET error:', err);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Datenbank-Inhalte', details: err.message, data: [] });
  }
});

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

    // Valid content types (now matching expanded database constraint)
    const validTypes = [
      // General types
      'text', 'antrag', 'social', 'universal', 'press', 'gruene_jugend', 'template',
      // Social media types
      'instagram', 'facebook', 'twitter', 'linkedin',
      // Content format types  
      'actionIdeas', 'reelScript',
      // Grüne Jugend social media
      'gruene_jugend_instagram', 'gruene_jugend_twitter', 'gruene_jugend_tiktok', 'gruene_jugend_messenger',
      // Grüne Jugend content formats
      'gruene_jugend_reelScript', 'gruene_jugend_actionIdeas', 
      // Parliamentary types
      'kleine_anfrage', 'grosse_anfrage', 'rede', 'wahlprogramm',
      // Press types
      'pressemitteilung', 'pr_text'
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
        document_type: type, // Use original frontend type directly
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

    console.log(`[User Content /save-to-library POST] Successfully saved text ${data.document_id} for user ${userId} with title: "${finalTitle}" (type: ${type})`);
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
      .from('database')
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
      .from('database')
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
      .from('database')
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
      .from('database')
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

// === GALLERY SUPPORT ENDPOINTS ===

// Categories for Anträge gallery
router.get('/antraege-categories', ensureAuthenticated, async (req, res) => {
  try {
    const { data, error } = await supabaseService
      .from('database')
      .select('categories')
      .eq('type', 'antrag')
      .eq('status', 'published')
      .eq('is_private', false);

    if (error) throw error;

    const allCategories = (data || [])
      .flatMap(row => Array.isArray(row.categories) ? row.categories : [])
      .filter(Boolean);

    const unique = [...new Set(allCategories)].sort();
    const categories = unique.map(c => ({ id: c, label: c }));

    res.json({ success: true, categories });
  } catch (err) {
    console.error('[Gallery] /antraege-categories error:', err);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Kategorien', details: err.message });
  }
});

// List Anträge for gallery with optional search and category
router.get('/antraege', ensureAuthenticated, async (req, res) => {
  try {
    const { searchTerm = '', searchMode = 'title', categoryId } = req.query;

    let query = supabaseService
      .from('database')
      .select('id, title, description, tags, categories, created_at')
      .eq('type', 'antrag')
      .eq('status', 'published')
      .eq('is_private', false)
      .order('created_at', { ascending: false });

    if (categoryId && categoryId !== 'all') {
      query = query.contains('categories', [categoryId]);
    }

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${searchTerm.trim()}%`;
      if (searchMode === 'fulltext') {
        query = query.or(
          `title.ilike.${term},description.ilike.${term}`
        );
      } else {
        // default: title search
        query = query.ilike('title', term);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, antraege: data || [] });
  } catch (err) {
    console.error('[Gallery] /antraege GET error:', err);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Anträge', details: err.message, antraege: [] });
  }
});

// List Custom Generators for gallery
router.get('/custom-generators', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { searchTerm = '', category } = req.query;

    let query = supabaseService
      .from('custom_generators')
      .select('id, name, slug, description, created_at, user_id')
      .order('created_at', { ascending: false });

    if (category === 'own') {
      query = query.eq('user_id', userId);
    }
    // category === 'shared' or 'popular' not implemented yet; return all for now

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${searchTerm.trim()}%`;
      query = query.or(`name.ilike.${term},description.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Map to expected minimal fields
    const generators = (data || []).map(g => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      description: g.description,
      created_at: g.created_at
    }));

    res.json({ success: true, generators });
  } catch (err) {
    console.error('[Gallery] /custom-generators GET error:', err);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der Grüneratoren', details: err.message, generators: [] });
  }
});

// List PR texts (Öffentlichkeitsarbeit) including social platforms and press examples
router.get('/pr-texts', ensureAuthenticated, async (req, res) => {
  try {
    const { searchTerm = '', searchMode = 'title', categoryId } = req.query;

    const prTypes = ['instagram', 'facebook', 'twitter', 'linkedin', 'pressemitteilung', 'pr_text'];

    let query = supabaseService
      .from('database')
      .select('id, title, description, content_data, type, categories, tags, created_at')
      .in('type', prTypes)
      .eq('status', 'published')
      .eq('is_example', true)
      .order('created_at', { ascending: false });

    if (categoryId && categoryId !== 'all') {
      if (prTypes.includes(categoryId)) {
        query = query.eq('type', categoryId);
      } else {
        query = query.contains('categories', [categoryId]);
      }
    }

    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${searchTerm.trim()}%`;
      if (searchMode === 'fulltext') {
        query = query.or(`title.ilike.${term},description.ilike.${term}`);
      } else {
        query = query.ilike('title', term);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    // Format for frontend consumption
    const results = (data || []).map(row => {
      let content = '';
      if (row?.content_data?.content) content = row.content_data.content;
      else if (row?.content_data?.caption) content = row.content_data.caption;
      else if (row?.description) content = row.description;
      else if (typeof row?.content_data === 'string') content = row.content_data;
      return {
        id: row.id,
        title: row.title,
        content,
        type: row.type,
        categories: row.categories || [],
        tags: row.tags || [],
        created_at: row.created_at
      };
    });

    // Return raw array to match current frontend expectations
    res.json(results);
  } catch (err) {
    console.error('[Gallery] /pr-texts GET error:', err);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der PR-Texte', details: err.message });
  }
});

// Categories for PR texts (returns list of {id,label})
router.get('/pr-texts/categories', ensureAuthenticated, async (req, res) => {
  try {
    const prTypes = ['instagram', 'facebook', 'twitter', 'linkedin', 'pressemitteilung', 'pr_text'];

    const { data, error } = await supabaseService
      .from('database')
      .select('type')
      .in('type', prTypes)
      .eq('status', 'published')
      .eq('is_example', true);

    if (error) throw error;

    const presentTypes = [...new Set((data || []).map(r => r.type))];
    const labelMap = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      twitter: 'Twitter',
      linkedin: 'LinkedIn',
      pressemitteilung: 'Pressemitteilung',
      pr_text: 'PR-Text'
    };
    const categories = [{ id: 'all', label: 'Alle Kategorien' }].concat(
      presentTypes.sort().map(t => ({ id: t, label: labelMap[t] || t }))
    );

    res.json({ success: true, categories });
  } catch (err) {
    console.error('[Gallery] /pr-texts/categories GET error:', err);
    res.status(500).json({ success: false, message: 'Fehler beim Laden der PR-Kategorien', details: err.message });
  }
});

export default router; 