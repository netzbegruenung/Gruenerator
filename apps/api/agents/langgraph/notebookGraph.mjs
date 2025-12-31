// Deterministic QA agent (planner -> search -> references -> draft -> validate -> (repair) -> done)
// No external graph deps; orchestrated step-by-step to avoid env/dependency changes.

import {
  buildPlannerPromptGrundsatz,
  buildPlannerPromptGeneral,
  buildDraftPromptGrundsatz,
  buildDraftPromptGeneral
} from './prompts.mjs';
import { DocumentSearchService } from '../../services/DocumentSearchService.js';
import { isSystemCollectionId } from '../../config/systemCollectionsConfig.js';
import {
  expandResultsToChunks,
  deduplicateResults,
  buildReferencesMap,
  validateAndInjectCitations,
  renumberCitationsInOrder,
  summarizeReferencesForPrompt,
  parseAIJsonResponse
} from '../../services/SearchResultProcessor.js';

const documentSearchService = new DocumentSearchService();

function adaptiveWeights(query) {
  const wordCount = query.trim().split(/\s+/).length;

  if (wordCount === 1) {
    // Single words: maximize vector similarity
    return { vectorWeight: 0.8, textWeight: 0.2 };
  } else if (wordCount === 2) {
    // Two words: balanced approach favoring vectors
    return { vectorWeight: 0.65, textWeight: 0.35 };
  } else {
    // 3+ words: text search likely to fail, favor vectors heavily
    return { vectorWeight: 0.75, textWeight: 0.25 };
  }
}

function calculateDynamicParams(allResults) {
  if (!allResults || allResults.length === 0) {
    return { qualityMin: 0.35, maxTotal: 6 };
  }

  const sorted = [...allResults].sort((a, b) => b.similarity - a.similarity);
  const highQuality = sorted.filter(r => r.similarity > 0.45).length;
  const mediumQuality = sorted.filter(r => r.similarity > 0.38).length;

  // Dynamic quality threshold - softer filtering
  let qualityMin;
  if (highQuality >= 15) {
    qualityMin = 0.40;  // Many good results, can be selective
  } else if (highQuality >= 8) {
    qualityMin = 0.37;  // Some good results, moderate threshold
  } else {
    qualityMin = 0.35;  // Few results, be inclusive
  }

  // Dynamic maxTotal - scale with content availability
  let maxTotal;
  if (highQuality >= 20) {
    maxTotal = 25;  // Exceptional content richness
  } else if (highQuality >= 12) {
    maxTotal = 18;  // Rich content available
  } else if (mediumQuality >= 8) {
    maxTotal = 12;  // Standard content
  } else {
    maxTotal = 8;   // Limited content, show what we have
  }

  return { qualityMin, maxTotal };
}

function determineDraftParams(referencesMap, question) {
  if (!referencesMap || Object.keys(referencesMap).length === 0) {
    return { maxTokens: 800 };  // Minimal response when no references
  }

  const referenceCount = Object.keys(referencesMap).length;
  const uniqueDocs = new Set(Object.values(referencesMap).map(r => r.document_id)).size;

  // Analyze question complexity
  const isComplexQuestion = question.length > 50 ||
                            /\b(wie|warum|weshalb|wieso|analysier|erkl[äa]r|begr[üu]nd|vergleich)\b/i.test(question);

  // Scale tokens based on content richness (increased for NotebookLM-style synthesis)
  let maxTokens;
  if (referenceCount >= 15 && uniqueDocs >= 8) {
    // Rich content available - comprehensive answer
    maxTokens = isComplexQuestion ? 3000 : 2500;
  } else if (referenceCount >= 8 && uniqueDocs >= 4) {
    // Standard content - detailed answer
    maxTokens = 2000;
  } else if (referenceCount >= 4 && uniqueDocs >= 2) {
    // Medium content - adequate answer
    maxTokens = 1500;
  } else {
    // Limited content - concise answer
    maxTokens = 1000;
  }

  return { maxTokens };
}

