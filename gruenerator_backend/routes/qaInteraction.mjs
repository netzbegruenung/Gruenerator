import express from 'express';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import { QAQdrantHelper } from '../database/services/QAQdrantHelper.js';
import authMiddleware from '../middleware/authMiddleware.js';
const { requireAuth } = authMiddleware;
import { DocumentSearchService } from '../services/DocumentSearchService.js';
const documentSearchService = new DocumentSearchService();
import { 
  MARKDOWN_FORMATTING_INSTRUCTIONS, 
  SEARCH_DOCUMENTS_TOOL, 
  processAIResponseWithCitations 
} from '../utils/promptUtils.js';

const router = express.Router();

const postgres = getPostgresInstance();
const qaHelper = new QAQdrantHelper();

// POST /api/qa/:id/ask - Submit question to Q&A collection
router.post('/:id/ask', requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;
        const { question, mode = 'dossier', vectorWeight, textWeight, threshold } = req.body;

        // Validate input
        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        const trimmedQuestion = question.trim();

        // Verify user has access to the collection (Qdrant)
        const collection = await qaHelper.getQACollection(collectionId);
        
        if (!collection || collection.user_id !== userId) {
            return res.status(404).json({ error: 'Q&A collection not found or access denied' });
        }

        // Load documents for this collection
        const qaDocAssociations = await qaHelper.getCollectionDocuments(collectionId);
        const documentIds = qaDocAssociations.map(qcd => qcd.document_id);
        
        let qaDocs = [];
        if (documentIds.length > 0) {
            qaDocs = await postgres.query(
                `SELECT id, title, ocr_text, filename
                 FROM documents
                 WHERE id = ANY($1)`,
                [documentIds]
            );
            
            // Add document_id for compatibility
            qaDocs = qaDocs.map(doc => ({ ...doc, document_id: doc.id }));
        }

        if (qaDocs.length === 0) {
            return res.status(400).json({ error: 'No documents found in this Q&A collection' });
        }

        // Prepare hybrid search options (allow override from request)
        const searchOptions = {
            vectorWeight: typeof vectorWeight === 'number' ? vectorWeight : 0.4,
            textWeight: typeof textWeight === 'number' ? textWeight : 0.5,
            threshold: typeof threshold === 'number' ? threshold : undefined
        };

        // Perform vector/text (hybrid) search across the collection's documents
        let searchResults = [];
        try {
            const searchResponse = await documentSearchService.search({
                query: trimmedQuestion,
                user_id: userId,
                documentIds,
                limit: 10,
                mode: 'hybrid',
                vectorWeight: searchOptions.vectorWeight,
                textWeight: searchOptions.textWeight,
                threshold: searchOptions.threshold
            });
            searchResults = searchResponse.results || [];
        } catch (searchError) {
            console.error('[QA Interaction] Vector search error:', searchError);
            // Continue without search results if vector search fails
        }

        // Prepare context from search results and documents
        let context = '';
        let sources = [];

        if (searchResults.length > 0) {
            // Use vector search results
            context = searchResults.map((result, index) => {
                const title = result.title || result.document_title;
                const content = result.relevant_content || result.chunk_text;
                
                sources.push({
                    document_id: result.document_id,
                    document_title: title,
                    chunk_text: content,
                    similarity_score: result.similarity_score,
                    page_number: result.chunk_index || 1,
                    filename: result.filename
                });
                return `[Quelle ${index + 1}]: ${content}`;
            }).join('\n\n');
        } else {
            // Fallback to using full document text (first few paragraphs)
            qaDocs.forEach((row, index) => {
                if (row.ocr_text) {
                    const truncatedText = row.ocr_text.substring(0, 2000);
                    context += `[Dokument ${index + 1} - ${row.title}]:\n${truncatedText}\n\n`;
                    sources.push({
                        document_id: row.id,
                        document_title: row.title,
                        chunk_text: truncatedText,
                        similarity_score: 0.8, // Default score for fallback
                        page_number: 1
                    });
                }
            });
        }

        if (!context.trim()) {
            return res.status(400).json({ error: 'No content available in the documents for analysis' });
        }

        // Use tool-use approach for enhanced citation support
        const result = await handleQAQuestionWithTools(trimmedQuestion, collection, userId, req.app.locals.aiWorkerPool, mode, searchOptions);
        
        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Failed to process question' });
        }
        
        const { answer: aiResponse, citations, sources: enhancedSources, metadata: qaMetadata } = result;
        const tokenCount = qaMetadata?.token_count || 0;

        const responseTime = Date.now() - startTime;

        // Log the interaction (Qdrant)
        try {
            await qaHelper.logQAUsage(
                collectionId, 
                userId, 
                trimmedQuestion, 
                (aiResponse || '').length, 
                responseTime
            );
        } catch (logError) {
            console.error('[QA Interaction] Error logging usage:', logError);
        }

        res.json({
            answer: aiResponse,
            sources: enhancedSources,
            citations: citations,
            metadata: {
                collection_id: collectionId,
                collection_name: collection.name,
                response_time_ms: responseTime,
                token_count: tokenCount,
                sources_count: enhancedSources.length,
                citations_count: citations.length
            }
        });

    } catch (error) {
        console.error('[QA Interaction] Error in POST /:id/ask:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/qa/public/:token - Public Q&A access (no authentication required)
router.get('/public/:token', async (req, res) => {
    try {
        const accessToken = req.params.token;

        // Verify the public access token and get collection info (Qdrant)
        const publicAccess = await qaHelper.getPublicAccess(accessToken);

        if (!publicAccess) {
            return res.status(404).json({ error: 'Public Q&A not found or access token invalid' });
        }

        // Check if access has expired
        if (publicAccess.expires_at && new Date(publicAccess.expires_at) < new Date()) {
            return res.status(403).json({ error: 'Public access has expired' });
        }

        // Check if collection is still active
        if (!publicAccess.is_active) {
            return res.status(403).json({ error: 'This Q&A collection is no longer public' });
        }

        // Get collection details
        const collection = await qaHelper.getQACollection(publicAccess.collection_id);
        if (!collection) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        res.json({
            collection: {
                id: collection.id,
                name: collection.name,
                description: collection.description
            },
            message: 'Public Q&A collection found'
        });

    } catch (error) {
        console.error('[QA Public] Error in GET /public/:token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/qa/public/:token/ask - Ask question to public Q&A (no authentication required)
router.post('/public/:token/ask', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const accessToken = req.params.token;
        const { question, mode = 'dossier', vectorWeight, textWeight, threshold } = req.body;

        // Validate input
        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        const trimmedQuestion = question.trim();

        // Verify the public access token and get collection info (Qdrant)
        const publicAccess = await qaHelper.getPublicAccess(accessToken);

        if (!publicAccess) {
            return res.status(404).json({ error: 'Public Q&A not found or access token invalid' });
        }

        // Check if access has expired
        if (publicAccess.expires_at && new Date(publicAccess.expires_at) < new Date()) {
            return res.status(403).json({ error: 'Public access has expired' });
        }

        // Check if collection is still active
        if (!publicAccess.is_active) {
            return res.status(403).json({ error: 'This Q&A collection is no longer public' });
        }

        // Get collection details
        const collection = await qaHelper.getQACollection(publicAccess.collection_id);
        if (!collection) {
            return res.status(404).json({ error: 'Q&A collection not found' });
        }

        // Load documents for this collection
        const qaDocAssociations = await qaHelper.getCollectionDocuments(collection.id);
        const documentIds = qaDocAssociations.map(qcd => qcd.document_id);
        
        let qaDocs = [];
        if (documentIds.length > 0) {
            qaDocs = await postgres.query(
                `SELECT id, title, ocr_text, filename
                 FROM documents
                 WHERE id = ANY($1)`,
                [documentIds]
            );
            
            // Add document_id for compatibility
            qaDocs = qaDocs.map(doc => ({ ...doc, document_id: doc.id }));
        }

        if (qaDocs.length === 0) {
            return res.status(400).json({ error: 'No documents found in this Q&A collection' });
        }

        // Prepare hybrid search options (allow override from request)
        const searchOptions = {
            vectorWeight: typeof vectorWeight === 'number' ? vectorWeight : 0.4,
            textWeight: typeof textWeight === 'number' ? textWeight : 0.5,
            threshold: typeof threshold === 'number' ? threshold : undefined
        };

        // Similar processing as authenticated endpoint but without user context
        // Perform vector search
        let searchResults = [];
        try {
            const searchResponse = await documentSearchService.search({
                query: trimmedQuestion,
                user_id: null, // Public access, no user ID
                documentIds,
                limit: 10,
                mode: 'hybrid',
                vectorWeight: searchOptions.vectorWeight,
                textWeight: searchOptions.textWeight,
                threshold: searchOptions.threshold
            });
            searchResults = searchResponse.results || [];
        } catch (searchError) {
            console.error('[QA Public] Vector search error:', searchError);
        }

        // Prepare context and sources (same logic as authenticated endpoint)
        let context = '';
        let sources = [];

        if (searchResults.length > 0) {
            context = searchResults.map((result, index) => {
                const title = result.title || result.document_title;
                const content = result.relevant_content || result.chunk_text;
                
                sources.push({
                    document_id: result.document_id,
                    document_title: title,
                    chunk_text: content,
                    similarity_score: result.similarity_score,
                    page_number: result.chunk_index || 1,
                    filename: result.filename
                });
                return `[Quelle ${index + 1}]: ${content}`;
            }).join('\n\n');
        } else {
            qaDocs.forEach((row, index) => {
                if (row.ocr_text) {
                    const truncatedText = row.ocr_text.substring(0, 2000);
                    context += `[Dokument ${index + 1} - ${row.title}]:\n${truncatedText}\n\n`;
                    sources.push({
                        document_id: row.id,
                        document_title: row.title,
                        chunk_text: truncatedText,
                        similarity_score: 0.8,
                        page_number: 1
                    });
                }
            });
        }

        if (!context.trim()) {
            return res.status(400).json({ error: 'No content available in the documents for analysis' });
        }

        // Use tool-use approach for enhanced citation support (public version)
        const result = await handleQAQuestionWithTools(trimmedQuestion, collection, null, req.app.locals.aiWorkerPool, mode, searchOptions);
        
        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Failed to process question' });
        }
        
        const { answer: aiResponse, citations, sources: enhancedSources, metadata: qaMetadata } = result;
        const tokenCount = qaMetadata?.token_count || 0;

        const responseTime = Date.now() - startTime;

        // Log the public interaction (without user_id)
        try {
            await qaHelper.logQAUsage(
                collection.id,
                null, // No user ID for public access
                trimmedQuestion,
                (aiResponse || '').length,
                responseTime
            );
        } catch (logError) {
            console.error('[QA Public] Error logging usage:', logError);
        }

        res.json({
            answer: aiResponse,
            sources: enhancedSources,
            citations: citations,
            metadata: {
                collection_id: collection.id,
                collection_name: collection.name,
                response_time_ms: responseTime,
                token_count: tokenCount,
                sources_count: enhancedSources.length,
                citations_count: citations.length,
                is_public: true
            }
        });

    } catch (error) {
        console.error('[QA Public] Error in POST /public/:token/ask:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Handle QA question using tool-use approach where Claude can search documents multiple times
 */
async function handleQAQuestionWithTools(question, collection, userId, aiWorkerPool, mode = 'dossier', searchOptions = {}) {
    console.log('[QA Tools] Starting tool-use conversation with mode:', mode);
    
    // Adjust system prompt based on mode
    const modeInstructions = mode === 'chat' 
        ? `CHAT-MODUS AKTIV:
- Gib KURZE, PRÄGNANTE Antworten (maximal 2-3 Sätze)
- Sei konversationell und direkt
- Integriere Quellen natürlich in den Text (z.B. "Laut Dokument X...")
- Vermeide formale Strukturen oder lange Erklärungen
- Antworte wie in einem natürlichen Gespräch`
        : `DOSSIER-MODUS AKTIV:
- Erstelle eine detaillierte, strukturierte Antwort
- Verwende klare Überschriften und Absätze
- Liste alle relevanten Informationen auf
- Füge ausführliche Zitate und Quellenangaben hinzu`;
    
    // System prompt for tool-guided document analysis for QA collections
    const systemPrompt = `Du bist ein Experte für die Analyse von Dokumentensammlungen mit Zugang zu einer Dokumentensuchfunktion.

${modeInstructions}

WICHTIG: Du MUSST das search_documents Tool verwenden, um Informationen zu finden. Du darfst KEINE Antworten ohne vorherige Dokumentensuche geben.

Deine Aufgabe:
1. ZUERST: Verwende das search_documents Tool, um relevante Dokumente in der Q&A-Sammlung zu finden
2. Du kannst mehrere Suchen mit verschiedenen Begriffen durchführen
3. Sammle umfassende Informationen aus den TATSÄCHLICHEN Suchergebnissen
4. Erstelle Zitate NUR aus den gefundenen Dokumenten

Q&A-Sammlung: "${collection.name}"
${collection.custom_prompt || 'Gib präzise Antworten basierend auf den Dokumenten der Sammlung.'}

ABSOLUT VERBOTEN:
- Antworten ohne vorherige search_documents Tool-Nutzung
- Erfundene oder halluzinierte Zitate
- Informationen, die nicht in den Suchergebnissen stehen

Antwort-Struktur:
1. Verwende zuerst das search_documents Tool
2. Basiere deine Antwort NUR auf den gefundenen Dokumenten
3. ${mode === 'chat' ? 'Halte die Antwort kurz und gesprächsartig' : 'Formatiere als strukturiertes Markdown'}

${mode === 'dossier' ? MARKDOWN_FORMATTING_INSTRUCTIONS : ''}`;

    // Initial conversation state
    let messages = [{
        role: "user",
        content: question
    }];
    
    let allSearchResults = [];
    let searchCount = 0;
    const maxSearches = 5; // Prevent infinite loops
    
    console.log('[QA Tools] Starting conversation with tools');
    
    // Conversation loop to handle tool calls
    while (searchCount < maxSearches) {
        console.log(`[QA Tools] Conversation round ${searchCount + 1}`);
        
        // Make AI request with tools
        const aiResult = await aiWorkerPool.processRequest({
            type: 'qa_tools',
            messages: messages,
            systemPrompt: systemPrompt,
            options: {
                max_tokens: 2000,
                useBedrock: true,
                anthropic_version: "bedrock-2023-05-31",
                tools: [SEARCH_DOCUMENTS_TOOL]
            }
        });
        
        console.log('[QA Tools] AI Result:', {
            success: aiResult.success,
            hasContent: !!aiResult.content,
            stopReason: aiResult.stop_reason,
            hasToolCalls: !!(aiResult.tool_calls && aiResult.tool_calls.length > 0)
        });
        
        // DEEP DEBUG: Log raw_content_blocks structure
        if (aiResult.raw_content_blocks) {
            console.log('[QA Tools DEBUG] raw_content_blocks structure:', JSON.stringify(aiResult.raw_content_blocks, null, 2));
        }
        
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
            console.log(`[QA Tools] Processing ${aiResult.tool_calls.length} tool calls`);
            
            const toolResults = [];
            
            for (const toolCall of aiResult.tool_calls) {
                if (toolCall.name === 'search_documents') {
                    console.log(`[QA Tools] Executing search: "${toolCall.input.query}"`);
                    
            const searchResult = await executeQASearchTool(toolCall.input, collection, userId, searchOptions);
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
            console.log('[QA Tools] Got final answer, processing response');
            return await processQAFinalResponse(aiResult.content, allSearchResults, question, collection);
        }
        
        // Safety break
        break;
    }
    
    // Fallback if conversation didn't complete normally
    throw new Error('QA conversation did not complete successfully');
}

/**
 * Execute search_documents tool call for QA collections
 */
async function executeQASearchTool(toolInput, collection, userId, searchOptions = {}) {
    try {
        const { query, search_mode = 'hybrid' } = toolInput;
        
        console.log(`[QA Tools] Executing search: "${query}" (mode: ${search_mode})`);
        
        // Get document IDs for this QA collection
        const qaDocAssociations = await qaHelper.getCollectionDocuments(collection.id);
        const documentIds = qaDocAssociations.map(qcd => qcd.document_id);
        
        const searchResults = await documentSearchService.search({
            query: query,
            user_id: userId,
            documentIds: documentIds,
            limit: 5,
            mode: search_mode,
            vectorWeight: typeof searchOptions.vectorWeight === 'number' ? searchOptions.vectorWeight : undefined,
            textWeight: typeof searchOptions.textWeight === 'number' ? searchOptions.textWeight : undefined,
            threshold: typeof searchOptions.threshold === 'number' ? searchOptions.threshold : undefined
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
            message: `Found ${formattedResults.length} relevant documents in Q&A collection`
        };
        
    } catch (error) {
        console.error('[QA Tools] Search tool error:', error);
        return {
            success: false,
            results: [],
            error: error.message,
            message: 'Search failed'
        };
    }
}

/**
 * Process the final response from Claude for QA and extract citations
 */
async function processQAFinalResponse(responseContent, allSearchResults, originalQuestion, collection) {
    console.log('[QA Tools] Processing final response, length:', responseContent.length);
    
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
    
    // Use shared citation processing utility
    const citationResult = processAIResponseWithCitations(responseContent, documentContext, 'qa-tools');
    const { answer, citations, sources } = citationResult;
    
    return {
        success: true,
        answer: answer,
        sources: sources,
        citations: citations,
        searchQuery: originalQuestion,
        searchCount: allSearchResults.length,
        uniqueDocuments: documentContext.length,
        metadata: {
            provider: 'qa_tools',
            timestamp: new Date().toISOString(),
            toolUseEnabled: true,
            collection_id: collection.id,
            collection_name: collection.name,
            token_count: 0 // Will be filled by calling function if available
        }
    };
}

export default router;
