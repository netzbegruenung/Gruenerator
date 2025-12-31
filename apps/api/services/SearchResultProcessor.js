/**
 * SearchResultProcessor - Shared utilities for processing search results
 *
 * Consolidates duplicate logic from:
 * - notebookInteraction.mjs (expandResultsWithCollection, deduplication, citations)
 * - notebookGraph.mjs (expandSearchResultsToChunks, buildReferencesMap, validateAndInjectCitations)
 */

/**
 * Expand document search results into individual chunk results
 * @param {Array} results - Search results from DocumentSearchService
 * @param {string} [collectionId] - Optional collection ID to tag results
 * @param {string} [collectionName] - Optional collection name to tag results
 * @returns {Array} Expanded chunk results
 */
function expandResultsToChunks(results, collectionId = null, collectionName = null) {
    const expanded = [];

    for (const r of results) {
        const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
        const topChunks = r.top_chunks || [];
        const sourceUrl = r.source_url || r.url || null;
        const docId = r.document_id || sourceUrl;

        if (topChunks.length > 0) {
            for (const chunk of topChunks) {
                expanded.push({
                    document_id: docId,
                    source_url: sourceUrl,
                    title,
                    snippet: chunk.preview || '',
                    filename: r.filename || null,
                    similarity: r.similarity_score || 0,
                    chunk_index: chunk.chunk_index,
                    page_number: chunk.page_number ?? null,
                    ...(collectionId && { collection_id: collectionId }),
                    ...(collectionName && { collection_name: collectionName })
                });
            }
        } else {
            expanded.push({
                document_id: docId,
                source_url: sourceUrl,
                title,
                snippet: r.relevant_content || r.chunk_text || '',
                filename: r.filename || null,
                similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
                chunk_index: r.chunk_index || 0,
                page_number: null,
                ...(collectionId && { collection_id: collectionId }),
                ...(collectionName && { collection_name: collectionName })
            });
        }
    }

    return expanded;
}

/**
 * Deduplicate results by document ID and chunk index
 * @param {Array} results - Expanded chunk results
 * @param {boolean} includeCollectionInKey - Whether to include collection_id in dedup key
 * @returns {Array} Deduplicated results
 */
function deduplicateResults(results, includeCollectionInKey = false) {
    const keySet = new Set();
    const deduped = [];

    for (const r of results) {
        const key = includeCollectionInKey
            ? `${r.collection_id}:${r.document_id}:${r.chunk_index}`
            : `${r.document_id}:${r.chunk_index}`;

        if (keySet.has(key)) continue;
        keySet.add(key);
        deduped.push(r);
    }

    return deduped;
}

/**
 * Build references map from search results for citation processing
 * @param {Array} results - Expanded and sorted chunk results
 * @returns {Object} Map of citation ID to reference data
 */
function buildReferencesMap(results) {
    const referencesMap = {};

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const id = String(i + 1);

        referencesMap[id] = {
            title: r.title,
            snippets: [[r.snippet]],
            description: null,
            date: new Date().toISOString(),
            source: 'qa_documents',
            document_id: r.document_id,
            source_url: r.source_url || r.url || null,
            filename: r.filename,
            similarity_score: r.similarity,
            chunk_index: r.chunk_index,
            page_number: r.page_number,
            ...(r.collection_id && { collection_id: r.collection_id }),
            ...(r.collection_name && { collection_name: r.collection_name })
        };
    }

    return referencesMap;
}

/**
 * Validate draft content and inject citation markers
 * @param {string} draft - AI-generated draft with [n] citations
 * @param {Object} referencesMap - Map of citation ID to reference data
 * @returns {Object} { cleanDraft, citations, sources, errors }
 */
