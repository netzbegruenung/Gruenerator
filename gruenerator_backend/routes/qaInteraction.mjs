import express from 'express';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import { QAQdrantHelper } from '../database/services/QAQdrantHelper.js';
import authMiddleware from '../middleware/authMiddleware.js';
const { requireAuth } = authMiddleware;
// Legacy tool-use imports removed; graph-based agent is used for all QA flows
import { runQaGraph } from '../agents/langgraph/qaGraph.mjs';
import { queryIntentService } from '../services/QueryIntentService.js';

const router = express.Router();

const postgres = getPostgresInstance();
const qaHelper = new QAQdrantHelper();

// Initialize system collections on startup
(async () => {
    try {
        await qaHelper.ensureSystemGrundsatzCollection();
        console.log('[QA Interaction] System collections initialized');
    } catch (error) {
        console.error('[QA Interaction] Failed to initialize system collections:', error);
    }
})();

// System collection configs for multi-collection queries
const SYSTEM_COLLECTIONS = {
    'grundsatz-system': {
        id: 'grundsatz-system',
        user_id: 'SYSTEM',
        name: 'Grundsatzprogramme',
        description: 'Grundsatzprogramm 2020, EU-Wahlprogramm 2024, Regierungsprogramm 2025',
        settings: { system_collection: true, min_quality: 0.3 },
        searchCollection: 'grundsatz_documents'
    },
    'bundestagsfraktion-system': {
        id: 'bundestagsfraktion-system',
        user_id: 'SYSTEM',
        name: 'Bundestagsfraktion',
        description: 'Fachtexte, Ziele und Positionen von gruene-bundestag.de',
        settings: { system_collection: true, min_quality: 0.3 },
        searchCollection: 'bundestag_content'
    }
};

