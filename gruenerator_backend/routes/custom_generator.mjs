import express from 'express';
import { HTML_FORMATTING_INSTRUCTIONS, extractCitationsFromText, processAIResponseWithCitations } from '../utils/promptUtils.js';
import { supabaseService } from '../utils/supabaseClient.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { vectorSearchService } from '../services/vectorSearchService.js';

const { requireAuth } = authMiddlewareModule;
const router = express.Router();

// Tool definition for custom generator document search
const SEARCH_GENERATOR_DOCUMENTS_TOOL = {
  name: 'search_generator_documents',
  description: 'Search through documents associated with this custom generator to find relevant information for generating the requested content. Use this tool to find specific facts, quotes, or context from the generator\'s knowledge base.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search terms to find relevant content in the generator\'s documents. Be specific and focused on what information you need.'
      },
      search_mode: {
        type: 'string',
        enum: ['vector', 'hybrid', 'keyword'],
        description: 'Search mode: vector (semantic), hybrid (semantic + keyword), or keyword (text matching). Default is hybrid for best results.'
      }
    },
    required: ['query']
  }
};

router.post('/', async (req, res) => {
  const { slug, formData } = req.body;
  
  // Check if the correct supabaseService client is initialized
  if (!supabaseService) {
    console.error('[custom_generator] Supabase service client not initialized.');
    return res.status(503).json({ error: 'Custom generator service is currently unavailable due to configuration issues with the service client.' });
  }

  try {
    console.log('[custom_generator] Anfrage erhalten:', { slug, formData });

    // Use supabaseService to fetch generator configuration
    const { data: generators, error: fetchError } = await supabaseService
      .from('custom_generators')
      .select('*')
      .eq('slug', slug)
      .limit(1);

    if (fetchError) throw fetchError;
    if (!generators || generators.length === 0) {
      return res.status(404).json({ error: 'Generator nicht gefunden' });
    }

    const generator = generators[0];
    
    // Check if generator has associated documents
    const { data: generatorDocuments, error: documentsError } = await supabaseService
      .from('custom_generator_documents')
      .select('document_id')
      .eq('custom_generator_id', generator.id);

    if (documentsError) {
      console.warn('[custom_generator] Error fetching generator documents:', documentsError);
    }

    const hasDocuments = generatorDocuments && generatorDocuments.length > 0;
    const documentIds = hasDocuments ? generatorDocuments.map(gd => gd.document_id) : null;

    console.log(`[custom_generator] Generator "${generator.name}" has ${hasDocuments ? documentIds.length : 0} associated documents`);

    // Platzhalter im Prompt mit den Formulardaten ersetzen
    let processedPrompt = generator.prompt;
    Object.entries(formData).forEach(([key, value]) => {
      processedPrompt = processedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    // Append HTML formatting instructions
    processedPrompt += `\n\n${HTML_FORMATTING_INSTRUCTIONS}`;

    if (hasDocuments) {
      // Use document-enhanced generation with tool support
      const result = await handleDocumentEnhancedGeneration(
        processedPrompt, 
        formData, 
        generator, 
        documentIds, 
        req.app.locals.aiWorkerPool
      );
      res.json(result);
    } else {
      // Use standard generation without documents
      const result = await handleStandardGeneration(
        processedPrompt, 
        req.app.locals.aiWorkerPool
      );
      res.json(result);
    }

  } catch (error) {
    console.error('[custom_generator] Fehler bei der Textgenerierung:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Textgenerierung',
      details: error.message 
    });
  }
});

/**
 * Handle standard generation without documents
 */
async function handleStandardGeneration(processedPrompt, aiWorkerPool) {
  console.log('[custom_generator] Using standard generation (no documents)');

  const result = await aiWorkerPool.processRequest({
    type: 'custom',
    systemPrompt: processedPrompt,
    messages: [{
      role: 'user',
      content: 'Bitte generiere den Text basierend auf den gegebenen Informationen.'
    }],
    options: {
      max_tokens: 4000,
      temperature: 0.7
    }
  });

  console.log('[custom_generator] AI Worker Antwort erhalten:', {
    success: result.success,
    contentLength: result.content?.length,
    error: result.error
  });

  if (!result.success) {
    console.error('[custom_generator] AI Worker Fehler:', result.error);
    throw new Error(result.error);
  }

  return { 
    content: result.content,
    metadata: result.metadata
  };
}

/**
 * Handle document-enhanced generation with tool support
 */
async function handleDocumentEnhancedGeneration(processedPrompt, formData, generator, documentIds, aiWorkerPool) {
  console.log('[custom_generator] Using document-enhanced generation with tools');
  
  // Enhanced system prompt that encourages tool use when relevant
  const enhancedSystemPrompt = `${processedPrompt}

WICHTIG: Dieser Generator hat Zugang zu speziellen Dokumenten als Wissensquelle. Falls du spezifische Informationen, Fakten oder Zitate benötigst, um eine hochwertige Antwort zu generieren, verwende das search_generator_documents Tool, um relevante Inhalte aus der Wissensbasis zu finden.

Die Formulardaten sind: ${JSON.stringify(formData, null, 2)}`;

  // Initial conversation state
  let messages = [{
    role: "user",
    content: `Generiere den gewünschten Text basierend auf den gegebenen Formulardaten. Falls spezifische Informationen aus Dokumenten benötigt werden, nutze das search_generator_documents Tool.

Formulardaten: ${JSON.stringify(formData, null, 2)}`
  }];
  
  let allSearchResults = [];
  let searchCount = 0;
  const maxSearches = 3; // Limit searches for performance
  
  console.log('[custom_generator] Starting document-enhanced conversation');
  
  // Conversation loop to handle tool calls
  while (searchCount < maxSearches) {
    console.log(`[custom_generator] Conversation round ${searchCount + 1}`);
    
    // Make AI request with tools
    const aiResult = await aiWorkerPool.processRequest({
      type: 'custom_with_documents',
      messages: messages,
      systemPrompt: enhancedSystemPrompt,
      options: {
        max_tokens: 4000,
        temperature: 0.7,
        useBedrock: true,
        anthropic_version: "bedrock-2023-05-31",
        tools: [SEARCH_GENERATOR_DOCUMENTS_TOOL]
      }
    });
    
    console.log('[custom_generator] AI Result:', {
      success: aiResult.success,
      hasContent: !!aiResult.content,
      stopReason: aiResult.stop_reason,
      hasToolCalls: !!(aiResult.tool_calls && aiResult.tool_calls.length > 0)
    });
    
    if (!aiResult.success) {
      throw new Error(aiResult.error || 'AI request failed');
    }
    
    // Add assistant's response to conversation
    if (aiResult.raw_content_blocks) {
      messages.push({
        role: "assistant",
        content: aiResult.raw_content_blocks
      });
    }
    
    // Handle tool calls if present
    if (aiResult.stop_reason === 'tool_use' && aiResult.tool_calls && aiResult.tool_calls.length > 0) {
      console.log(`[custom_generator] Processing ${aiResult.tool_calls.length} document search tool calls`);
      
      const toolResults = [];
      
      for (const toolCall of aiResult.tool_calls) {
        if (toolCall.name === 'search_generator_documents') {
          console.log(`[custom_generator] Executing document search: "${toolCall.input.query}"`);
          
          const searchResult = await executeGeneratorDocumentSearch(toolCall.input, generator.user_id, documentIds);
          allSearchResults.push(...searchResult.results);
          
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: JSON.stringify({
              success: searchResult.success,
              results: searchResult.results,
              query: toolCall.input.query,
              searchType: searchResult.searchType,
              message: searchResult.message
            })
          });
          
          searchCount++;
        }
      }
      
      // Add tool results to conversation
      if (toolResults.length > 0) {
        messages.push({
          role: "user",
          content: toolResults
        });
      }
      
      // Continue the conversation
      continue;
    }
    
    // No more tool calls - we have the final answer
    if (aiResult.content) {
      console.log('[custom_generator] Got final answer, processing response');
      return await processFinalGeneratorResponse(aiResult.content, allSearchResults, generator, formData);
    }
    
    // Safety break
    break;
  }
  
  // Fallback if conversation didn't complete normally
  throw new Error('Document-enhanced generation did not complete successfully');
}