function dedupeAndDiversify(results, opts = {}) {
  // Calculate dynamic parameters if not explicitly overridden
  const dynamicParams = calculateDynamicParams(results);

  // No per-document limit - let the AI decide what's useful
  const maxTotal = opts.maxTotal ?? Math.max(dynamicParams.maxTotal, 40);
  const qualityMin = opts.qualityMin ?? dynamicParams.qualityMin;

  // Sort by similarity desc, then title asc
  const sorted = [...results]
    .filter(r => r.similarity >= qualityMin) // Apply dynamic quality filter
    .sort((a, b) => (b.similarity - a.similarity) || String(a.title).localeCompare(String(b.title)));

  // Return all quality results up to maxTotal - no per-document limit
  return sorted.slice(0, maxTotal);
}


async function plannerNode(question, aiWorkerPool, isSystemCollection) {
  const { system } = isSystemCollection ? buildPlannerPromptGrundsatz() : buildPlannerPromptGeneral();
  const res = await aiWorkerPool.processRequest({
    type: 'qa_planner',
    messages: [{ role: 'user', content: `Question: ${question}\nRespond with JSON: {"subqueries":["..."]}` }],
    systemPrompt: system,
    options: { max_tokens: 200, temperature: 0.1, top_p: 0.8 }
  });
  const raw = res.content || (Array.isArray(res.raw_content_blocks) ? res.raw_content_blocks.map(b => b.text || '').join('') : '');
  const parsed = parseAIJsonResponse(raw, { subqueries: [] });
  const subqueries = (parsed.subqueries || [])
    .filter(s => typeof s === 'string' && s.trim())
    .slice(0, 4);
  return subqueries.length > 0 ? subqueries : [question];
}

async function searchNode(subqueries, collection, searchOptions = {}) {
  const isSystemCollection = isSystemCollectionId(collection?.id);
  // Fallback: default to grundsatz_documents for system or 'documents' for user collections
  const searchCollection = isSystemCollection ? 'grundsatz_documents' : 'documents';
  const searchUserId = isSystemCollection ? null : collection.user_id;

  const all = [];
  for (const q of subqueries) {
    // Use adaptive weights based on query complexity
    const weights = adaptiveWeights(q);

    const resp = await documentSearchService.search({
      query: q,
      user_id: searchUserId,
      documentIds: isSystemCollection ? undefined : undefined, // system search across all grundsatz docs
      limit: 50,
      mode: 'hybrid',
      vectorWeight: typeof searchOptions.vectorWeight === 'number' ? searchOptions.vectorWeight : weights.vectorWeight,
      textWeight: typeof searchOptions.textWeight === 'number' ? searchOptions.textWeight : weights.textWeight,
      threshold: typeof searchOptions.threshold === 'number' ? searchOptions.threshold : 0.38,
      qualityMin: collection.settings?.min_quality || 0.35,
      searchCollection,
      // hybrid tuning
      recallLimit: 80
    });
    const list = expandResultsToChunks(resp.results || []);
    all.push(...list);
  }
  // Deduplicate by doc_id + chunk_index using shared utility
  const deduped = deduplicateResults(all, false);
  return dedupeAndDiversify(deduped, { limitPerDoc: 4 }); // Let dynamic params handle maxTotal and qualityMin
}

async function draftNode(question, referencesMap, collection, aiWorkerPool, isSystemCollection) {
  const collectionName = collection?.name || (isSystemCollection ? 'Grüne Grundsatzprogramme' : 'Ihre Sammlung');

  // Get adaptive draft parameters based on available references
  const { maxTokens } = determineDraftParams(referencesMap, question);

  // Always use dossier-style prompts (German)
  const system = isSystemCollection
    ? buildDraftPromptGrundsatz(collectionName).system
    : buildDraftPromptGeneral(collectionName).system;
  const temperature = 0.2;

  const refsSummary = summarizeReferencesForPrompt(referencesMap);
  const user = [
    `Frage: ${question}`,
    'Verwende nur Zitate aus der folgenden Referenz-Map (IDs sind 1-basiert):',
    refsSummary
  ].join('\n\n');

  const res = await aiWorkerPool.processRequest({
    type: 'qa_draft',
    messages: [{ role: 'user', content: user }],
    systemPrompt: system,
    options: { max_tokens: maxTokens, temperature, top_p: 0.8 }
  });

  const text = res.content || (Array.isArray(res.raw_content_blocks) ? res.raw_content_blocks.map(b => b.text || '').join('') : '');
  return text || '';
}

