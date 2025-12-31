/**
 * Content type detection and markdown structure utilities
 */

/**
 * Detect high-level content type from a text block
 * heading | paragraph | list | code | table
 * @param {string} text
 * @returns {('heading'|'paragraph'|'list'|'code'|'table')}
 */
function detectContentType(text) {
  const t = (text || '').trim();
  if (!t) return 'paragraph';

  // Fenced code blocks or typical code patterns
  if (/^\s*```/.test(t) || /;\s*$/.test(t) || /{\s*$/.test(t) || /\bfunction\b|=>|const\s+|let\s+|var\s+/.test(t)) {
    return 'code';
  }

  // Markdown header
  if (/^\s{0,3}#{1,6}\s+/.test(t)) return 'heading';

  // List (at least two bullet lines increases confidence)
  const listLines = t.split(/\r?\n/).filter(l => /^\s*[-*•]\s+/.test(l));
  if (listLines.length >= 1) return 'list';

  // Simple table detection via pipe and header separator
  const hasPipes = /\|/.test(t);
  const hasTableLine = /\n\s*\|?\s*-{2,}\s*\|/.test(t);
  if (hasPipes && (hasTableLine || (t.match(/\|/g) || []).length >= 4)) return 'table';

  return 'paragraph';
}

/**
 * Extract markdown structure features
 * @param {string} text
 * @returns {{headers: Array<{level:number,text:string}>, lists:number, codeBlocks:number, tables:number, blockquotes:boolean}}
 */
function detectMarkdownStructure(text) {
  const t = (text || '').replace(/\r/g, '');
  const lines = t.split(/\n/);
  const headers = [];
  let lists = 0;
  let tables = 0;
  let codeBlocks = 0;
  let inFence = false;
  let blockquotes = false;

  for (const raw of lines) {
    const line = raw || '';
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      if (inFence) codeBlocks += 1;
    }
    const level = extractHeaderLevel(line);
    if (level) headers.push({ level, text: line.replace(/^\s*#{1,6}\s+/, '').trim() });
    if (/^\s*[-*•]\s+/.test(line)) lists += 1;
    if (/\|/.test(line)) tables += 1;
    if (/^\s*>\s+/.test(line)) blockquotes = true;
  }

  // Normalize tables to block-count, not line-count
  if (tables > 0) {
    const blocks = t.split(/\n\s*\n/).filter(b => /\|/.test(b));
    tables = blocks.length;
  }

  return { headers, lists, codeBlocks, tables, blockquotes };
}

/**
 * Extract header level from a header line (1-6), else null
 * @param {string} text
 * @returns {number|null}
 */
function extractHeaderLevel(text) {
  const m = (text || '').match(/^\s*(#{1,6})\s+.+/);
  if (m) return Math.min(6, Math.max(1, m[1].length));
  return null;
}

/**
 * Extract page number from textual markers like "## Seite X" or "Seite 12"
 * @param {string} text
 * @returns {number|null}
 */
function extractPageNumber(text) {
  const m = (text || '').match(/(?:^|\n)\s*(?:##\s*)?Seite\s+(\d{1,5})\b/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Detect German-specific indicators in text
 * @param {string} text
 * @returns {{hasUmlauts:boolean, hasSectionSymbol:boolean, germanQuotes:boolean, months:boolean}}
 */
function detectGermanPatterns(text) {
  const t = text || '';
  const hasUmlauts = /[äöüÄÖÜß]/.test(t);
  const hasSectionSymbol = /§/.test(t);
  const germanQuotes = /[„“‚‘»«]/.test(t);
  const months = /(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/i.test(t);
  return { hasUmlauts, hasSectionSymbol, germanQuotes, months };
}

module.exports = {
  detectContentType,
  detectMarkdownStructure,
  extractHeaderLevel,
  extractPageNumber,
  detectGermanPatterns,
};