/**
 * Execute document search for custom generator
 */
async function executeGeneratorDocumentSearch(toolInput, userId, documentIds) {
  try {
    const { query, search_mode = 'hybrid' } = toolInput;
    
    console.log(`[custom_generator] Executing document search: "${query}" (mode: ${search_mode}) for ${documentIds.length} documents`);
    
    // Use vector search service with document filtering
    const searchResults = await vectorSearchService.search({
      query: query,
      user_id: userId,
      documentIds: documentIds,
      limit: 5,
      mode: search_mode
    });
    
    // Format results for Claude
    const formattedResults = (searchResults.results || []).map((result, index) => {
      const title = result.title || result.document_title;
      const content = result.relevant_content || result.chunk_text;
      
      return {
        document_id: result.document_id,
        title: title,
        content: content.substring(0, 800), // Limit content length for tool response
        similarity_score: result.similarity_score,
        filename: result.filename,
        chunk_index: result.chunk_index || 0,
        relevance_info: result.relevance_info
      };
    });
    
    return {
      success: true,
      results: formattedResults,
      searchType: searchResults.searchType,
      message: `Found ${formattedResults.length} relevant documents from generator's knowledge base`
    };
    
  } catch (error) {
    console.error('[custom_generator] Document search tool error:', error);
    return {
      success: false,
      results: [],
      error: error.message,
      message: 'Document search failed'
    };
  }
}

