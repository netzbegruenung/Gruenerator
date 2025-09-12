import express from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getProfileService } from '../../services/ProfileService.mjs';
import { getUserKnowledgeService } from '../../services/userKnowledgeService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import { getQdrantInstance } from '../../database/services/QdrantService.js';
import { fastEmbedService } from '../../services/FastEmbedService.js';
import { smartChunkDocument } from '../../utils/textChunker.js';

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
    const validInstructionTypes = ['antrag', 'social', 'universal', 'gruenejugend', 'custom_generator'];
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
    
    // Special handling for custom_generator - they don't use traditional instruction fields
    if (instructionType === 'custom_generator') {
      return res.json({
        success: true,
        hasInstructions: false, // Custom generators manage their own instructions
        hasGroupInstructions: false,
        instructions: {
          user: false,
          groups: []
        },
        message: 'Custom generators manage their own instruction system'
      });
    }
    
    const fieldsToCheck = fieldMapping[instructionType];
    
    // Check user instructions in profiles table
    const profileService = getProfileService();
    const profile = await profileService.getProfileById(userId);
    
    // Check if user has any instructions for this type
    const hasUserInstructions = fieldsToCheck.some(field => {
      const value = profile?.[field];
      return value && value.trim().length > 0;
    });
    
    // Get user's groups
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const memberships = await postgres.query(
      'SELECT group_id FROM group_memberships WHERE user_id = $1 AND is_active = true',
      [userId],
      { table: 'group_memberships' }
    );
    
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
      
      if (groupFieldsToCheck && groupIds.length > 0) {
        try {
          const groupInstructions = await postgres.query(
            `SELECT group_id, ${groupFieldsToCheck.join(', ')} FROM group_instructions WHERE group_id = ANY($1) AND is_active = true`,
            [groupIds],
            { table: 'group_instructions' }
          );
          
          // Filter groups that have instructions for this type
          groupsWithInstructions = groupInstructions
            ?.filter(group => {
              return groupFieldsToCheck.some(field => {
                const value = group[field];
                return value && value.trim().length > 0;
              });
            })
            ?.map(group => group.group_id) || [];
        } catch (groupInstructionsError) {
          console.warn(`[Instructions Status] Warning checking group instructions for ${instructionType}:`, groupInstructionsError);
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

      try {
        const postgres = getPostgresInstance();
        await postgres.ensureInitialized();
        const rankedData = await postgres.query(sql);
        return res.json({ success: true, data: rankedData || [] });
      } catch (sqlError) {
        console.warn('[Gallery] Direct SQL query failed, falling back to simpler query:', sqlError?.message || sqlError);
      }
    }

    // No search term: use direct PostgreSQL query
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (onlyExamples === 'true') {
      conditions.push(`is_example = $${paramIndex++}`);
      params.push(true);
    }
    if (typeList.length > 0) {
      conditions.push(`type = ANY($${paramIndex++})`);
      params.push(typeList);
    }
    if (category && category !== 'all') {
      conditions.push(`categories @> $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([category]));
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const simpleQuery = `
      SELECT id, type, title, description, content_data, categories, tags, created_at, status, is_example, is_private
      FROM database
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(parseInt(limit));
    
    const data = await postgres.query(simpleQuery, params, { table: 'database' });

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
    
    // Get profile prompts using ProfileService (single source of truth)
    const profileService = getProfileService();
    const profileData = await profileService.getProfileById(userId);
    
    // Get knowledge entries using UserKnowledgeService (single source of truth)
    const userKnowledgeService = getUserKnowledgeService();
    const knowledgeEntries = await userKnowledgeService.getUserKnowledge(userId);

    res.json({
      success: true,
      antragPrompt: profileData?.custom_antrag_prompt || '',
      antragGliederung: profileData?.custom_antrag_gliederung || '',
      socialPrompt: profileData?.custom_social_prompt || '',
      universalPrompt: profileData?.custom_universal_prompt || '',
      gruenejugendPrompt: profileData?.custom_gruenejugend_prompt || '',
      presseabbinder: profileData?.presseabbinder || '',
      knowledge: knowledgeEntries?.map(entry => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        knowledge_type: entry.knowledge_type,
        tags: entry.tags,
        created_at: entry.created_at
      })) || []
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

    // 1. Update profile prompts using ProfileService
    const profileService = getProfileService();
    const profilePayload = {
      custom_antrag_prompt: custom_antrag_prompt ?? null,
      custom_antrag_gliederung: custom_antrag_gliederung ?? null,
      custom_social_prompt: custom_social_prompt ?? null,
      custom_universal_prompt: custom_universal_prompt ?? null,
      custom_gruenejugend_prompt: custom_gruenejugend_prompt ?? null,
      presseabbinder: presseabbinder ?? null,
    };
    
    await profileService.updateProfile(userId, profilePayload);
    console.log(`[User Content /anweisungen-wissen PUT] Updated profile for user ${userId}`);

    // 2. Handle knowledge entries using UserKnowledgeService (single source of truth)
    const userKnowledgeService = getUserKnowledgeService();
    let knowledgeResults = { processed: 0, deleted: 0 };
    
    if (knowledge && Array.isArray(knowledge)) {
      try {
        // Get existing knowledge entries
        const existingKnowledge = await userKnowledgeService.getUserKnowledge(userId);
        const existingIds = existingKnowledge.map(k => k.id);
        
        // Filter valid entries (non-empty)
        const validEntries = knowledge.filter(entry => 
          (entry.title || '').trim() || (entry.content || '').trim()
        );
        
        // Get IDs of entries being submitted
        const submittedIds = validEntries
          .map(entry => entry.id)
          .filter(id => id && !(typeof id === 'string' && id.startsWith('new-')));
        
        // Delete entries not in submission
        const toDelete = existingIds.filter(id => !submittedIds.includes(id));
        for (const deleteId of toDelete) {
          await userKnowledgeService.deleteUserKnowledge(userId, deleteId);
          knowledgeResults.deleted++;
        }
        
        // Save/update all valid entries
        for (const entry of validEntries) {
          await userKnowledgeService.saveUserKnowledge(userId, entry);
          knowledgeResults.processed++;
        }
        
        console.log(`[User Content /anweisungen-wissen PUT] Knowledge processed: ${knowledgeResults.processed} saved, ${knowledgeResults.deleted} deleted`);
      } catch (error) {
        console.error(`[User Content /anweisungen-wissen PUT] Knowledge processing failed:`, error.message);
        throw error;
      }
    }

    res.json({ 
      success: true, 
      message: 'Profil gespeichert',
      knowledge_entries_processed: knowledgeResults.processed,
      knowledge_entries_deleted: knowledgeResults.deleted
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

    // Use UserKnowledgeService to delete with vector cleanup
    const userKnowledgeService = getUserKnowledgeService();
    await userKnowledgeService.ensureInitialized();
    
    await userKnowledgeService.deleteUserKnowledge(userId, id);

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
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const data = await postgres.insert('user_documents', {
      id: documentId, // PostgreSQL uses id instead of document_id
      user_id: userId,
      title: finalTitle.trim(),
      document_type: type, // Use original frontend type directly
      content: content.trim() // Store the HTML content in the content field
      // Don't include created_at and updated_at - PostgresService handles timestamps
    });

    console.log(`[User Content /save-to-library POST] Successfully saved text ${data.id} for user ${userId} with title: "${finalTitle}" (type: ${type})`);

    // Vectorize and store in Qdrant (async, don't block response)
    setImmediate(async () => {
      try {
        // Initialize services
        const qdrant = getQdrantInstance();
        await fastEmbedService.init();
        
        // Only vectorize if Qdrant is available
        if (qdrant.isAvailable()) {
          // Remove HTML tags for embedding (content now contains HTML)
          const textForEmbedding = content.replace(/<[^>]*>/g, '').trim();
          
          if (textForEmbedding.length === 0) {
            console.log(`[Vectorization] Skipping empty text for document ${documentId}`);
            return;
          }
          
          // Smart chunking based on text length
          let chunks;
          if (textForEmbedding.length < 2000) {
            // For short texts, use as single chunk
            chunks = [{
              text: textForEmbedding,
              index: 0,
              tokens: Math.ceil(textForEmbedding.length / 4),
              metadata: {}
            }];
          } else {
            // For longer texts, use smart chunking
            chunks = await smartChunkDocument(textForEmbedding, {
              maxTokens: 600,
              overlapTokens: 150,
              preserveStructure: true
            });
          }
          
          if (chunks.length === 0) {
            console.log(`[Vectorization] No chunks generated for document ${documentId}`);
            return;
          }
          
          // Generate embeddings in batches
          const batchSize = 10;
          const allChunksWithEmbeddings = [];
          
          for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const texts = batch.map(chunk => chunk.text);
            const embeddings = await fastEmbedService.generateBatchEmbeddings(texts, 'search_document');
            
            const chunksWithEmbeddings = batch.map((chunk, idx) => ({
              text: chunk.text,
              embedding: embeddings[idx],
              token_count: chunk.tokens,
              metadata: {
                title: finalTitle,
                document_type: type,
                word_count: wordCount,
                character_count: characterCount,
                chunk_of_total: `${chunk.index + 1}/${chunks.length}`,
                ...(chunk.metadata || {})
              }
            }));
            
            allChunksWithEmbeddings.push(...chunksWithEmbeddings);
          }
          
          // Index in Qdrant with user_texts collection
          await qdrant.indexDocumentChunks(
            documentId,
            allChunksWithEmbeddings,
            userId,
            'user_texts'  // Use dedicated collection
          );
          
          console.log(`[Vectorization] Vectorized ${chunks.length} chunks for document ${documentId} in user_texts collection`);
        } else {
          console.log(`[Vectorization] Qdrant unavailable, skipping vectorization for document ${documentId}`);
        }
      } catch (vectorError) {
        // Log but don't fail the save operation since it's already completed
        console.error('[Vectorization] Failed (non-critical):', vectorError.message);
      }
    });

    res.json({ 
      success: true, 
      message: 'Text erfolgreich in der Bibliothek gespeichert.',
      data: {
        id: data.id,
        title: data.title,
        type: data.document_type,
        created_at: data.created_at,
        word_count: wordCount,
        character_count: characterCount
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
    
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const conditions = ['user_id = $1'];
    const params = [userId];
    let paramIndex = 2;
    
    if (type) {
      conditions.push(`document_type = $${paramIndex++}`);
      params.push(type);
    }
    
    // Pagination
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT id as document_id, title, content, document_type, created_at
      FROM user_documents
      WHERE ${conditions.join(' AND ')} AND is_active = true
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit), offset);
    
    const data = await postgres.query(query, params, { table: 'user_documents' });

    // Transform data to match expected format
    const transformedData = data?.map(item => {
      // Compute word and character counts on-the-fly from content
      const plainText = (item.content || '').replace(/<[^>]*>/g, '').trim();
      const wordCount = plainText.split(/\s+/).filter(word => word.length > 0).length;
      const characterCount = plainText.length;
      
      return {
        id: item.document_id,
        title: item.title,
        content: item.content || '',
        type: item.document_type,
        created_at: item.created_at,
        word_count: wordCount,
        character_count: characterCount
      };
    }) || [];

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

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const result = await postgres.delete('user_documents', { id: id, user_id: userId });
    
    if (result.changes === 0) {
      console.warn(`[User Content /saved-texts/${id} DELETE] No document found or access denied`);
    }

    // Cleanup vectors from Qdrant (async, don't block response)
    setImmediate(async () => {
      try {
        const qdrant = getQdrantInstance();
        if (qdrant.isAvailable()) {
          await qdrant.deleteDocument(id, 'user_texts');
          console.log(`[Vector Cleanup] Removed vectors for document ${id} from user_texts collection`);
        }
      } catch (vectorError) {
        console.error('[Vector Cleanup] Failed (non-critical):', vectorError.message);
      }
    });

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

// Update saved text metadata (title, type, etc.)
router.post('/saved-texts/:id/metadata', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, document_type } = req.body;

    if (!title && !document_type) {
      return res.status(400).json({
        success: false,
        message: 'Title or document_type is required'
      });
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // First verify the document belongs to the user
    const existingDoc = await postgres.query(
      'SELECT id FROM user_documents WHERE id = $1 AND user_id = $2',
      [id, userId],
      { table: 'user_documents' }
    );

    if (!existingDoc.length) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }

    // Update document
    const updateData = {};
    if (title) updateData.title = title.trim();
    if (document_type) updateData.document_type = document_type;
    updateData.updated_at = new Date();

    const result = await postgres.update('user_documents', updateData, { id, user_id: userId });

    res.json({
      success: true,
      data: result,
      message: 'Document metadata updated successfully'
    });

  } catch (error) {
    console.error(`[User Content /saved-texts/${req.params.id}/metadata POST] Error:`, error.message);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update document metadata'
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

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    // First, verify all texts belong to the user
    const verifyTexts = await postgres.query(
      'SELECT id FROM user_documents WHERE user_id = $1 AND id = ANY($2) AND is_active = true',
      [userId, ids],
      { table: 'user_documents' }
    );

    const ownedIds = verifyTexts.map(text => text.id);
    const unauthorizedIds = ids.filter(id => !ownedIds.includes(id));

    if (unauthorizedIds.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Access denied for texts: ${unauthorizedIds.join(', ')}`,
        unauthorized_ids: unauthorizedIds
      });
    }

    // Perform bulk delete using soft delete
    const result = await postgres.query(
      'UPDATE user_documents SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id = ANY($2) AND is_active = true RETURNING id',
      [userId, ownedIds],
      { table: 'user_documents' }
    );

    const deletedIds = result.map(row => row.id);
    const failedIds = ownedIds.filter(id => !deletedIds.includes(id));

    console.log(`[User Content /saved-texts/bulk DELETE] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`);

    // Cleanup vectors from Qdrant for successfully deleted documents (async, don't block response)
    if (deletedIds.length > 0) {
      setImmediate(async () => {
        try {
          const qdrant = getQdrantInstance();
          if (qdrant.isAvailable()) {
            // Delete vectors for each successfully deleted document
            const cleanupPromises = deletedIds.map(async (docId) => {
              try {
                await qdrant.deleteDocument(docId, 'user_texts');
                console.log(`[Vector Cleanup] Removed vectors for document ${docId}`);
              } catch (err) {
                console.error(`[Vector Cleanup] Failed for document ${docId}:`, err.message);
              }
            });
            
            await Promise.all(cleanupPromises);
            console.log(`[Vector Cleanup] Bulk cleanup completed for ${deletedIds.length} documents`);
          }
        } catch (vectorError) {
          console.error('[Vector Cleanup] Bulk cleanup failed (non-critical):', vectorError.message);
        }
      });
    }

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
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const data = await postgres.query(
      'SELECT categories FROM database WHERE type = $1 AND status = $2 AND is_private = $3',
      ['antrag', 'published', false],
      { table: 'database' }
    );

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

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const conditions = ['type = $1', 'status = $2', 'is_private = $3'];
    const params = ['antrag', 'published', false];
    let paramIndex = 4;
    
    if (categoryId && categoryId !== 'all') {
      conditions.push(`categories @> $${paramIndex++}::jsonb`);
      params.push(JSON.stringify([categoryId]));
    }
    
    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${searchTerm.trim()}%`;
      if (searchMode === 'fulltext') {
        conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        params.push(term);
      } else {
        conditions.push(`title ILIKE $${paramIndex}`);
        params.push(term);
      }
    }
    
    const query = `
      SELECT id, title, description, tags, categories, created_at
      FROM database
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;
    
    const data = await postgres.query(query, params, { table: 'database' });

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

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const conditions = ['is_active = true'];
    const params = [];
    let paramIndex = 1;
    
    if (category === 'own') {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }
    
    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${searchTerm.trim()}%`;
      conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(term);
    }
    
    const query = `
      SELECT id, name, slug, description, created_at, user_id
      FROM custom_generators
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;
    
    const data = await postgres.query(query, params, { table: 'custom_generators' });

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

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const conditions = ['type = ANY($1)', 'status = $2', 'is_example = $3'];
    const params = [prTypes, 'published', true];
    let paramIndex = 4;
    
    if (categoryId && categoryId !== 'all') {
      if (prTypes.includes(categoryId)) {
        conditions.push(`type = $${paramIndex++}`);
        params.push(categoryId);
      } else {
        conditions.push(`categories @> $${paramIndex++}::jsonb`);
        params.push(JSON.stringify([categoryId]));
      }
    }
    
    if (searchTerm && String(searchTerm).trim().length > 0) {
      const term = `%${searchTerm.trim()}%`;
      if (searchMode === 'fulltext') {
        conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        params.push(term);
      } else {
        conditions.push(`title ILIKE $${paramIndex}`);
        params.push(term);
      }
    }
    
    const query = `
      SELECT id, title, description, content_data, type, categories, tags, created_at
      FROM database
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;
    
    const data = await postgres.query(query, params, { table: 'database' });

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

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const data = await postgres.query(
      'SELECT DISTINCT type FROM database WHERE type = ANY($1) AND status = $2 AND is_example = $3',
      [prTypes, 'published', true],
      { table: 'database' }
    );

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

// Semantic search in user's saved texts
router.post('/search-saved-texts', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, limit = 10, documentTypes = null } = req.body;
    
    console.log(`[Search Saved Texts] User ${userId} searching for: "${query}"`);
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    // Initialize services
    const qdrant = getQdrantInstance();
    await fastEmbedService.init();
    
    if (!qdrant.isAvailable()) {
      return res.status(503).json({
        success: false,
        message: 'Vector search is currently unavailable'
      });
    }
    
    // Generate query embedding
    const queryEmbedding = await fastEmbedService.generateEmbedding(query);
    
    // Build filter for user's documents
    const filter = {
      must: [
        { key: 'user_id', match: { value: userId } }
      ]
    };
    
    // Add document type filter if specified
    if (documentTypes && Array.isArray(documentTypes) && documentTypes.length > 0) {
      filter.must.push({
        key: 'document_type',
        match: { any: documentTypes }
      });
    }
    
    // Perform vector search
    const searchResults = await qdrant.searchDocuments(queryEmbedding, {
      userId: userId,
      limit: limit * 2, // Get more chunks to aggregate by document
      threshold: 0.3,
      collection: 'user_texts'
    });
    
    console.log(`[Search Saved Texts] Found ${searchResults.results.length} vector matches`);
    
    // Aggregate results by document_id
    const documentScores = new Map();
    const documentChunks = new Map();
    
    for (const result of searchResults.results) {
      const docId = result.document_id;
      
      if (!documentScores.has(docId)) {
        documentScores.set(docId, result.score);
        documentChunks.set(docId, []);
      }
      
      // Keep best score for each document
      if (result.score > documentScores.get(docId)) {
        documentScores.set(docId, result.score);
      }
      
      // Collect chunks for context
      documentChunks.get(docId).push({
        text: result.chunk_text,
        score: result.score
      });
    }
    
    // Get document details from database
    const documentIds = Array.from(documentScores.keys());
    
    if (documentIds.length === 0) {
      return res.json({
        success: true,
        results: [],
        query: query,
        total_found: 0
      });
    }
    
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();
    
    const documents = await postgres.query(
      'SELECT id as document_id, title, content, document_type, created_at FROM user_documents WHERE id = ANY($1) AND user_id = $2 AND is_active = true',
      [documentIds, userId],
      { table: 'user_documents' }
    );
    
    // Combine and sort results
    const finalResults = documents
      .map(doc => {
        // Compute word and character counts on-the-fly from content
        const plainText = (doc.content || '').replace(/<[^>]*>/g, '').trim();
        const wordCount = plainText.split(/\s+/).filter(word => word.length > 0).length;
        const characterCount = plainText.length;
        
        return {
          ...doc,
          word_count: wordCount,
          character_count: characterCount,
          relevance_score: documentScores.get(doc.document_id),
          matching_chunks: documentChunks.get(doc.document_id)
            .sort((a, b) => b.score - a.score)
            .slice(0, 2) // Top 2 chunks for preview
        };
      })
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, limit);
    
    console.log(`[Search Saved Texts] Returning ${finalResults.length} documents`);
    
    res.json({
      success: true,
      results: finalResults,
      query: query,
      total_found: finalResults.length
    });
    
  } catch (error) {
    console.error('[Search Saved Texts] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      details: error.message
    });
  }
});

export default router; 