function validateAndInjectCitations(draft, referencesMap) {
    const validIds = new Set(Object.keys(referencesMap));
    const errors = [];

    // Strip code fences if present
    let content = draft.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/m, '$1');

    // Strip "Quellen:" section if AI included it
    content = content.replace(/\n+Quellen:[\s\S]*$/i, '');

    // Normalize [1, 2, 3] to [1][2][3]
    content = content.replace(/\[(\s*\d+(?:\s*,\s*\d+)+\s*)\]/g, (m, inner) => {
        const nums = inner.split(',').map(s => s.trim()).filter(Boolean);
        return nums.map(n => `[${n}]`).join('');
    });

    // Find all citations and validate
    const usedIds = new Set();
    const citationPattern = /\[(\d+)\]/g;
    let match;

    while ((match = citationPattern.exec(content)) !== null) {
        const n = match[1];
        if (validIds.has(n)) {
            usedIds.add(n);
        } else {
            errors.push(`Invalid citation [${n}]`);
        }
    }

    // Replace valid citations with markers
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
            source_url: ref.source_url || ref.url || null,
            similarity_score: ref.similarity_score,
            chunk_index: ref.chunk_index,
            filename: ref.filename,
            page_number: ref.page_number,
            ...(ref.collection_id && { collection_id: ref.collection_id }),
            ...(ref.collection_name && { collection_name: ref.collection_name })
        };
    });

    // Build sources array (grouped by document)
    const byDoc = new Map();
    for (const c of citations) {
        const key = c.document_id || c.document_title;
        if (!byDoc.has(key)) {
            byDoc.set(key, {
                document_id: c.document_id,
                document_title: c.document_title,
                source_url: c.source_url || null,
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
        source_url: source.source_url || null,
        chunk_text: source.chunk_texts.join(' [...] '),
        similarity_score: Math.max(...source.similarity_scores),
        citations: source.citations
    }));

    return {
        cleanDraft: content,
        citations,
        sources,
        errors: errors.length > 0 ? errors : null
    };
}

/**
 * Renumber citations in order of appearance for logical UX
 * @param {string} draft - Draft with [n] citations
 * @param {Object} originalReferencesMap - Original references map
 * @returns {Object} { renumberedDraft, newReferencesMap }
 */
function renumberCitationsInOrder(draft, originalReferencesMap) {
    const citationPattern = /\[(\d+)\]/g;
    const seenOrder = [];
    let match;

    // Find order of appearance
    while ((match = citationPattern.exec(draft)) !== null) {
        const id = match[1];
        if (!seenOrder.includes(id) && originalReferencesMap[id]) {
            seenOrder.push(id);
        }
    }

    // Build mapping: old ID -> new ID
    const oldToNew = {};
    seenOrder.forEach((oldId, index) => {
        oldToNew[oldId] = String(index + 1);
    });

    // Renumber in draft
    let renumberedDraft = draft;
    for (const [oldId, newId] of Object.entries(oldToNew)) {
        const re = new RegExp(`\\[${oldId}\\]`, 'g');
        renumberedDraft = renumberedDraft.replace(re, `⟦${newId}⟧`);
    }
    renumberedDraft = renumberedDraft.replace(/⟦(\d+)⟧/g, '[$1]');

    // Build new references map
    const newReferencesMap = {};
    for (const [oldId, newId] of Object.entries(oldToNew)) {
        newReferencesMap[newId] = originalReferencesMap[oldId];
    }

    return { renumberedDraft, newReferencesMap };
}

/**
 * Sort results by similarity score and apply quality threshold
 * @param {Array} results - Search results
 * @param {Object} options - { threshold, limit }
 * @returns {Array} Filtered and sorted results
 */
