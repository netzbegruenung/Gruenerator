/**
 * Turns a stored `full_text` into what the notebook reader renders: headings and
 * paragraphs, with the sentences that carry a query term marked as numbered
 * passages and the terms themselves split out.
 *
 * The server does the whole split so web and mobile only render — the matching
 * rules live in one place.
 *
 * Two text shapes arrive here:
 * - Markdown (PDFs via OCR): `##` headings, blank-line paragraphs, lists, tables.
 * - One flat line (Landesverband HTML pages until their extraction keeps
 *   structure): no breaks at all, so paragraphs are rebuilt from sentences.
 */
import { queryTerms } from '../search/lexicalPassageScore.js';

import type {
  ResearchDocumentBlock,
  ResearchDocumentPassage,
  ResearchDocumentPart,
  ResearchDocumentSegment,
} from '@gruenerator/contracts';

/** Target length of a paragraph rebuilt from a flat text. */
const FLAT_PARAGRAPH_CHARS = 500;
/** Longer than this, a paragraph is a page dump (PDF text without paragraph
 *  breaks) and is rebuilt from sentences like a flat text. */
const MAX_PARAGRAPH_CHARS = 1200;
/** Length of a passage's teaser in the list beside the text. */
const PASSAGE_TEASER_CHARS = 160;

const sentenceSegmenter = new Intl.Segmenter('de', { granularity: 'sentence' });

function sentences(text: string): string[] {
  return Array.from(sentenceSegmenter.segment(text), (s) => s.segment).filter(
    (s) => s.trim().length > 0
  );
}

/** Inline Markdown the OCR leaves behind, reduced to its text. */
function stripInlineMarkdown(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

type RawBlock = { kind: 'heading' | 'paragraph'; text: string };

function flatBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  let current = '';
  for (const sentence of sentences(text)) {
    current += sentence;
    if (current.length >= FLAT_PARAGRAPH_CHARS) {
      blocks.push({ kind: 'paragraph', text: current.trim() });
      current = '';
    }
  }
  if (current.trim()) blocks.push({ kind: 'paragraph', text: current.trim() });
  return blocks;
}

const HEADING = /^#{1,6}\s+(.+)$/;
const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}/;

function markdownBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  let lines: string[] = [];
  const flush = () => {
    const joined = stripInlineMarkdown(lines.join(' '));
    if (joined.length > MAX_PARAGRAPH_CHARS) blocks.push(...flatBlocks(joined));
    else if (joined) blocks.push({ kind: 'paragraph', text: joined });
    lines = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    if (!line || heading) {
      flush();
      const title = heading ? stripInlineMarkdown(heading[1]) : '';
      if (title) blocks.push({ kind: 'heading', text: title });
      continue;
    }
    if (TABLE_RULE.test(line)) continue;
    if (line.startsWith('|')) {
      flush();
      const cells = line
        .split('|')
        .map((c) => stripInlineMarkdown(c))
        .filter(Boolean);
      if (cells.length) blocks.push({ kind: 'paragraph', text: cells.join(' · ') });
      continue;
    }
    // Each list item stands alone; joined, a list reads as one run-on sentence.
    if (LIST_ITEM.test(line)) {
      flush();
      lines.push(`• ${line.replace(LIST_ITEM, '')}`);
      flush();
      continue;
    }
    lines.push(line);
  }
  flush();
  return blocks;
}

export function toBlocks(fullText: string): RawBlock[] {
  const text = fullText.replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  return text.includes('\n') ? markdownBlocks(text) : flatBlocks(text);
}

/** Two-letter words that separate nothing. Other two-letter tokens are kept:
 *  they are abbreviations („KI“, „EU“) — often the very thing searched for —
 *  and `queryTerms` drops everything under three letters. */
const SHORT_STOPWORDS = new Set([
  'ab',
  'am',
  'an',
  'da',
  'du',
  'er',
  'es',
  'im',
  'in',
  'ja',
  'ob',
  'so',
  'um',
  'wo',
  'zu',
]);

const escapeRegExp = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One pattern for all terms. Longer terms match as substrings on purpose, so
 * „Hitzeschutz“ also finds „Hitzeschutzbündnisse“ (see lexicalPassageScore).
 * Two-letter terms only match as whole words — „eu“ sits inside „neu“ and „heute“.
 */
function termPattern(query: string): RegExp | null {
  const short = (query ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length === 2 && !SHORT_STOPWORDS.has(t))
    .map((t) => `(?<![\\p{L}\\p{N}])${escapeRegExp(t)}(?![\\p{L}\\p{N}])`);
  const long = queryTerms(query).map(escapeRegExp);
  const alternatives = [...new Set([...long, ...short])];
  return alternatives.length ? new RegExp(alternatives.join('|'), 'giu') : null;
}

/** Splits `text` at every occurrence of a term. */
function splitTerms(text: string, pattern: RegExp | null): ResearchDocumentPart[] {
  if (!pattern) return [{ text, term: false }];
  const parts: ResearchDocumentPart[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start), term: false });
    parts.push({ text: match[0], term: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), term: false });
  return parts;
}

function teaser(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= PASSAGE_TEASER_CHARS) return flat;
  const cut = flat.lastIndexOf(' ', PASSAGE_TEASER_CHARS);
  return `${flat.slice(0, cut > 0 ? cut : PASSAGE_TEASER_CHARS)} …`;
}

export interface ReaderDocument {
  blocks: ResearchDocumentBlock[];
  passages: ResearchDocumentPassage[];
}

/**
 * Consecutive matching sentences in one paragraph form a single passage — a
 * point made over two sentences is one place to jump to, not two.
 */
export function buildReaderDocument(fullText: string, query: string): ReaderDocument {
  const pattern = termPattern(query);
  // A separate non-global copy: `test` on a /g regex carries `lastIndex` over.
  const probe = pattern ? new RegExp(pattern.source, 'iu') : null;
  const matches = (s: string) => probe?.test(s) ?? false;

  const blocks: ResearchDocumentBlock[] = [];
  const passages: ResearchDocumentPassage[] = [];
  let heading: string | null = null;

  for (const block of toBlocks(fullText)) {
    if (block.kind === 'heading') {
      heading = block.text;
      blocks.push({
        kind: 'heading',
        segments: [{ passage: null, parts: splitTerms(block.text, pattern) }],
      });
      continue;
    }

    const segments: ResearchDocumentSegment[] = [];
    let run: { hit: boolean; text: string } | null = null;
    const close = () => {
      if (!run) return;
      let passage: number | null = null;
      if (run.hit) {
        passage = passages.length;
        passages.push({ index: passage, heading, text: teaser(run.text) });
      }
      segments.push({ passage, parts: splitTerms(run.text, pattern) });
      run = null;
    };
    for (const sentence of sentences(block.text)) {
      const hit = matches(sentence);
      if (run && run.hit !== hit) close();
      run = run ? { hit, text: run.text + sentence } : { hit, text: sentence };
    }
    close();
    if (segments.length) blocks.push({ kind: 'paragraph', segments });
  }

  return { blocks, passages };
}