/**
 * Process the final response from Claude and extract citations
 */
async function processFinalGeneratorResponse(responseContent, allSearchResults, generator, formData) {
  console.log('[custom_generator] Processing final response, length:', responseContent.length);
  
  // Create document context from all search results for citation extraction
  const documentContext = [];
  const seenDocuments = new Set();
  
  allSearchResults.forEach((result, index) => {
    const docId = result.document_id;
    if (!seenDocuments.has(docId)) {
      seenDocuments.add(docId);
      documentContext.push({
        index: documentContext.length + 1,
        title: result.title,
        content: result.content,
        metadata: {
          document_id: result.document_id,
          similarity_score: result.similarity_score,
          chunk_index: result.chunk_index || 0,
          filename: result.filename
        }
      });
    }
  });
  
  let citations = [];
  let answer = responseContent;
  
  // Extract citations if we have search results
  if (allSearchResults.length > 0) {
    console.log('[custom_generator] Extracting citations from response...');
    citations = extractCitationsFromText(responseContent, documentContext, 'custom_generator');
    
    // Process the response to add citation markers
    const processedResponse = processAIResponseWithCitations(responseContent, citations);
    answer = processedResponse.processedAnswer;
  }
  
  console.log('[custom_generator] Citation extraction complete. Found', citations.length, 'citations');
  
  // Prepare sources information
  const sources = documentContext.map((doc, idx) => {
    const citationsForDoc = citations.filter(c => c.document_id === doc.metadata.document_id);
    return {
      document_id: doc.metadata.document_id,
      document_title: doc.title,
      chunk_text: doc.content.substring(0, 200) + '...',
      similarity_score: doc.metadata.similarity_score,
      citations: citationsForDoc
    };
  }).filter(source => source.citations.length > 0); // Only include sources that were actually cited
  
  return {
    content: answer,
    sources: sources,
    citations: citations,
    metadata: {
      generator: {
        id: generator.id,
        name: generator.name,
        slug: generator.slug
      },
      formData: formData,
      searchCount: allSearchResults.length,
      uniqueDocuments: documentContext.length,
      provider: 'custom_generator_with_documents',
      timestamp: new Date().toISOString(),
      toolUseEnabled: true
    }
  };
}