function filterAndSortResults(results, options = {}) {
    const { threshold = 0.35, limit = 40 } = options;

    return results
        .filter(r => r.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}

/**
 * Group sources by collection for multi-collection responses
 * @param {Array} citations - Citations array
 * @param {Array} allResults - All search results
 * @param {Object} collectionsConfig - Map of collection ID to config
 * @returns {Object} Sources grouped by collection ID
 */
function groupSourcesByCollection(citations, allResults, collectionsConfig) {
    const sourcesByCollection = {};

    for (const [collectionId, config] of Object.entries(collectionsConfig)) {
        const collectionCitations = citations.filter(c => c.collection_id === collectionId);
        const collectionResults = allResults.filter(r => r.collection_id === collectionId);
        const citedDocChunks = new Set(collectionCitations.map(c => `${c.document_id}:${c.chunk_index}`));

        // Group citations by document
        const byDoc = new Map();
        for (const c of collectionCitations) {
            const key = c.document_id || c.document_title;
            if (!byDoc.has(key)) {
                byDoc.set(key, {
                    document_id: c.document_id,
                    document_title: c.document_title,
                    source_url: c.source_url || null,
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
            source_url: source.source_url || null,
            chunk_text: source.chunk_texts.join(' [...] '),
            similarity_score: Math.max(...source.similarity_scores),
            citations: source.citations
        }));

        const allSources = collectionResults
            .filter(r => !citedDocChunks.has(`${r.document_id}:${r.chunk_index}`))
            .map(r => ({
                document_id: r.document_id,
                document_title: r.title,
                source_url: r.source_url || r.url || null,
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

    return sourcesByCollection;
}

/**
 * Normalize a single search result for consistent processing
 * Used primarily for web search results
 * @param {Object} r - Raw search result
 * @returns {Object} Normalized result
 */
function normalizeSearchResult(r) {
    const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
    const snippet = (r.relevant_content || r.chunk_text || r.content || r.snippet || '').slice(0, 500);
    const top = r.top_chunks?.[0] || {};
    return {
        document_id: r.document_id,
        title,
        snippet,
        filename: r.filename || null,
        similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
        chunk_index: (top.chunk_index ?? r.chunk_index) || 0,
        page_number: top.page_number ?? null,
        source_url: r.source_url || r.url || null,
        source_type: r.source_type || 'web'
    };
}

/**
 * Deduplicate and diversify results with per-document limits
 * @param {Array} results - Search results
 * @param {Object} opts - { limitPerDoc, maxTotal }
 * @returns {Array} Deduplicated and limited results
 */
function dedupeAndDiversify(results, opts = {}) {
    const limitPerDoc = opts.limitPerDoc ?? 4;
    const maxTotal = opts.maxTotal ?? 12;

    const sorted = [...results].sort((a, b) =>
        (b.similarity - a.similarity) || String(a.title).localeCompare(String(b.title))
    );

    const seenPerDoc = new Map();
    const out = [];

    for (const r of sorted) {
        const key = r.document_id || r.url || r.title;
        const count = seenPerDoc.get(key) || 0;
        if (count >= limitPerDoc) continue;
        seenPerDoc.set(key, count + 1);
        out.push(r);
        if (out.length >= maxTotal) break;
    }

    return out;
}

/**
 * Summarize references map for AI prompts
 * @param {Object} refMap - References map
 * @param {number} maxChars - Maximum characters (default 4000)
 * @returns {string} Summarized references text
 */
function summarizeReferencesForPrompt(refMap, maxChars = 4000) {
    const lines = [];
    for (const id of Object.keys(refMap)) {
        const ref = refMap[id];
        const snippet = Array.isArray(ref.snippets) && ref.snippets[0] && Array.isArray(ref.snippets[0])
            ? String(ref.snippets[0].join(' '))
            : '';
        const short = snippet.slice(0, 150).replace(/\s+/g, ' ').trim();
        lines.push(`${id}. ${ref.title} — "${short}"`);
    }
    const joined = lines.join('\n');
    return joined.length > maxChars ? joined.slice(0, maxChars) : joined;
}

/**
 * Parse AI JSON response with code fence stripping and fallback
 * @param {string} content - Raw AI response content
 * @param {Object} fallback - Fallback value if parsing fails
 * @returns {Object} Parsed JSON or fallback
 */
function parseAIJsonResponse(content, fallback = {}) {
    try {
        if (!content) return fallback;
        // Strip code fences and markdown formatting
        let clean = content
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/g, '')
            .replace(/\*\*/g, '')
            .trim();
        return JSON.parse(clean);
    } catch (e) {
        return fallback;
    }
}

module.exports = {
    expandResultsToChunks,
    deduplicateResults,
    buildReferencesMap,
    validateAndInjectCitations,
    renumberCitationsInOrder,
    filterAndSortResults,
    groupSourcesByCollection,
    normalizeSearchResult,
    dedupeAndDiversify,
    summarizeReferencesForPrompt,
    parseAIJsonResponse
};