export async function runNotebookGraph({ question, collection, aiWorkerPool, searchCollection = null, userId = null, documentIds = undefined, recallLimit = 60, titleFilter = null, additionalFilter = null }) {
  // 1) plan subqueries (skip for simple queries ≤3 words)
  const isSystemCollection = isSystemCollectionId(collection?.id);
  const wordCount = question.trim().split(/\s+/).length;
  const subqueries = wordCount <= 3
    ? [question]
    : await plannerNode(question, aiWorkerPool, isSystemCollection);

  // 2) search (recall -> diversify)
  const searchResults = await (async () => {
    // Allow route to override scoping explicitly; fallback to collection-based inference
    if (searchCollection) {
      // Parallel search for all subqueries
      const searchPromises = subqueries.map(q => {
        const weights = adaptiveWeights(q);
        return documentSearchService.search({
          query: q,
          user_id: userId,
          documentIds,
          limit: 50,
          mode: 'hybrid',
          vectorWeight: weights.vectorWeight,
          textWeight: weights.textWeight,
          threshold: 0.38,
          searchCollection,
          recallLimit: recallLimit || 80,
          qualityMin: collection.settings?.min_quality || 0.35,
          titleFilter,
          additionalFilter
        });
      });
      const responses = await Promise.all(searchPromises);
      const all = responses.flatMap(resp => expandResultsToChunks(resp.results || []));
      // Deduplicate per doc:chunk using shared utility
      const deduped = deduplicateResults(all, false);
      return dedupeAndDiversify(deduped, { limitPerDoc: 4 }); // Let dynamic params handle maxTotal and qualityMin
    }
    // Fallback: infer from collection
    return await searchNode(subqueries, collection, {});
  })();
  if (!searchResults || searchResults.length === 0) {
    return {
      success: true,
      answer: `Leider konnte ich in der Sammlung "${collection?.name || 'Ihre Dokumente'}" keine passenden Stellen zu Ihrer Frage finden. Bitte formulieren Sie die Frage anders oder nutzen Sie spezifischere Stichworte.`,
      citations: [],
      sources: [],
      metadata: { provider: 'qa_graph', timestamp: new Date().toISOString(), uniqueDocuments: 0 }
    };
  }

  // 3) references map (deterministic 1-based by similarity)
  const originalReferencesMap = buildReferencesMap(searchResults);

  // 4) draft
  let draft = await draftNode(question, originalReferencesMap, collection, aiWorkerPool, isSystemCollection);

  // 4.5) Renumber citations by order of appearance for logical user experience
  // This ensures the first citation the user sees is [1], second is [2], etc.
  const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(draft, originalReferencesMap);
  draft = renumberedDraft;
  let referencesMap = newReferencesMap;

  // 5) validate & inject markers
  const { cleanDraft, citations, sources } = validateAndInjectCitations(draft, referencesMap);

  // Build allSources: all searched results that were NOT cited
  // This provides background context for the user
  const citedDocChunks = new Set(
    citations.map(c => `${c.document_id}:${c.chunk_index}`)
  );

  const allSources = searchResults
    .filter(r => !citedDocChunks.has(`${r.document_id}:${r.chunk_index}`))
    .map(r => ({
      document_id: r.document_id,
      document_title: r.title,
      url: r.url || null,
      chunk_text: r.snippet,
      similarity_score: r.similarity,
      chunk_index: r.chunk_index
    }));

  return {
    success: true,
    answer: cleanDraft,
    citations,
    sources,
    allSources, // Uncited sources for "Weitere Quellen" section
    metadata: {
      provider: 'qa_graph',
      timestamp: new Date().toISOString(),
      uniqueDocuments: new Set(searchResults.map(r => r.document_id)).size,
      citations_count: citations.length,
      allSources_count: allSources.length
    }
  };
}