// GET Route zum Abrufen aller benutzerdefinierten Generatoren
router.get('/', async (req, res) => {
  try {
    // Prüfe, ob der Client initialisiert ist
    if (!supabaseService) {
      return res.status(500).json({ error: 'Supabase client not initialized. Check backend environment variables.' });
    }

    // Verwende den Anon-Client zum Abrufen der Daten
    const { data: generators, error: fetchError } = await supabaseService
      .from('custom_generators')
      .select('id, name, slug, title, description'); // Wähle nur benötigte Felder

    if (fetchError) {
      console.error('Error fetching custom generators:', fetchError);
      return res.status(500).json({ error: fetchError.message });
    }

    res.json(generators);
  } catch (error) {
    console.error('Unexpected error fetching custom generators:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

// Neue Route zur Überprüfung der Slug-Verfügbarkeit
router.get('/check-slug/:slug', async (req, res) => {
  const { slug } = req.params;

  if (!supabaseService) {
    console.error('[custom_generator_check_slug] Supabase service client not initialized.');
    return res.status(503).json({ error: 'Service is currently unavailable.' });
  }

  if (!slug || slug.trim() === '') {
    return res.status(400).json({ error: 'Slug darf nicht leer sein.' });
  }

  try {
    const { data, error } = await supabaseService
      .from('custom_generators')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle(); // maybeSingle() ist gut, da es null zurückgibt, wenn nichts gefunden wird, anstatt eines Fehlers

    if (error) {
      console.error('[custom_generator_check_slug] Error fetching slug from Supabase:', error);
      return res.status(500).json({ error: 'Fehler bei der Überprüfung des Slugs.' });
    }

    res.json({ exists: !!data }); // Gibt true zurück, wenn data ein Objekt ist (also existiert), sonst false

  } catch (error) {
    console.error('[custom_generator_check_slug] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' });
  }
});

// GET Route zum Abrufen eines benutzerdefinierten Generators per Slug
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!supabaseService) {
      console.error('[custom_generator_get_by_slug] Supabase service client not initialized.');
      return res.status(503).json({ error: 'Service is currently unavailable.' });
    }

    if (!slug || slug.trim() === '') {
      return res.status(400).json({ error: 'Slug darf nicht leer sein.' });
    }

    // Fetch generator by slug
    const { data: generator, error: fetchError } = await supabaseService
      .from('custom_generators')
      .select('*')
      .eq('slug', slug)
      .single();

    if (fetchError) {
      console.error('[custom_generator_get_by_slug] Error fetching generator from Supabase:', fetchError);
      if (fetchError.code === 'PGRST116') { // Not found
        return res.status(404).json({ error: 'Generator nicht gefunden.' });
      }
      return res.status(500).json({ error: 'Fehler beim Laden des Generators.' });
    }

    if (!generator) {
      return res.status(404).json({ error: 'Generator nicht gefunden.' });
    }

    res.json({ 
      success: true, 
      generator: generator 
    });

  } catch (error) {
    console.error('[custom_generator_get_by_slug] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' });
  }
});

