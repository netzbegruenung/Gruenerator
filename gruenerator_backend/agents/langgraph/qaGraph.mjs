// Deterministic QA agent (planner -> search -> references -> draft -> validate -> (repair) -> done)
// No external graph deps; orchestrated step-by-step to avoid env/dependency changes.

import {
  buildPlannerPromptGrundsatz,
  buildPlannerPromptGeneral,
  buildDraftPromptGrundsatz,
  buildDraftPromptGeneral,
  buildDraftPromptGrundsatzChat,
  buildDraftPromptGeneralChat
} from './prompts.mjs';
import { DocumentSearchService } from '../../services/DocumentSearchService.js';

const documentSearchService = new DocumentSearchService();

function expandSearchResultsToChunks(results) {
  // Expand each document result into individual chunk results for granular citations
  const expanded = [];
  for (const r of results) {
    const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
    const topChunks = r.top_chunks || [];

    if (topChunks.length > 0) {
      // Create one result per chunk for individual citations
      for (const chunk of topChunks) {
        expanded.push({
          document_id: r.document_id,
          title,
          snippet: chunk.preview || '',
          filename: r.filename || null,
          similarity: r.similarity_score || 0,
          chunk_index: chunk.chunk_index,
          page_number: chunk.page_number ?? null
        });
      }
    } else {
      // Fallback: use relevant_content if no top_chunks
      expanded.push({
        document_id: r.document_id,
        title,
        snippet: (r.relevant_content || r.chunk_text || ''),
        filename: r.filename || null,
        similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
        chunk_index: r.chunk_index || 0,
        page_number: null
      });
    }
  }
  return expanded;
}

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

  const limitPerDoc = opts.limitPerDoc ?? 4;
  const maxTotal = opts.maxTotal ?? dynamicParams.maxTotal;
  const qualityMin = opts.qualityMin ?? dynamicParams.qualityMin;

  // Sort by similarity desc, then title asc
  const sorted = [...results]
    .filter(r => r.similarity >= qualityMin) // Apply dynamic quality filter
    .sort((a, b) => (b.similarity - a.similarity) || String(a.title).localeCompare(String(b.title)));

  const seenPerDoc = new Map();
  const out = [];
  for (const r of sorted) {
    const count = seenPerDoc.get(r.document_id) || 0;
    if (count >= limitPerDoc) continue;
    seenPerDoc.set(r.document_id, count + 1);
    out.push(r);
    if (out.length >= maxTotal) break;
  }
  return out;
}

function buildReferencesMap(results) {
  // Deterministic: sort again to ensure stable IDs
  const sorted = [...results].sort((a, b) => (b.similarity - a.similarity) || String(a.title).localeCompare(String(b.title)));
  const map = {};
  let idx = 0;
  for (const r of sorted) {
    idx += 1; // 1-based
    const idStr = String(idx);
    map[idStr] = {
      title: r.title,
      snippets: [[r.snippet]],
      description: null,
      date: new Date().toISOString(),
      source: 'qa_documents',
      document_id: r.document_id,
      filename: r.filename,
      similarity_score: r.similarity,
      chunk_index: r.chunk_index
    };
  }
  return map;
}

function summarizeReferencesForPrompt(refMap, maxChars = 4000) {
  // Compact string summary: id. title — first 150 chars of snippet
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

function normalizeBracketListsToSingles(text) {
  // Turn [1, 3, 7] into [1][3][7]
  return text.replace(/\[(\s*\d+(?:\s*,\s*\d+)+\s*)\]/g, (m, inner) => {
    const nums = inner.split(',').map(s => s.trim()).filter(Boolean);
    return nums.map(n => `[${n}]`).join('');
  });
}

function stripCodeFences(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove leading/trailing fenced code blocks ```...```
  return text
    .replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/m, '$1')
    .replace(/^```\n([\s\S]*?)\n```\s*$/m, '$1');
}

