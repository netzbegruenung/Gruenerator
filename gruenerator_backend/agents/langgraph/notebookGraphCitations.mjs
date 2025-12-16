/**
 * Citation functions extracted from notebookGraph.mjs for reuse in search system
 * These functions handle citation validation, reference mapping, and marker injection
 */

/**
 * Normalize search result format for consistent processing
 */
export function normalizeSearchResult(r) {
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
    url: r.url || null, // For web search results
    source_type: r.source_type || 'web'
  };
}

/**
 * Deduplicate and diversify results with limits per document
 */
export function dedupeAndDiversify(results, opts = {}) {
  const limitPerDoc = opts.limitPerDoc ?? 4;
  const maxTotal = opts.maxTotal ?? 12;
  // Sort by similarity desc, then title asc
  const sorted = [...results].sort((a, b) => (b.similarity - a.similarity) || String(a.title).localeCompare(String(b.title)));
  const seenPerDoc = new Map();
  const out = [];
  for (const r of sorted) {
    const key = r.document_id || r.url || r.title; // Use URL for web results, document_id for documents
    const count = seenPerDoc.get(key) || 0;
    if (count >= limitPerDoc) continue;
    seenPerDoc.set(key, count + 1);
    out.push(r);
    if (out.length >= maxTotal) break;
  }
  return out;
}

/**
 * Build references map with deterministic 1-based indexing
 */
export function buildReferencesMap(results) {
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
      source: r.source_type === 'official_document' ? 'qa_documents' : 'web_search',
      document_id: r.document_id,
      filename: r.filename,
      similarity_score: r.similarity,
      chunk_index: r.chunk_index,
      url: r.url, // For web search results
      source_type: r.source_type || 'web'
    };
  }
  return map;
}

/**
 * Normalize bracket lists to singles: [1, 3, 7] -> [1][3][7]
 */
export function normalizeBracketListsToSingles(text) {
  return text.replace(/\[(\s*\d+(?:\s*,\s*\d+)+\s*)\]/g, (m, inner) => {
    const nums = inner.split(',').map(s => s.trim()).filter(Boolean);
    return nums.map(n => `[${n}]`).join('');
  });
}

/**
 * Strip code fences from text
 */
export function stripCodeFences(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove leading/trailing fenced code blocks ```...```
  return text
    .replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/m, '$1')
    .replace(/^```\n([\s\S]*?)\n```\s*$/m, '$1');
}

/**
 * Strip trailing Quellen section from text
 */
export function stripQuellenSection(text) {
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

/**
 * Validate citations and inject citation markers
 */
export function validateAndInjectCitations(draft, refMap) {
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
      filename: ref.filename,
      url: ref.url, // For web search results
      source_type: ref.source_type
    };
  });

  // Build sources grouped by document
  const byDoc = new Map();
  for (const c of citations) {
    const key = c.document_id || c.url || c.document_title;
    if (!byDoc.has(key)) {
      byDoc.set(key, {
        document_id: c.document_id,
        document_title: c.document_title,
        chunk_text: c.cited_text,
        similarity_score: c.similarity_score,
        url: c.url,
        source_type: c.source_type,
        citations: []
      });
    }
    byDoc.get(key).citations.push(c);
  }
  const sources = [...byDoc.values()];

  return { cleanDraft: content, citations, sources, errors };
}

/**
 * Summarize references for prompt (compact string format)
 */
export function summarizeReferencesForPrompt(refMap, maxChars = 4000) {
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