// DELETE Route zum Löschen eines benutzerdefinierten Generators
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    // Supabase client check is good
    if (!supabaseService) {
      console.error('[custom_generator_delete] Supabase service client not initialized.');
      return res.status(500).json({ error: 'Custom generator service is currently unavailable.' });
    }

    // Prüfe zuerst, ob der Generator existiert und dem User gehört
    const { data: generator, error: fetchError } = await supabaseService
      .from('custom_generators')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[custom_generator_delete] Error fetching generator for ownership check:', fetchError);
      if (fetchError.code === 'PGRST116') { // PGRST116: Searched for a single row, but found no rows
        return res.status(404).json({ error: 'Generator nicht gefunden.' });
      }
      // anderer Supabase Fehler beim Holen der Daten
      return res.status(500).json({ error: 'Fehler beim Überprüfen des Generators: ' + fetchError.message });
    }

    // Da .single() bei Nicht-Existenz einen Fehler wirft (PGRST116), ist ein expliziter `if (!generator)` Check hier
    // eigentlich nicht mehr nötig, wenn fetchError.code === 'PGRST116' oben behandelt wird.
    // Ein zusätzlicher Check schadet aber nicht, falls sich das Verhalten von .single() ändert oder `null` zurückgibt ohne Fehler.
    if (!generator) {
        console.warn('[custom_generator_delete] Generator object was null after fetch without PGRST116 error, responding 404.');
        return res.status(404).json({ error: 'Generator nicht gefunden (unexpected state).' });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_delete] User ${userId} attempted to delete generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Löschen dieses Generators.' });
    }

    // Lösche den Generator
    const { error: deleteError } = await supabaseService
      .from('custom_generators')
      .delete()
      .eq('id', id)
      .eq('user_id', userId); // Stellt sicher, dass der User nur eigene löscht

    if (deleteError) {
      console.error('[custom_generator_delete] Error deleting custom generator from Supabase:', deleteError);
      return res.status(500).json({ error: 'Fehler beim Löschen des Generators: ' + deleteError.message });
    }

    console.log(`[custom_generator_delete] Generator ${id} successfully deleted by user ${userId}`);
    res.status(204).send();

  } catch (error) {
    console.error('[custom_generator_delete] Unexpected error during delete operation:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

// === DOCUMENT MANAGEMENT ENDPOINTS ===

// Get documents associated with a custom generator
router.get('/:id/documents', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    if (!supabaseService) {
      console.error('[custom_generator_documents_get] Supabase service client not initialized.');
      return res.status(500).json({ error: 'Custom generator service is currently unavailable.' });
    }

    // First verify the generator exists and belongs to the user
    const { data: generator, error: generatorError } = await supabaseService
      .from('custom_generators')
      .select('id, user_id, name')
      .eq('id', id)
      .single();

    if (generatorError) {
      console.error('[custom_generator_documents_get] Error fetching generator:', generatorError);
      if (generatorError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Generator nicht gefunden.' });
      }
      return res.status(500).json({ error: 'Fehler beim Überprüfen des Generators: ' + generatorError.message });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_documents_get] User ${userId} attempted to access generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Zugriff auf diesen Generator.' });
    }

    // Fetch associated documents
    const { data: generatorDocuments, error: documentsError } = await supabaseService
      .from('custom_generator_documents')
      .select(`
        id,
        document_id,
        created_at,
        documents:document_id (
          id,
          title,
          filename,
          status,
          page_count,
          created_at
        )
      `)
      .eq('custom_generator_id', id);

    if (documentsError) {
      console.error('[custom_generator_documents_get] Error fetching documents:', documentsError);
      return res.status(500).json({ error: 'Fehler beim Laden der Dokumente: ' + documentsError.message });
    }

    // Format the response
    const documents = (generatorDocuments || []).map(gd => ({
      id: gd.documents.id,
      title: gd.documents.title,
      filename: gd.documents.filename,
      status: gd.documents.status,
      page_count: gd.documents.page_count,
      created_at: gd.documents.created_at,
      added_to_generator_at: gd.created_at
    }));

    console.log(`[custom_generator_documents_get] Found ${documents.length} documents for generator ${generator.name}`);
    res.json({ 
      success: true, 
      documents,
      generator: {
        id: generator.id,
        name: generator.name
      }
    });

  } catch (error) {
    console.error('[custom_generator_documents_get] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

// Add documents to a custom generator
router.post('/:id/documents', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { documentIds } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    if (!supabaseService) {
      console.error('[custom_generator_documents_post] Supabase service client not initialized.');
      return res.status(500).json({ error: 'Custom generator service is currently unavailable.' });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Dokument-IDs sind erforderlich.' });
    }

    // First verify the generator exists and belongs to the user
    const { data: generator, error: generatorError } = await supabaseService
      .from('custom_generators')
      .select('id, user_id, name')
      .eq('id', id)
      .single();

    if (generatorError) {
      console.error('[custom_generator_documents_post] Error fetching generator:', generatorError);
      if (generatorError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Generator nicht gefunden.' });
      }
      return res.status(500).json({ error: 'Fehler beim Überprüfen des Generators: ' + generatorError.message });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_documents_post] User ${userId} attempted to modify generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Bearbeiten dieses Generators.' });
    }

    // Verify all documents exist and belong to the user
    const { data: userDocuments, error: documentsError } = await supabaseService
      .from('documents')
      .select('id, title, status')
      .eq('user_id', userId)
      .in('id', documentIds);

    if (documentsError) {
      console.error('[custom_generator_documents_post] Error verifying documents:', documentsError);
      return res.status(500).json({ error: 'Fehler beim Überprüfen der Dokumente: ' + documentsError.message });
    }

    if (!userDocuments || userDocuments.length !== documentIds.length) {
      return res.status(400).json({ error: 'Einige Dokumente wurden nicht gefunden oder gehören nicht zu Ihnen.' });
    }

    // Check for documents that are not completed
    const incompleteDocuments = userDocuments.filter(doc => doc.status !== 'completed');
    if (incompleteDocuments.length > 0) {
      return res.status(400).json({ 
        error: `Folgende Dokumente sind noch nicht verarbeitet: ${incompleteDocuments.map(d => d.title).join(', ')}` 
      });
    }

    // Prepare data for insertion (avoiding duplicates)
    const documentsToAdd = documentIds.map(docId => ({
      custom_generator_id: id,
      document_id: docId,
      created_at: new Date().toISOString()
    }));

    // Insert documents (using upsert to handle duplicates gracefully)
    const { data: insertedDocs, error: insertError } = await supabaseService
      .from('custom_generator_documents')
      .upsert(documentsToAdd, { 
        onConflict: 'custom_generator_id,document_id',
        ignoreDuplicates: true 
      })
      .select();

    if (insertError) {
      console.error('[custom_generator_documents_post] Error inserting documents:', insertError);
      return res.status(500).json({ error: 'Fehler beim Hinzufügen der Dokumente: ' + insertError.message });
    }

    console.log(`[custom_generator_documents_post] Added ${insertedDocs?.length || 0} documents to generator ${generator.name}`);
    res.json({ 
      success: true, 
      message: `${documentIds.length} Dokument(e) erfolgreich hinzugefügt.`,
      addedCount: insertedDocs?.length || 0
    });

  } catch (error) {
    console.error('[custom_generator_documents_post] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

// Remove a document from a custom generator
router.delete('/:id/documents/:documentId', requireAuth, async (req, res) => {
  try {
    const { id, documentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    if (!supabaseService) {
      console.error('[custom_generator_documents_delete] Supabase service client not initialized.');
      return res.status(500).json({ error: 'Custom generator service is currently unavailable.' });
    }

    // First verify the generator exists and belongs to the user
    const { data: generator, error: generatorError } = await supabaseService
      .from('custom_generators')
      .select('id, user_id, name')
      .eq('id', id)
      .single();

    if (generatorError) {
      console.error('[custom_generator_documents_delete] Error fetching generator:', generatorError);
      if (generatorError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Generator nicht gefunden.' });
      }
      return res.status(500).json({ error: 'Fehler beim Überprüfen des Generators: ' + generatorError.message });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_documents_delete] User ${userId} attempted to modify generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Bearbeiten dieses Generators.' });
    }

    // Remove the document association
    const { error: deleteError } = await supabaseService
      .from('custom_generator_documents')
      .delete()
      .eq('custom_generator_id', id)
      .eq('document_id', documentId);

    if (deleteError) {
      console.error('[custom_generator_documents_delete] Error removing document:', deleteError);
      return res.status(500).json({ error: 'Fehler beim Entfernen des Dokuments: ' + deleteError.message });
    }

    console.log(`[custom_generator_documents_delete] Removed document ${documentId} from generator ${generator.name}`);
    res.json({ 
      success: true, 
      message: 'Dokument erfolgreich entfernt.'
    });

  } catch (error) {
    console.error('[custom_generator_documents_delete] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

export default router; 