function stripQuellenSection(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove a trailing Quellen section (### Quellen / **Quellen** / Quellen:) and everything after
  const patterns = [
    /\n+#{1,6}\s*Quellen[\s\S]*$/i,
    /\n+\*\*Quellen\*\*[\s\S]*$/i,
    /\n+Quellen:\s*[\s\S]*$/i
  ];
  let out = text;
  for (const p of patterns) {
    out = out.replace(p, '\n');
  }
  return out.trim();
}

function validateAndInjectCitations(draft, refMap) {
  const errors = [];
  const validIds = new Set(Object.keys(refMap));
  // Pre-clean: strip fences and trailing Quellen section
  let content = stripCodeFences(draft);
  content = stripQuellenSection(content);
  // Normalize list brackets first
  content = normalizeBracketListsToSingles(content);

  // Find all [n]
  const citationPattern = /\[(\d+)\]/g;
  const usedIds = new Set();
  let match;
  while ((match = citationPattern.exec(content)) !== null) {
    const n = match[1];
    if (n === '0') {
      errors.push('Found [0] citation');
      continue;
    }
    if (!validIds.has(n)) {
      errors.push(`Out-of-range citation [${n}]`);
      continue;
    }
    usedIds.add(n);
  }

  // Replace [n] with ⚡CITEn⚡
  for (const id of usedIds) {
    const re = new RegExp(`\\[${id}\\]`, 'g');
    content = content.replace(re, `⚡CITE${id}⚡`);
  }

  // Build citations array
  const citations = [...usedIds].map(id => {
    const ref = refMap[id];
    const cited = Array.isArray(ref.snippets) && ref.snippets[0] && Array.isArray(ref.snippets[0]) ? String(ref.snippets[0].join(' ')) : '';
    return {
      index: id,
      cited_text: cited,
      document_title: ref.title,
      document_id: ref.document_id,
      similarity_score: ref.similarity_score,
      chunk_index: ref.chunk_index,
      filename: ref.filename
    };
  });

  // Build sources grouped by document with multiple chunks aggregated
  const byDoc = new Map();
  for (const c of citations) {
    const key = c.document_id || c.document_title;
    if (!byDoc.has(key)) {
      byDoc.set(key, {
        document_id: c.document_id,
        document_title: c.document_title,
        chunk_texts: [c.cited_text],
        similarity_scores: [c.similarity_score],
        citations: []
      });
    } else {
      // Append additional chunks from the same document
      const existing = byDoc.get(key);
      existing.chunk_texts.push(c.cited_text);
      existing.similarity_scores.push(c.similarity_score);
    }
    byDoc.get(key).citations.push(c);
  }

  // Convert to final sources format with aggregated chunk content
  const sources = [...byDoc.values()].map(source => ({
    document_id: source.document_id,
    document_title: source.document_title,
    chunk_text: source.chunk_texts.join(' [...] '), // Combine all chunks with separator
    similarity_score: Math.max(...source.similarity_scores), // Use highest similarity score
    citations: source.citations
  }));

  return { cleanDraft: content, citations, sources, errors };
}

async function plannerNode(question, aiWorkerPool, isGrundsatz) {
  const { system } = isGrundsatz ? buildPlannerPromptGrundsatz() : buildPlannerPromptGeneral();
  const res = await aiWorkerPool.processRequest({
    type: 'qa_planner',
    messages: [{ role: 'user', content: `Question: ${question}\nRespond with JSON: {"subqueries":["..."]}` }],
    systemPrompt: system,
    options: { max_tokens: 200, temperature: 0.1, top_p: 0.8 }
  });
  let subqueries = [];
  try {
    let raw = res.content || (Array.isArray(res.raw_content_blocks) ? res.raw_content_blocks.map(b => b.text || '').join('') : '');
    // Strip code fences if model returned fenced JSON
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/g, '').trim();
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.subqueries)) {
      subqueries = parsed.subqueries.filter(s => typeof s === 'string' && s.trim()).slice(0, 4);
    }
  } catch (_) {}
  if (subqueries.length === 0) subqueries = [question];
  return subqueries;
}

async function searchNode(subqueries, collection, searchOptions = {}) {
  const isSystemCollection = (collection.user_id === 'SYSTEM') || (collection.settings?.system_collection === true) || (collection.id === 'grundsatz-system');
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
    const list = expandSearchResultsToChunks(resp.results || []);
    all.push(...list);
  }
  // Deduplicate by doc_id + chunk_index
  const keySet = new Set();
  const deduped = [];
  for (const r of all) {
    const key = `${r.document_id}:${r.chunk_index}`;
    if (keySet.has(key)) continue;
    keySet.add(key);
    deduped.push(r);
  }
  return dedupeAndDiversify(deduped, { limitPerDoc: 4 }); // Let dynamic params handle maxTotal and qualityMin
}

