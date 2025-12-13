// Deterministic QA agent (planner -> search -> references -> draft -> validate -> (repair) -> done)
// No external graph deps; orchestrated step-by-step to avoid env/dependency changes.

import {
  buildPlannerPromptGrundsatz,
  buildPlannerPromptGeneral,
  buildDraftPromptGrundsatz,
  buildDraftPromptGeneral
} from './prompts.mjs';
import { DocumentSearchService } from '../../services/DocumentSearchService.js';

const documentSearchService = new DocumentSearchService();

function expandSearchResultsToChunks(results) {
  // Expand each document result into individual chunk results for granular citations
  const expanded = [];
  for (const r of results) {
    const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
    const topChunks = r.top_chunks || [];
    // For bundestag_content: use URL as document_id if no document_id exists
    const docId = r.document_id || r.url;

    if (topChunks.length > 0) {
      // Create one result per chunk for individual citations
      for (const chunk of topChunks) {
        expanded.push({
          document_id: docId,
          url: r.url || null,
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
        document_id: docId,
        url: r.url || null,
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
      url: r.url || null,
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

function moveCitationsAfterPunctuation(text) {
  // Move citation markers to AFTER punctuation for better readability
  // Before: "...gefährdet[1]." or "...gefährdet[1][2]."
  // After:  "...gefährdet.[1]" or "...gefährdet.[1][2]"
  return text.replace(/((?:\[\d+\])+)([.,:;!?])/g, '$2$1');
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

function renumberCitationsInOrder(draft, referencesMap) {
  // Renumber citations so they appear sequentially (1, 2, 3...) in order of first appearance
  // This ensures the user sees [1] before [2], [2] before [3], etc.

  const citationPattern = /\[(\d+)\]/g;
  const orderOfAppearance = [];
  let match;

  // Find all unique citation IDs in order of appearance
  while ((match = citationPattern.exec(draft)) !== null) {
    const id = match[1];
    if (!orderOfAppearance.includes(id) && referencesMap[id]) {
      orderOfAppearance.push(id);
    }
  }

  // If no citations found or all already in order, return unchanged
  if (orderOfAppearance.length === 0) {
    return { renumberedDraft: draft, newReferencesMap: referencesMap, idMapping: {} };
  }

  // Build old-to-new ID mapping based on appearance order
  const idMapping = {};
  orderOfAppearance.forEach((oldId, index) => {
    idMapping[oldId] = String(index + 1);
  });

  // Replace IDs in draft - process largest IDs first to avoid [1] → [10] collision
  let renumberedDraft = draft;
  const sortedOldIds = Object.keys(idMapping).sort((a, b) => Number(b) - Number(a));

  for (const oldId of sortedOldIds) {
    const newId = idMapping[oldId];
    // Use temporary placeholder to avoid collision during replacement
    renumberedDraft = renumberedDraft.replace(
      new RegExp(`\\[${oldId}\\]`, 'g'),
      `⟦${newId}⟧`
    );
  }

  // Convert placeholders back to brackets
  renumberedDraft = renumberedDraft.replace(/⟦(\d+)⟧/g, '[$1]');

  // Rebuild referencesMap with new sequential IDs
  const newReferencesMap = {};
  for (const [oldId, newId] of Object.entries(idMapping)) {
    newReferencesMap[newId] = referencesMap[oldId];
  }

  return { renumberedDraft, newReferencesMap, idMapping };
}

function validateAndInjectCitations(draft, refMap) {
  const errors = [];
  const validIds = new Set(Object.keys(refMap));
  // Pre-clean: strip fences and trailing Quellen section
  let content = stripCodeFences(draft);
  content = stripQuellenSection(content);
  // Normalize list brackets first
  content = normalizeBracketListsToSingles(content);
  // Move citations after punctuation for better readability
  content = moveCitationsAfterPunctuation(content);

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
      url: ref.url || null,
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
        url: c.url || null,
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
    url: source.url || null,
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

async function draftNode(question, referencesMap, collection, aiWorkerPool, isGrundsatz) {
  const collectionName = collection?.name || (isGrundsatz ? 'Grüne Grundsatzprogramme' : 'Ihre Sammlung');

  // Get adaptive draft parameters based on available references
  const { maxTokens } = determineDraftParams(referencesMap, question);

  // Always use dossier-style prompts (German)
  const system = isGrundsatz
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

async function repairNode(badDraft, referencesMap, aiWorkerPool) {
  const allowed = Object.keys(referencesMap).join(', ');
  const system = [
    'Du bist ein Zitat-Korrektur-Assistent.',
    'Aufgabe: Passe die Klammer-Zitate im bereitgestellten Markdown an, sodass nur die erlaubten 1-basierten IDs verwendet werden.',
    'Ändere den Inhalt nicht, außer dem Ersetzen/Anpassen von [n]-Zitaten. Kein zusätzlicher Text. Keine Erklärungen.'
  ].join('\n');
  const user = [
    `Erlaubte IDs: ${allowed}`,
    'Gib nur das korrigierte Markdown zurück.',
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

export async function runQaGraph({ question, collection, aiWorkerPool, searchCollection = null, userId = null, documentIds = undefined, recallLimit = 60, titleFilter = null }) {
  // 1) plan subqueries (skip for simple queries ≤3 words)
  const isGrundsatz = (collection?.id === 'grundsatz-system') || ((collection?.user_id === 'SYSTEM') && (collection?.settings?.system_collection === true));
  const wordCount = question.trim().split(/\s+/).length;
  const subqueries = wordCount <= 3
    ? [question]
    : await plannerNode(question, aiWorkerPool, isGrundsatz);

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
          titleFilter
        });
      });
      const responses = await Promise.all(searchPromises);
      const all = responses.flatMap(resp => expandSearchResultsToChunks(resp.results || []));
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

  // 3) references map (deterministic 1-based by similarity)
  const originalReferencesMap = buildReferencesMap(searchResults);

  // 4) draft
  let draft = await draftNode(question, originalReferencesMap, collection, aiWorkerPool, isGrundsatz);

  // 4.5) Renumber citations by order of appearance for logical user experience
  // This ensures the first citation the user sees is [1], second is [2], etc.
  const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(draft, originalReferencesMap);
  draft = renumberedDraft;
  let referencesMap = newReferencesMap;

  // 5) validate & inject markers
  let { cleanDraft, citations, sources, errors } = validateAndInjectCitations(draft, referencesMap);

  // 6) repair loop (single pass) - DISABLED: adds extra AI call latency (~1-3s)
  // if (errors && errors.length > 0) {
  //   const repaired = await repairNode(draft, referencesMap, aiWorkerPool);
  //   const v2 = validateAndInjectCitations(repaired, referencesMap);
  //   cleanDraft = v2.cleanDraft;
  //   citations = v2.citations;
  //   sources = v2.sources;
  //   errors = v2.errors;
  // }

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
