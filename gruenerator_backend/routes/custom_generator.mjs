import express from 'express';
import { HTML_FORMATTING_INSTRUCTIONS, extractCitationsFromText, processAIResponseWithCitations } from '../utils/promptUtils.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { DocumentSearchService } from '../services/DocumentSearchService.js';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);

// Import prompt building utilities
const { PromptBuilderWithExamples } = require('../utils/promptBuilderCompat');

// Import attachment utilities
const { processAndBuildAttachments } = require('../utils/attachmentUtils');

const documentSearchService = new DocumentSearchService();

// Get PostgreSQL service instance
const postgresService = getPostgresInstance();

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
  const { slug, formData, attachments, useWebSearchTool, usePrivacyMode } = req.body;
  
  try {
    console.log('[custom_generator] Anfrage erhalten:', { slug, formData });

    // Fetch generator configuration from PostgreSQL
    const generators = await postgresService.query(
      'SELECT * FROM custom_generators WHERE slug = $1 LIMIT 1',
      [slug],
      { table: 'custom_generators' }
    );

    if (!generators || generators.length === 0) {
      return res.status(404).json({ error: 'Generator nicht gefunden' });
    }

    const generator = generators[0];
    
    // Check if user has completed documents (using user-level access pattern)
    const userDocuments = await postgresService.query(
      'SELECT id FROM documents WHERE user_id = $1 AND status = $2',
      [generator.user_id, 'completed'],
      { table: 'documents' }
    );

    const hasDocuments = userDocuments && userDocuments.length > 0;
    const documentIds = hasDocuments ? userDocuments.map(doc => doc.id) : null;

    console.log(`[custom_generator] Generator "${generator.name}" has access to ${hasDocuments ? documentIds.length : 0} user documents`);

    // Process attachments using consolidated utility
    const attachmentResult = await processAndBuildAttachments(
      attachments || [], 
      usePrivacyMode || false, 
      'custom_generator', 
      generator.user_id || 'unknown'
    );

    // Handle attachment errors
    if (attachmentResult.error) {
      return res.status(400).json({
        error: 'Fehler bei der Verarbeitung der Anhänge',
        details: attachmentResult.error
      });
    }

    // Platzhalter im Prompt mit den Formulardaten ersetzen
    let processedPrompt = generator.prompt;
    // Filter out feature flags from form data replacement
    const cleanFormData = { ...formData };
    delete cleanFormData.useWebSearchTool;
    delete cleanFormData.usePrivacyMode;
    delete cleanFormData.attachments;
    
    Object.entries(cleanFormData).forEach(([key, value]) => {
      processedPrompt = processedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    // Don't append HTML formatting instructions here - it will be handled by PromptBuilder
    // processedPrompt += `\n\n${HTML_FORMATTING_INSTRUCTIONS}`;

    if (hasDocuments) {
      // Use document-enhanced generation with tool support
      const result = await handleDocumentEnhancedGeneration(
        processedPrompt, 
        cleanFormData, 
        generator, 
        documentIds, 
        req.app.locals.aiWorkerPool,
        attachmentResult,
        useWebSearchTool,
        usePrivacyMode
      );
      res.json(result);
    } else {
      // Use standard generation without documents
      const result = await handleStandardGeneration(
        processedPrompt, 
        req.app.locals.aiWorkerPool,
        attachmentResult,
        useWebSearchTool,
        usePrivacyMode,
        cleanFormData
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
 * Handle standard generation without documents but with attachments and features
 */
async function handleStandardGeneration(
  processedPrompt, 
  aiWorkerPool, 
  attachmentResult, 
  useWebSearchTool, 
  usePrivacyMode,
  formData
) {
  console.log('[custom_generator] Using standard generation (no documents)');

  // Use PromptBuilder to handle attachments and web search
  const builder = new PromptBuilderWithExamples('custom')
    .enableDebug(process.env.NODE_ENV === 'development')
    .setSystemRole(processedPrompt)
    .setFormatting(HTML_FORMATTING_INSTRUCTIONS);

  // Enable web search if requested
  if (useWebSearchTool && formData) {
    // Extract search query from form data  
    const searchQuery = Object.values(formData).filter(v => v && v.trim()).join(' ');
    if (searchQuery && searchQuery.trim().length > 0) {
      console.log(`[custom_generator] 🔍 Web search enabled for: "${searchQuery}"`);
      await builder.handleWebSearch(searchQuery, 'content', aiWorkerPool);
    }
  }

  // Add documents if present
  if (attachmentResult.documents.length > 0) {
    await builder.addDocuments(attachmentResult.documents, usePrivacyMode);
  }

  // Build request content
  const requestContent = `Generiere den gewünschten Text basierend auf den gegebenen Informationen und dem Prompt-Template.

Formulardaten: ${JSON.stringify(formData, null, 2)}`;

  builder.setRequest(requestContent);

  // Build final prompt
  const { systemPrompt, messages } = builder.build();

  const result = await aiWorkerPool.processRequest({
    type: 'custom',
    systemPrompt: systemPrompt,
    messages: messages,
    options: {
      max_tokens: 4000,
      temperature: 0.7
    }
  });

  console.log('[custom_generator] AI Worker Antwort erhalten:', {
    success: result.success,
    contentLength: result.content?.length,
    error: result.error,
    hasAttachments: attachmentResult.documents.length > 0,
    webSearchUsed: useWebSearchTool
  });

  if (!result.success) {
    console.error('[custom_generator] AI Worker Fehler:', result.error);
    throw new Error(result.error);
  }

  return { 
    content: result.content,
    metadata: {
      ...result.metadata,
      attachmentsSummary: attachmentResult.summary,
      webSearchUsed: useWebSearchTool,
      privacyMode: usePrivacyMode
    }
  };
}

/**
 * Handle document-enhanced generation with tool support, attachments and features
 */
async function handleDocumentEnhancedGeneration(
  processedPrompt, 
  formData, 
  generator, 
  documentIds, 
  aiWorkerPool, 
  attachmentResult, 
  useWebSearchTool, 
  usePrivacyMode
) {
  console.log('[custom_generator] Using document-enhanced generation with tools');
  
  // Build enhanced system prompt with attachment and web search context
  let attachmentContext = '';
  if (attachmentResult.documents.length > 0) {
    attachmentContext = `\n\nZUSÄTZLICH: Du hast Zugang zu ${attachmentResult.documents.length} angehängten Dokumenten/Dateien als Kontext. Diese enthalten möglicherweise relevante Informationen für deine Antwort.`;
  }

  let webSearchContext = '';
  if (useWebSearchTool) {
    webSearchContext = `\n\nWEB-SUCHE: Aktuelle Informationen aus dem Internet wurden für dieses Thema abgerufen und stehen als Kontext zur Verfügung.`;
  }
  
  // Enhanced system prompt that encourages tool use when relevant
  const enhancedSystemPrompt = `${processedPrompt}

WICHTIG: Dieser Generator hat Zugang zu speziellen Dokumenten als Wissensquelle. Falls du spezifische Informationen, Fakten oder Zitate benötigst, um eine hochwertige Antwort zu generieren, verwende das search_generator_documents Tool, um relevante Inhalte aus der Wissensbasis zu finden.${attachmentContext}${webSearchContext}

Die Formulardaten sind: ${JSON.stringify(formData, null, 2)}`;

  // Process attachments and web search using PromptBuilder for consistency
  let additionalContext = '';
  
  if (useWebSearchTool) {
    // Extract search query from form data and perform web search
    const searchQuery = Object.values(formData).filter(v => v && v.trim()).join(' ');
    if (searchQuery && searchQuery.trim().length > 0) {
      console.log(`[custom_generator] 🔍 Web search enabled for: "${searchQuery}"`);
      
      try {
        // Import and use SearXNGWebSearchService directly
        const searxngWebSearchService = require('../services/searxngWebSearchService');
        const searchResults = await searxngWebSearchService.performWebSearch(searchQuery, 'content');
        
        if (searchResults && searchResults.success) {
          const searchResultsWithSummary = await searxngWebSearchService.generateAISummary(
            searchResults, 
            searchQuery, 
            aiWorkerPool,
            {},
            null // req parameter - using null since we're in custom generator context
          );
          
          if (searchResultsWithSummary.summary && searchResultsWithSummary.summary.generated) {
            additionalContext += `\n\nWEB-SUCHE ERGEBNISSE für "${searchQuery}":\n${searchResultsWithSummary.summary.text}\n`;
          }
        }
      } catch (webSearchError) {
        console.warn('[custom_generator] Web search failed, continuing without it:', webSearchError.message);
      }
    }
  }

  // Add attachment content to messages if present
  let attachmentMessages = [];
  if (attachmentResult.documents.length > 0) {
    console.log(`[custom_generator] Adding ${attachmentResult.documents.length} attachments to conversation`);
    
    attachmentResult.documents.forEach((doc, index) => {
      if (doc.type === 'text') {
        // Crawled URL content
        additionalContext += `\n\nANHANG ${index + 1} (${doc.source.metadata?.name || 'Dokument'}):\n${doc.source.text}\n`;
      } else {
        // File attachments will be processed by Claude directly
        attachmentMessages.push({
          type: doc.type === 'image' ? 'image' : 'document',
          source: doc.source
        });
      }
    });
  }

  // Build initial user message with attachments and context
  let initialMessage;
  if (attachmentMessages.length > 0) {
    // Message with file attachments
    const contentBlocks = [
      ...attachmentMessages,
      {
        type: "text",
        text: `Generiere den gewünschten Text basierend auf den gegebenen Formulardaten. Falls spezifische Informationen aus Dokumenten benötigt werden, nutze das search_generator_documents Tool.

Formulardaten: ${JSON.stringify(formData, null, 2)}${additionalContext}`
      }
    ];
    initialMessage = {
      role: "user",
      content: contentBlocks
    };
  } else {
    // Text-only message
    initialMessage = {
      role: "user",
      content: `Generiere den gewünschten Text basierend auf den gegebenen Formulardaten. Falls spezifische Informationen aus Dokumenten benötigt werden, nutze das search_generator_documents Tool.

Formulardaten: ${JSON.stringify(formData, null, 2)}${additionalContext}`
    };
  }

  // Initial conversation state
  let messages = [initialMessage];
  
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
    const searchResults = await documentSearchService.search({
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
      toolUseEnabled: true,
      attachmentsSummary: attachmentResult.summary,
      webSearchUsed: useWebSearchTool,
      privacyMode: usePrivacyMode
    }
  };
}

// GET Route zum Abrufen der benutzerdefinierten Generatoren für den angemeldeten Benutzer
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    // Fetch all generators for the authenticated user from PostgreSQL
    const generators = await postgresService.query(
      'SELECT * FROM custom_generators WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
      { table: 'custom_generators' }
    );

    res.json(generators || []); // Send the array directly

  } catch (error) {
    console.error('Unexpected error fetching custom generators:', error);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

// Neue Route zur Überprüfung der Slug-Verfügbarkeit
router.get('/check-slug/:slug', async (req, res) => {
  const { slug } = req.params;

  if (!slug || slug.trim() === '') {
    return res.status(400).json({ error: 'Slug darf nicht leer sein.' });
  }

  try {
    const result = await postgresService.queryOne(
      'SELECT slug FROM custom_generators WHERE slug = $1',
      [slug],
      { table: 'custom_generators' }
    );

    res.json({ exists: !!result }); // Returns true if result exists, false otherwise

  } catch (error) {
    console.error('[custom_generator_check_slug] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.' });
  }
});

// GET Route zum Abrufen eines benutzerdefinierten Generators per Slug
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug || slug.trim() === '') {
      return res.status(400).json({ error: 'Slug darf nicht leer sein.' });
    }

    // Fetch generator by slug from PostgreSQL
    const generator = await postgresService.queryOne(
      'SELECT * FROM custom_generators WHERE slug = $1',
      [slug],
      { table: 'custom_generators' }
    );

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

    // Check if generator exists and belongs to user
    const generator = await postgresService.queryOne(
      'SELECT user_id FROM custom_generators WHERE id = $1',
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({ error: 'Generator nicht gefunden.' });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_delete] User ${userId} attempted to delete generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Löschen dieses Generators.' });
    }

    // Delete the generator
    const result = await postgresService.delete('custom_generators', { 
      id: id, 
      user_id: userId 
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Generator konnte nicht gefunden oder gelöscht werden.' });
    }

    console.log(`[custom_generator_delete] Generator ${id} successfully deleted by user ${userId}`);
    res.status(204).send();

  } catch (error) {
    console.error('[custom_generator_delete] Unexpected error during delete operation:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

// POST Route zum Erstellen eines neuen benutzerdefinierten Generators
router.post('/create', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    const { name, slug, form_schema, prompt, title, description, contact_email } = req.body;

    // Validate required fields
    if (!name || !slug || !form_schema || !prompt) {
      return res.status(400).json({ 
        error: 'Folgende Felder sind erforderlich: name, slug, form_schema, prompt' 
      });
    }

    // Validate form_schema structure
    if (!form_schema.fields || !Array.isArray(form_schema.fields)) {
      return res.status(400).json({ 
        error: 'form_schema muss ein fields Array enthalten' 
      });
    }

    // Check if slug already exists for this user
    const existingGenerator = await postgresService.queryOne(
      'SELECT id, slug FROM custom_generators WHERE slug = $1 AND user_id = $2',
      [slug, userId],
      { table: 'custom_generators' }
    );

    if (existingGenerator) {
      return res.status(409).json({ 
        error: 'Ein Generator mit diesem URL-Pfad existiert bereits für Ihren Account.' 
      });
    }

    // Prepare data for insertion
    const generatorData = {
      user_id: userId,
      name: name.trim(),
      slug: slug.trim(),
      form_schema: JSON.stringify(form_schema),
      prompt: prompt.trim(),
      title: title ? title.trim() : null,
      description: description ? description.trim() : null,
      contact_email: contact_email ? contact_email.trim() : null,
      is_active: true,
      usage_count: 0
    };

    // Insert the generator
    const newGenerator = await postgresService.insert('custom_generators', generatorData);

    console.log(`[custom_generator_create] Successfully created generator ${newGenerator.id} (${newGenerator.name}) for user ${userId}`);
    
    res.status(201).json({
      success: true,
      message: 'Generator erfolgreich erstellt',
      generator: newGenerator
    });

  } catch (error) {
    console.error('[custom_generator_create] Unexpected error during creation:', error);
    res.status(500).json({ 
      error: 'Ein unerwarteter Fehler ist aufgetreten.', 
      details: error.message 
    });
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

    // First verify the generator exists and belongs to the user
    const generator = await postgresService.queryOne(
      'SELECT id, user_id, name FROM custom_generators WHERE id = $1',
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({ error: 'Generator nicht gefunden.' });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_documents_get] User ${userId} attempted to access generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Zugriff auf diesen Generator.' });
    }

    // Fetch user's completed documents (using existing user-level access pattern)
    const documents = await postgresService.query(
      'SELECT id, title, filename, status, page_count, created_at FROM documents WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
      [generator.user_id, 'completed'],
      { table: 'documents' }
    );

    console.log(`[custom_generator_documents_get] Found ${documents?.length || 0} documents for generator ${generator.name}`);
    res.json({ 
      success: true, 
      documents: documents || [],
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

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Dokument-IDs sind erforderlich.' });
    }

    // First verify the generator exists and belongs to the user
    const generator = await postgresService.queryOne(
      'SELECT id, user_id, name FROM custom_generators WHERE id = $1',
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({ error: 'Generator nicht gefunden.' });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_documents_post] User ${userId} attempted to modify generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Bearbeiten dieses Generators.' });
    }

    // Verify all documents exist and belong to the user
    const userDocuments = await postgresService.query(
      `SELECT id, title, status FROM documents WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, documentIds],
      { table: 'documents' }
    );

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

    // With user-level access, all user's completed documents are automatically available to their generators
    // So we just validate the documents and return success
    console.log(`[custom_generator_documents_post] All ${documentIds.length} documents are automatically available to generator ${generator.name} via user-level access`);
    res.json({ 
      success: true, 
      message: `Alle Ihre abgeschlossenen Dokumente sind automatisch für diesen Generator verfügbar.`,
      note: 'Mit der vereinfachten Zugriffskontrolle sind alle Ihre Dokumente automatisch für Ihre Generatoren verfügbar.'
    });

  } catch (error) {
    console.error('[custom_generator_documents_post] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

// Remove a document from a custom generator
router.delete('/:id/documents/:documentId', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Nicht authentifiziert.' });
    }

    // First verify the generator exists and belongs to the user
    const generator = await postgresService.queryOne(
      'SELECT id, user_id, name FROM custom_generators WHERE id = $1',
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({ error: 'Generator nicht gefunden.' });
    }

    if (generator.user_id !== userId) {
      console.warn(`[custom_generator_documents_delete] User ${userId} attempted to modify generator ${id} owned by ${generator.user_id}`);
      return res.status(403).json({ error: 'Keine Berechtigung zum Bearbeiten dieses Generators.' });
    }

    // With user-level access, documents are automatically managed and cannot be individually removed
    console.log(`[custom_generator_documents_delete] Document removal not needed - all user documents are automatically available to generator ${generator.name}`);
    res.json({ 
      success: true, 
      message: 'Mit der vereinfachten Zugriffskontrolle sind alle Ihre Dokumente automatisch verfügbar.',
      note: 'Einzelne Dokumente können nicht mehr entfernt werden, da alle Ihre abgeschlossenen Dokumente automatisch für Ihre Generatoren verfügbar sind.'
    });

  } catch (error) {
    console.error('[custom_generator_documents_delete] Unexpected error:', error);
    res.status(500).json({ error: 'Ein unerwarteter Fehler ist aufgetreten.', details: error.message });
  }
});

export default router; 