async function draftNode(question, referencesMap, collection, aiWorkerPool, isGrundsatz, mode = 'dossier') {
  const collectionName = collection?.name || (isGrundsatz ? 'Grüne Grundsatzprogramme' : 'Ihre Sammlung');

  // Get adaptive draft parameters based on available references
  const { maxTokens: adaptiveTokens } = determineDraftParams(referencesMap, question);

  // Select prompt based on mode and collection type
  let system;
  let maxTokens;
  let temperature;

  if (mode === 'chat') {
    system = isGrundsatz
      ? buildDraftPromptGrundsatzChat(collectionName).system
      : buildDraftPromptGeneralChat(collectionName).system;
    maxTokens = Math.min(adaptiveTokens, 800); // Cap chat responses but adapt to content
    temperature = 0.3; // Slightly more conversational
  } else {
    system = isGrundsatz
      ? buildDraftPromptGrundsatz(collectionName).system
      : buildDraftPromptGeneral(collectionName).system;
    maxTokens = adaptiveTokens; // Use adaptive token count for dossier mode
    temperature = 0.2; // More formal
  }

  const refsSummary = summarizeReferencesForPrompt(referencesMap);
  const user = [
    `Question: ${question}`,
    'You must cite only using the following references map (IDs are 1-based):',
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

async function repairNode(badDraft, referencesMap, aiWorkerPool) {
  const allowed = Object.keys(referencesMap).join(', ');
  const system = [
    'You are a citation fixer.',
    'Task: Adjust the bracket citations in the provided markdown so that they only use the allowed 1-based IDs.',
    'Do not change the content except replacing/adjusting [n] citations. No added text. No explanations.'
  ].join('\n');
  const user = [
    `Allowed IDs: ${allowed}`,
    'Return only the corrected markdown.',
    '---',
    badDraft
  ].join('\n\n');
  const res = await aiWorkerPool.processRequest({
    type: 'qa_repair',
    messages: [{ role: 'user', content: user }],
    systemPrompt: system,
    options: { max_tokens: 600, temperature: 0.1, top_p: 0.8 }
  });
  const text = res.content || (Array.isArray(res.raw_content_blocks) ? res.raw_content_blocks.map(b => b.text || '').join('') : '');
  return text || badDraft;
}

export async function runQaGraph({ question, collection, aiWorkerPool, searchCollection = null, userId = null, documentIds = undefined, recallLimit = 60, mode = 'dossier' }) {
  // 1) plan subqueries
  const isGrundsatz = (collection?.id === 'grundsatz-system') || ((collection?.user_id === 'SYSTEM') && (collection?.settings?.system_collection === true));
  const subqueries = await plannerNode(question, aiWorkerPool, isGrundsatz);

  // 2) search (recall -> diversify)
  const searchResults = await (async () => {
    // Allow route to override scoping explicitly; fallback to collection-based inference
    if (searchCollection) {
      const all = [];
      for (const q of subqueries) {
        // Use adaptive weights based on query complexity
        const weights = adaptiveWeights(q);

        const resp = await documentSearchService.search({
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
          qualityMin: collection.settings?.min_quality || 0.35
        });
        const list = expandSearchResultsToChunks(resp.results || []);
        all.push(...list);
      }
      // Deduplicate per doc:chunk
      const keySet = new Set();
      const deduped = [];
      for (const r of all) {
        const key = `${r.document_id}:${r.chunk_index}`;
        if (keySet.has(key)) continue;
        keySet.add(key);
        deduped.push(r);
      }
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

  // 3) references map (deterministic 1-based)
  const referencesMap = buildReferencesMap(searchResults);

  // 4) draft
  let draft = await draftNode(question, referencesMap, collection, aiWorkerPool, isGrundsatz, mode);

  // 5) validate & inject markers
  let { cleanDraft, citations, sources, errors } = validateAndInjectCitations(draft, referencesMap);

  // 6) repair loop (single pass)
  if (errors && errors.length > 0) {
    const repaired = await repairNode(draft, referencesMap, aiWorkerPool);
    const v2 = validateAndInjectCitations(repaired, referencesMap);
    cleanDraft = v2.cleanDraft;
    citations = v2.citations;
    sources = v2.sources;
    errors = v2.errors;
  }

  return {
    success: true,
    answer: cleanDraft,
    citations,
    sources,
    metadata: {
      provider: 'qa_graph',
      timestamp: new Date().toISOString(),
      uniqueDocuments: new Set(searchResults.map(r => r.document_id)).size,
      citations_count: citations.length
    }
  };
}
