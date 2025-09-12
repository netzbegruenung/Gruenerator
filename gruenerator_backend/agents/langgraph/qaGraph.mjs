// Deterministic QA agent (planner -> search -> references -> draft -> validate -> (repair) -> done)
// No external graph deps; orchestrated step-by-step to avoid env/dependency changes.

import { buildPlannerPrompt, buildDraftPrompt } from './prompts.mjs';
import { DocumentSearchService } from '../../services/DocumentSearchService.js';

const documentSearchService = new DocumentSearchService();

function normalizeSearchResult(r) {
  const title = r.title || r.document_title || r.filename || 'Unbenanntes Dokument';
  const snippet = (r.relevant_content || r.chunk_text || '').slice(0, 500);
  const top = r.top_chunks?.[0] || {};
  return {
    document_id: r.document_id,
    title,
    snippet,
    filename: r.filename || null,
    similarity: typeof r.similarity_score === 'number' ? r.similarity_score : 0,
    chunk_index: (top.chunk_index ?? r.chunk_index) || 0,
    page_number: top.page_number ?? null
  };
}

function dedupeAndDiversify(results, opts = {}) {
  const limitPerDoc = opts.limitPerDoc ?? 4;
  const maxTotal = opts.maxTotal ?? 12;
  // Sort by similarity desc, then title asc
  const sorted = [...results].sort((a, b) => (b.similarity - a.similarity) || String(a.title).localeCompare(String(b.title)));
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

  // Build sources grouped by document
  const byDoc = new Map();
  for (const c of citations) {
    const key = c.document_id || c.document_title;
    if (!byDoc.has(key)) {
      byDoc.set(key, {
        document_id: c.document_id,
        document_title: c.document_title,
        chunk_text: c.cited_text,
        similarity_score: c.similarity_score,
        citations: []
      });
    }
    byDoc.get(key).citations.push(c);
  }
  const sources = [...byDoc.values()];

  return { cleanDraft: content, citations, sources, errors };
}

async function plannerNode(question, aiWorkerPool) {
  const { system } = buildPlannerPrompt();
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
    const resp = await documentSearchService.search({
      query: q,
      user_id: searchUserId,
      documentIds: isSystemCollection ? undefined : undefined, // system search across all grundsatz docs
      limit: 50,
      mode: 'hybrid',
      vectorWeight: typeof searchOptions.vectorWeight === 'number' ? searchOptions.vectorWeight : undefined,
      textWeight: typeof searchOptions.textWeight === 'number' ? searchOptions.textWeight : undefined,
      threshold: typeof searchOptions.threshold === 'number' ? searchOptions.threshold : undefined,
      qualityMin: collection.settings?.min_quality || undefined,
      searchCollection
    });
    const list = (resp.results || []).map(normalizeSearchResult);
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
  return dedupeAndDiversify(deduped, { limitPerDoc: 4, maxTotal: 12 });
}

async function draftNode(question, referencesMap, collection, aiWorkerPool) {
  const { system } = buildDraftPrompt(collection?.name || 'Grüne Grundsatzprogramme');
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
    options: { max_tokens: 2200, temperature: 0.2, top_p: 0.8 }
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

export async function runQaGraph({ question, collection, aiWorkerPool }) {
  // 1) plan subqueries
  const subqueries = await plannerNode(question, aiWorkerPool);

  // 2) search (recall -> diversify)
  const searchResults = await searchNode(subqueries, collection, {});
  if (!searchResults || searchResults.length === 0) {
    return {
      success: true,
      answer: 'Leider konnte ich in den Grundsatzprogrammen keine passenden Stellen zu Ihrer Frage finden. Bitte formulieren Sie die Frage anders oder nutzen Sie spezifischere Stichworte.',
      citations: [],
      sources: [],
      metadata: { provider: 'qa_graph', timestamp: new Date().toISOString(), uniqueDocuments: 0 }
    };
  }

  // 3) references map (deterministic 1-based)
  const referencesMap = buildReferencesMap(searchResults);

  // 4) draft
  let draft = await draftNode(question, referencesMap, collection, aiWorkerPool);

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