// POST /api/qa/multi/ask - Submit question to multiple Q&A collections (unified answer)
router.post('/multi/ask', requireAuth, async (req, res) => {
    const startTime = Date.now();

    try {
        const userId = req.user.id;
        const { question, mode = 'dossier', collectionIds = ['grundsatz-system', 'bundestagsfraktion-system'] } = req.body;

        // Validate input
        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
            return res.status(400).json({ error: 'At least one collection ID is required' });
        }

        const trimmedQuestion = question.trim();
        console.log(`[QA Multi] Processing question across ${collectionIds.length} collections: "${trimmedQuestion.slice(0, 50)}..."`);

        // Import DocumentSearchService for direct searching
        const { DocumentSearchService } = await import('../services/DocumentSearchService.js');
        const documentSearchService = new DocumentSearchService();

        // Helper function to expand search results to chunks with collection tagging
        const expandResultsWithCollection = (results, collectionId, collectionName) => {
            const expanded = [];
            for (const r of results) {
                const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
                const topChunks = r.top_chunks || [];
                const docId = r.document_id || r.url;

                if (topChunks.length > 0) {
                    for (const chunk of topChunks) {
                        expanded.push({
                            document_id: docId,
                            url: r.url || null,
                            title,
                            snippet: chunk.preview || '',
                            filename: r.filename || null,
                            similarity: r.similarity_score || 0,
                            chunk_index: chunk.chunk_index,
                            page_number: chunk.page_number ?? null,
                            collection_id: collectionId,
                            collection_name: collectionName
                        });
                    }
                } else {
                    expanded.push({
                        document_id: docId,
                        url: r.url || null,
                        title,
                        snippet: (r.relevant_content || r.chunk_text || ''),
                        filename: r.filename || null,
                        similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
                        chunk_index: r.chunk_index || 0,
                        page_number: null,
                        collection_id: collectionId,
                        collection_name: collectionName
                    });
                }
            }
            return expanded;
        };

        // Search all collections in parallel
        const searchPromises = collectionIds.map(async (collectionId) => {
            const config = SYSTEM_COLLECTIONS[collectionId];
            if (!config) {
                console.warn(`[QA Multi] Unknown collection: ${collectionId}`);
                return [];
            }

            try {
                const resp = await documentSearchService.search({
                    query: trimmedQuestion,
                    user_id: null,
                    limit: 30,
                    mode: 'hybrid',
                    vectorWeight: 0.7,
                    textWeight: 0.3,
                    threshold: 0.35,
                    searchCollection: config.searchCollection,
                    recallLimit: 50,
                    qualityMin: config.settings?.min_quality || 0.3
                });

                return expandResultsWithCollection(resp.results || [], collectionId, config.name);
            } catch (error) {
                console.error(`[QA Multi] Search error for ${collectionId}:`, error);
                return [];
            }
        });

        const searchResultsArrays = await Promise.all(searchPromises);

        // Merge all results
        let allResults = searchResultsArrays.flat();

        // Deduplicate by doc_id + chunk_index (keeping collection info)
        const keySet = new Set();
        const dedupedResults = [];
        for (const r of allResults) {
            const key = `${r.collection_id}:${r.document_id}:${r.chunk_index}`;
            if (keySet.has(key)) continue;
            keySet.add(key);
            dedupedResults.push(r);
        }

        // Sort by similarity and limit
        const sortedResults = dedupedResults
            .filter(r => r.similarity >= 0.35)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 40);

        if (sortedResults.length === 0) {
            return res.json({
                success: true,
                answer: 'Leider konnte ich in den verfügbaren Quellen keine passenden Informationen zu Ihrer Frage finden. Bitte formulieren Sie die Frage anders oder nutzen Sie spezifischere Stichworte.',
                citations: [],
                sources: [],
                allSources: [],
                sourcesByCollection: {}
            });
        }

        // Build references map with collection info
        const referencesMap = {};
        let idx = 0;
        for (const r of sortedResults) {
            idx += 1;
            const idStr = String(idx);
            referencesMap[idStr] = {
                title: r.title,
                snippets: [[r.snippet]],
                description: null,
                date: new Date().toISOString(),
                source: 'qa_documents',
                document_id: r.document_id,
                url: r.url || null,
                filename: r.filename,
                similarity_score: r.similarity,
                chunk_index: r.chunk_index,
                collection_id: r.collection_id,
                collection_name: r.collection_name
            };
        }

        // Build prompt summary
        const refsSummary = Object.keys(referencesMap).map(id => {
            const ref = referencesMap[id];
            const snippet = ref.snippets[0]?.[0] || '';
            const short = snippet.slice(0, 150).replace(/\s+/g, ' ').trim();
            return `${id}. [${ref.collection_name}] ${ref.title} — "${short}"`;
        }).join('\n');

        // Generate unified answer
        const systemPrompt = `Du bist ein Experte für die Politik der Grünen. Beantworte Fragen basierend auf den bereitgestellten Quellen aus verschiedenen Sammlungen (Grundsatzprogramme und Bundestagsfraktion).

WICHTIG:
- Synthetisiere Informationen aus ALLEN relevanten Quellen zu EINER kohärenten Antwort
- Zitiere mit [n] Nummern, die den Quellen-IDs entsprechen
- Gruppiere thematisch, nicht nach Quelle
- Beginne direkt mit der Antwort, keine Einleitung wie "Basierend auf den Quellen..."
- Nutze Markdown-Formatierung mit Überschriften und Aufzählungen
- Die Quellen sind aus verschiedenen Sammlungen - berücksichtige beide gleichermaßen`;

        const userPrompt = `Frage: ${trimmedQuestion}

Verfügbare Quellen (mit Sammlung gekennzeichnet):
${refsSummary}`;

        const aiWorkerPool = req.app.locals.aiWorkerPool;
        const aiResult = await aiWorkerPool.processRequest({
            type: 'qa_draft',
            messages: [{ role: 'user', content: userPrompt }],
            systemPrompt,
            options: { max_tokens: 2500, temperature: 0.2, top_p: 0.8 }
        });

        let draft = aiResult.content || (Array.isArray(aiResult.raw_content_blocks) ? aiResult.raw_content_blocks.map(b => b.text || '').join('') : '');

        // Validate and inject citation markers
        const validIds = new Set(Object.keys(referencesMap));
        let content = draft.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/m, '$1');

        // Normalize [1, 2, 3] to [1][2][3]
        content = content.replace(/\[(\s*\d+(?:\s*,\s*\d+)+\s*)\]/g, (m, inner) => {
            const nums = inner.split(',').map(s => s.trim()).filter(Boolean);
            return nums.map(n => `[${n}]`).join('');
        });

        // Find and replace citations
        const usedIds = new Set();
        const citationPattern = /\[(\d+)\]/g;
        let match;
        while ((match = citationPattern.exec(content)) !== null) {
            const n = match[1];
            if (validIds.has(n)) {
                usedIds.add(n);
            }
        }

        for (const id of usedIds) {
            const re = new RegExp(`\\[${id}\\]`, 'g');
            content = content.replace(re, `⚡CITE${id}⚡`);
        }

        // Build citations array
        const citations = [...usedIds].map(id => {
            const ref = referencesMap[id];
            return {
                index: id,
                cited_text: ref.snippets[0]?.[0] || '',
                document_title: ref.title,
                document_id: ref.document_id,
                url: ref.url || null,
                similarity_score: ref.similarity_score,
                chunk_index: ref.chunk_index,
                filename: ref.filename,
                collection_id: ref.collection_id,
                collection_name: ref.collection_name
            };
        });

        // Group sources by collection
        const sourcesByCollection = {};
        for (const collectionId of collectionIds) {
            const config = SYSTEM_COLLECTIONS[collectionId];
            if (!config) continue;

            const collectionCitations = citations.filter(c => c.collection_id === collectionId);
            const collectionAllResults = sortedResults.filter(r => r.collection_id === collectionId);
            const citedDocChunks = new Set(collectionCitations.map(c => `${c.document_id}:${c.chunk_index}`));

            // Group citations by document
            const byDoc = new Map();
            for (const c of collectionCitations) {
                const key = c.document_id || c.document_title;
                if (!byDoc.has(key)) {
                    byDoc.set(key, {
                        document_id: c.document_id,
                        document_title: c.document_title,
                        url: c.url || null,
                        chunk_texts: [c.cited_text],
                        similarity_scores: [c.similarity_score],
                        citations: []
                    });
                } else {
                    byDoc.get(key).chunk_texts.push(c.cited_text);
                    byDoc.get(key).similarity_scores.push(c.similarity_score);
                }
                byDoc.get(key).citations.push(c);
            }

            const sources = [...byDoc.values()].map(source => ({
                document_id: source.document_id,
                document_title: source.document_title,
                url: source.url || null,
                chunk_text: source.chunk_texts.join(' [...] '),
                similarity_score: Math.max(...source.similarity_scores),
                citations: source.citations
            }));

            const allSources = collectionAllResults
                .filter(r => !citedDocChunks.has(`${r.document_id}:${r.chunk_index}`))
                .map(r => ({
                    document_id: r.document_id,
                    document_title: r.title,
                    url: r.url || null,
                    chunk_text: r.snippet,
                    similarity_score: r.similarity,
                    chunk_index: r.chunk_index
                }));

            sourcesByCollection[collectionId] = {
                name: config.name,
                sources,
                allSources
            };
        }

        const responseTime = Date.now() - startTime;
        console.log(`[QA Multi] Completed in ${responseTime}ms - ${citations.length} citations across ${Object.keys(sourcesByCollection).length} collections`);

        res.json({
            success: true,
            answer: content,
            citations,
            sources: citations, // Flat list for backward compatibility
            allSources: sortedResults.filter(r => !usedIds.has(String(sortedResults.indexOf(r) + 1))).slice(0, 10),
            sourcesByCollection,
            metadata: {
                response_time_ms: responseTime,
                collections_queried: collectionIds,
                total_results: sortedResults.length,
                citations_count: citations.length
            }
        });

    } catch (error) {
        console.error('[QA Multi] Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/qa/:id/ask - Submit question to Q&A collection
router.post('/:id/ask', requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
        const userId = req.user.id;
        const collectionId = req.params.id;
        const { question, mode = 'dossier', vectorWeight, textWeight, threshold, search_user_id } = req.body;

        // Validate input
        if (!question || !question.trim()) {
            return res.status(400).json({ error: 'Question is required' });
        }

        const trimmedQuestion = question.trim();

        // Check if this is a system collection first
        const isGrundsatzSystem = (collectionId === 'grundsatz-system');
        const isBundestagsfraktionSystem = (collectionId === 'bundestagsfraktion-system');
        let collection;
        let documentIds;

        if (isGrundsatzSystem) {
            // Hardcoded grundsatz collection info - no PostgreSQL needed
            collection = {
                id: 'grundsatz-system',
                user_id: 'SYSTEM',
                name: 'Grüne Grundsatzprogramme',
                description: 'Offizielle Grundsatzprogramme und politische Dokumente der Grünen',
                settings: { system_collection: true, min_quality: 0.3 }
            };

            console.log('[QA Interaction] Using hardcoded grundsatz system collection');
        } else if (isBundestagsfraktionSystem) {
            // Hardcoded Bundestagsfraktion collection info
            collection = {
                id: 'bundestagsfraktion-system',
                user_id: 'SYSTEM',
                name: 'Grüne Bundestagsfraktion',
                description: 'Inhalte von gruene-bundestag.de - Fachtexte, Ziele und Positionen',
                settings: { system_collection: true, min_quality: 0.3 }
            };

            console.log('[QA Interaction] Using hardcoded Bundestagsfraktion system collection');
        } else {
            // Verify user has access to the collection (Qdrant)
            collection = await qaHelper.getQACollection(collectionId);
            
            if (!collection) {
                return res.status(404).json({ error: 'Q&A collection not found' });
            }

            // Check access permissions: either user owns the collection or it's a system collection
            if (collection.user_id !== userId && collection.user_id !== 'SYSTEM') {
                return res.status(404).json({ error: 'Q&A collection access denied' });
            }

            // Load documents for this collection (only for regular collections)
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
        }

        // Detect query intent (German/English patterns) for logging and potential routing
        const intent = queryIntentService.detectIntent(trimmedQuestion);
        if (intent?.type) {
            console.log(`[QA Interaction] Detected intent: ${intent.type} (lang=${intent.language}, conf=${intent.confidence})`);
        }

        let result;
        if (isGrundsatzSystem) {
            result = await runQaGraph({
                question: trimmedQuestion,
                collection,
                aiWorkerPool: req.app.locals.aiWorkerPool,
                searchCollection: 'grundsatz_documents',
                userId: null,
                documentIds: undefined,
                recallLimit: 60,
                mode
            });
        } else if (isBundestagsfraktionSystem) {
            result = await runQaGraph({
                question: trimmedQuestion,
                collection,
                aiWorkerPool: req.app.locals.aiWorkerPool,
                searchCollection: 'bundestag_content',
                userId: null,
                documentIds: undefined,
                recallLimit: 60,
                mode
            });
        } else {
            // All user-created QA collections: scope to user and associated documentIds
            const scopeDocIds = documentIds && documentIds.length > 0 ? documentIds : undefined;
            const recallLimit = scopeDocIds && scopeDocIds.length <= 5 ? 40 : 60;
            result = await runQaGraph({
                question: trimmedQuestion,
                collection,
                aiWorkerPool: req.app.locals.aiWorkerPool,
                searchCollection: 'documents',
                userId: userId,
                documentIds: scopeDocIds,
                recallLimit,
                mode
            });
        }
        
        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Failed to process question' });
        }
        
        const { answer: aiResponse, citations, sources: enhancedSources, allSources, metadata: qaMetadata } = result;
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
            allSources: allSources || [], // Uncited sources for "Weitere Quellen"
            metadata: {
                collection_id: collectionId,
                collection_name: collection.name,
                response_time_ms: responseTime,
                token_count: tokenCount,
                sources_count: enhancedSources.length,
                citations_count: citations.length,
                allSources_count: (allSources || []).length
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

        // Load documents for this collection and scope the graph
        const qaDocAssociations = await qaHelper.getCollectionDocuments(collection.id);
        const documentIds = qaDocAssociations.map(qcd => qcd.document_id);
        if (!documentIds || documentIds.length === 0) {
            return res.status(400).json({ error: 'No documents found in this Q&A collection' });
        }

        const recallLimit = documentIds.length <= 5 ? 40 : 60;
        const result = await runQaGraph({
            question: trimmedQuestion,
            collection,
            aiWorkerPool: req.app.locals.aiWorkerPool,
            searchCollection: 'documents',
            userId: collection.user_id,
            documentIds,
            recallLimit,
            mode
        });
        
        if (!result.success) {
            return res.status(500).json({ error: result.error || 'Failed to process question' });
        }
        
        const { answer: aiResponse, citations, sources: enhancedSources, allSources, metadata: qaMetadata } = result;
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
            allSources: allSources || [], // Uncited sources for "Weitere Quellen"
            metadata: {
                collection_id: collection.id,
                collection_name: collection.name,
                response_time_ms: responseTime,
                token_count: tokenCount,
                sources_count: enhancedSources.length,
                citations_count: citations.length,
                allSources_count: (allSources || []).length,
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
5. Nachdem du mit dem search_documents Tool relevante Stellen gefunden hast, rufe das provide_references Tool auf. Es liefert dir eine Referenz-Tabelle, auf die du dich beziehen kannst.

Q&A-Sammlung: "${collection.name}"
${collection.custom_prompt || 'Gib präzise Antworten basierend auf den Dokumenten der Sammlung.'}

ABSOLUT VERBOTEN:
- Antworten ohne vorherige search_documents Tool-Nutzung
- Erfundene oder halluzinierte Zitate
- Informationen, die nicht in den Suchergebnissen stehen

Antwort-Struktur:
1. Verwende zuerst das search_documents Tool
2. Rufe dann provide_references auf, um eine Referenz-Tabelle zu laden
3. Basiere deine Antwort NUR auf den gefundenen Dokumenten
4. ${mode === 'chat' ? 'Halte die Antwort kurz und gesprächsartig' : 'Formatiere als strukturiertes Markdown'}

Hinweis zu Zitaten:
- Wenn Referenzen verfügbar sind, nutze sie so, dass jede relevante Aussage mit einer Referenz belegt wird.
- Modelle mit Referenz-Funktion verwenden die bereitgestellte Referenz-Tabelle automatisch für strukturierte Zitate.
- Falls keine Referenz-Blöcke unterstützt werden, beginne mit "Hier sind die relevanten Zitate:", liste Zitate im Format [1] "Exakter Text" (Dokument: Titel) und schreibe danach "Antwort:" mit Verweisen [1], [2], ...

${mode === 'dossier' ? MARKDOWN_FORMATTING_INSTRUCTIONS : ''}`;

    // Initial conversation state
    let messages = [{
        role: "user",
        content: question
    }];
    
    let allSearchResults = [];
    let lastReferencesMap = null;
    let searchCount = 0;
    const maxSearches = 5; // Prevent infinite loops (per assistant turn)
    
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
                tools: [SEARCH_DOCUMENTS_TOOL, PROVIDE_REFERENCES_TOOL]
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
            let didSearchThisRound = false;
            
            for (const toolCall of aiResult.tool_calls) {
                if (toolCall.name === 'search_documents') {
                    console.log(`[QA Tools] Executing search: "${toolCall.input.query}"`);
                    
            const searchResult = await executeQASearchTool(toolCall.input, collection, userId, searchOptions);
                    allSearchResults.push(...searchResult.results);
                    didSearchThisRound = true;
                    
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
                    
                } else if (toolCall.name === 'provide_references') {
                    console.log(`[QA Tools] Providing references map from ${allSearchResults.length} results`);
                    const referencesPayload = buildReferencesMapFromResults(allSearchResults, toolCall.input?.ids);
                    lastReferencesMap = referencesPayload;
                    toolResults.push({
                        type: "tool_result",
                        tool_use_id: toolCall.id,
                        content: JSON.stringify(referencesPayload)
                    });
                }
            }
            
            // Add tool results to conversation
            if (toolResults.length > 0) {
                messages.push({
                    role: "user",
                    content: toolResults
                });
            }
            // Count at most one search round, even if multiple tool calls happened
            if (didSearchThisRound) {
                searchCount++;
            }
            
            // Continue the conversation
            continue;
        }
        
        // No more tool calls - we have the final answer
        if (aiResult.content || aiResult.raw_content_blocks) {
            console.log('[QA Tools] Got final answer, processing response');
            return await processQAFinalResponseEnhanced(aiResult, allSearchResults, question, collection, lastReferencesMap);
        }
        
        // Safety break
        break;
    }
    
    // Fallback if conversation didn't complete normally
    // If no results at all were found, return a graceful no-results answer
    if (allSearchResults.length === 0) {
        return {
            success: true,
            answer: 'Leider habe ich in den verknüpften Dokumenten keine passenden Stellen zu Ihrer Frage gefunden. Bitte formulieren Sie die Frage anders oder nutzen Sie spezifischere Stichworte.',
            sources: [],
            citations: [],
            searchQuery: question,
            searchCount: 0,
            uniqueDocuments: 0,
            metadata: {
                provider: 'qa_tools',
                timestamp: new Date().toISOString(),
                toolUseEnabled: true,
                collection_id: collection.id,
                collection_name: collection.name,
                token_count: 0
            }
        };
    }
    throw new Error('QA conversation did not complete successfully');
}

/**
 * Execute search_documents tool call for QA collections
 */
async function executeQASearchTool(toolInput, collection, userId, searchOptions = {}) {
    try {
        const { query, search_mode = 'hybrid' } = toolInput;
        
        console.log(`[QA Tools] Executing search: "${query}" (mode: ${search_mode})`);
        
        // Get document associations for the collection
        const qaDocAssociations = await qaHelper.getCollectionDocuments(collection.id);
        const documentIds = qaDocAssociations.map(qcd => qcd.document_id);
        const isSystemCollection = (collection.user_id === 'SYSTEM') || (collection.settings?.system_collection === true);
        // For system collections search across grundsatz_documents without user filter or explicit doc IDs
        const searchCollection = isSystemCollection ? 'grundsatz_documents' : 'documents';
        const searchUserId = isSystemCollection ? null : userId;
        const searchDocumentIds = isSystemCollection ? undefined : documentIds;
        
        const searchResults = await documentSearchService.search({
            query: query,
            user_id: searchUserId,
            documentIds: searchDocumentIds,
            limit: 5,
            mode: search_mode,
            vectorWeight: typeof searchOptions.vectorWeight === 'number' ? searchOptions.vectorWeight : undefined,
            textWeight: typeof searchOptions.textWeight === 'number' ? searchOptions.textWeight : undefined,
            threshold: typeof searchOptions.threshold === 'number' ? searchOptions.threshold : undefined,
            qualityMin: collection.settings?.min_quality || undefined,
            searchCollection
        });
        
        // Format results for Claude
        const formattedResults = (searchResults.results || []).map((result, index) => {
            const title = result.title || result.document_title;
            const content = result.relevant_content || result.chunk_text;
            
            const top = result.top_chunks?.[0] || {};
            return {
                document_id: result.document_id,
                title: title,
                content: content.substring(0, 800), // Limit content length for tool response
                similarity_score: result.similarity_score,
                quality_avg: result.quality_avg ?? null,
                filename: result.filename,
                chunk_index: (top.chunk_index ?? result.chunk_index) || 0,
                page_number: top.page_number ?? null,
                content_type: top.content_type ?? null,
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

/**
 * Enhanced final response processing to support Mistral reference chunks when available
 */
async function processQAFinalResponseEnhanced(aiResult, allSearchResults, originalQuestion, collection, referencesMap) {
    const contentBlocks = Array.isArray(aiResult.raw_content_blocks) ? aiResult.raw_content_blocks : null;
    if (contentBlocks && contentBlocks.some(b => b.type === 'reference') && referencesMap) {
        const usedIds = [];
        let answerParts = [];
        for (const block of contentBlocks) {
            if (block.type === 'text' && typeof block.text === 'string') {
                answerParts.push(block.text);
            } else if (block.type === 'reference' && Array.isArray(block.reference_ids)) {
                block.reference_ids.forEach(id => {
                    usedIds.push(String(id));
                    answerParts.push(`⚡CITE${id}⚡`);
                });
            }
        }
        const answer = answerParts.join('');
        const citations = [];
        const sources = [];
        const byDoc = new Map();
        const usedUnique = [...new Set(usedIds)];
        usedUnique.forEach(idStr => {
            const ref = referencesMap[idStr];
            if (!ref) return;
            citations.push({
                index: idStr,
                cited_text: Array.isArray(ref.snippets) && ref.snippets.length > 0 ? (Array.isArray(ref.snippets[0]) ? ref.snippets[0].join(' ') : String(ref.snippets[0])) : (ref.description || ''),
                document_title: ref.title,
                document_id: ref.document_id,
                similarity_score: ref.similarity_score,
                chunk_index: ref.chunk_index || 0,
                filename: ref.filename
            });
            const key = ref.document_id || ref.title;
            if (!byDoc.has(key)) {
                byDoc.set(key, {
                    document_id: ref.document_id,
                    document_title: ref.title,
                    chunk_text: Array.isArray(ref.snippets) && ref.snippets.length > 0 ? (Array.isArray(ref.snippets[0]) ? ref.snippets[0].join(' ') : String(ref.snippets[0])) : '',
                    similarity_score: ref.similarity_score,
                    citations: []
                });
            }
        });
        citations.forEach(c => {
            const key = c.document_id || c.document_title;
            const entry = byDoc.get(key);
            if (entry) entry.citations.push(c);
        });
        for (const v of byDoc.values()) sources.push(v);
        return {
            success: true,
            answer,
            sources,
            citations,
            searchQuery: originalQuestion,
            searchCount: allSearchResults.length,
            uniqueDocuments: sources.length,
            metadata: {
                provider: 'qa_tools',
                timestamp: new Date().toISOString(),
                toolUseEnabled: true,
                collection_id: collection.id,
                collection_name: collection.name,
                token_count: 0
            }
        };
    }
    return await processQAFinalResponse(aiResult.content || '', allSearchResults, originalQuestion, collection);
}

function buildReferencesMapFromResults(results, idsFilter = undefined) {
    const map = {};
    const list = results || [];
    // Use 1-based indexing for NotebookLM-style citations
    let idx = 0;
    for (const r of list) {
        idx += 1;
        const idStr = String(idx);
        // If caller provided an ids filter, it is expected to be 1-based as well
        if (Array.isArray(idsFilter) && idsFilter.length > 0 && !idsFilter.includes(idx)) {
            continue;
        }
        const title = r.title || r.document_title || r.filename || `Dokument ${idx}`;
        const snippet = (r.content || r.relevant_content || r.chunk_text || '').slice(0, 500);
        map[idStr] = {
            url: r.url || null,
            title,
            snippets: [[snippet]],
            description: null,
            date: new Date().toISOString(),
            source: 'qa_documents',
            document_id: r.document_id,
            filename: r.filename,
            similarity_score: r.similarity_score,
            chunk_index: r.chunk_index || 0
        };
    }
    return map;
}

export default router;
