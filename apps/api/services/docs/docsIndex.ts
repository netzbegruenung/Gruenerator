/**
 * Retrieval over the Grünerator user documentation (doku.gruenerator.eu).
 *
 * Two tiers, deliberately split by cost — see the `hilfe` intent wiring:
 *
 *  - {@link buildDocsPageMap} — every page's title, URL and lead paragraph
 *    (~2.5k tokens for the WHOLE corpus). Injected into the system prompt on
 *    product/how-to turns, so even a turn that never reaches the agentic loop
 *    (CHITCHAT_RE pins "hilfe"/"was kannst du" to the single-pass path) can
 *    answer with a correct deep link.
 *  - {@link searchDocs } — BM25 over ~260 heading-level sections, behind the
 *    `gruenerator_docs_search` loop tool. Returns `#anchor` deep links.
 *
 * Lexical (BM25), not vector: at this corpus size embeddings buy nothing and
 * would cost an index, a sync job and a Qdrant round-trip per turn. Everything
 * here is in-process over a generated data module, so it also works offline
 * and in unit tests.
 */

import {
  DOCS_PAGES,
  DOCS_SECTIONS,
  DOCS_SITE_URL,
  type DocSection,
} from './docsIndex.generated.js';

export interface DocsSearchHit {
  /** Absolute, deep-linked URL — `…/docs/page#section`. */
  url: string;
  /** "Seite · Abschnitt", or just the page title for an intro section. */
  title: string;
  snippet: string;
  category: string;
  score: number;
}

export interface DocsPageRef {
  url: string;
  title: string;
}

const SNIPPET_CHARS = 320;

/** BM25 parameters — textbook defaults; the corpus is too small to tune. */
const K1 = 1.2;
const B = 0.75;

/**
 * How much a term in the heading/page title counts relative to body text.
 * Doc headings are terse and highly indicative ("Sharepic erstellen"), so a
 * title hit should outrank a passing body mention.
 */
const HEADING_WEIGHT = 3;

/**
 * Per-category score multiplier.
 *
 * The newsletter and Signal archives are dated ANNOUNCEMENTS ("Erstelle
 * Sharepics mit KI", Oktober 2025), not instructions — and because they
 * announce features in enthusiastic, keyword-dense prose they out-BM25 the
 * actual how-to page for exactly the questions this tool exists to answer.
 * Measured: "wie erstelle ich ein Sharepic" ranked an Oct-2025 newsletter above
 * the Social-Media-Post guide. They stay searchable (users do ask "was war neu
 * im Juli"), just not at the expense of current documentation.
 */
const CATEGORY_PRIOR: Record<string, number> = {
  Newsletter: 0.5,
  'Signal-Nachrichten': 0.5,
};
const DEFAULT_CATEGORY_PRIOR = 1;

/**
 * Boost for a section whose page/heading title appears VERBATIM in the query.
 *
 * Bag-of-words scoring cannot see that "wie funktioniert der KI-Chat" names a
 * specific page: "wie funktioniert" is a stock heading across the corpus and
 * buries the one page actually called "KI-Chat" (measured: rank 5). Naming a
 * page is the strongest possible relevance signal a user can give, so it is
 * scored as a phrase rather than as two ordinary terms.
 */
const TITLE_PHRASE_BOOST = 1.8;
const MIN_PHRASE_LENGTH = 4;

/**
 * German-aware normalisation. Umlauts fold to their digraphs so "Grüne" and
 * "gruene" collide, matching how users actually type in chat.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Very light German suffix stripping — enough to unify the inflections that
 * actually differ between a question and a heading ("Sharepics erstellen" vs
 * "Sharepic erstellt"). Deliberately NOT a real stemmer: aggressive stemming
 * on a 260-document corpus mostly manufactures collisions.
 */
function stem(token: string): string {
  if (token.length <= 4) return token;
  for (const suffix of [
    'ungen',
    'enden',
    'ende',
    'erin',
    'ern',
    'est',
    'end',
    'en',
    'er',
    'es',
    'em',
    'st',
    'e',
    'n',
    's',
  ]) {
    if (token.length - suffix.length >= 4 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/** German function words — they match everything and rank nothing. */
const STOPWORDS = new Set(
  [
    'aber',
    'alle',
    'als',
    'also',
    'am',
    'an',
    'auch',
    'auf',
    'aus',
    'bei',
    'bin',
    'bis',
    'bist',
    'da',
    'dann',
    'das',
    'dass',
    'dein',
    'dem',
    'den',
    'der',
    'des',
    'die',
    'dir',
    'doch',
    'dort',
    'du',
    'ein',
    'eine',
    'einem',
    'einen',
    'einer',
    'eines',
    'er',
    'es',
    'euer',
    'fuer',
    'hat',
    'hier',
    'ich',
    'ihr',
    'im',
    'in',
    'ist',
    'ja',
    'kann',
    'man',
    'mein',
    'mit',
    'nach',
    'nicht',
    'noch',
    'nur',
    'ob',
    'oder',
    'ohne',
    'sich',
    'sie',
    'sind',
    'so',
    'ueber',
    'um',
    'und',
    'uns',
    'unser',
    'vom',
    'von',
    'vor',
    'was',
    'wenn',
    'wer',
    'wie',
    'wir',
    'wo',
    'zu',
    'zum',
    'zur',
  ].map(stem)
);

function tokenise(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalise(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 2) continue;
    const token = stem(raw);
    if (STOPWORDS.has(token)) continue;
    out.push(token);
  }
  return out;
}

interface IndexedSection {
  section: DocSection;
  /** term → weighted frequency (heading terms counted HEADING_WEIGHT times). */
  freqs: Map<string, number>;
  length: number;
}

interface BuiltIndex {
  docs: IndexedSection[];
  /** term → number of sections containing it. */
  docFreq: Map<string, number>;
  avgLength: number;
}

let cached: BuiltIndex | null = null;

function buildIndex(): BuiltIndex {
  if (cached) return cached;

  const docs: IndexedSection[] = [];
  const docFreq = new Map<string, number>();
  let totalLength = 0;

  for (const section of DOCS_SECTIONS) {
    const freqs = new Map<string, number>();
    let length = 0;

    const add = (tokens: string[], weight: number): void => {
      for (const token of tokens) {
        freqs.set(token, (freqs.get(token) ?? 0) + weight);
        length += weight;
      }
    };
    add(tokenise(section.text), 1);
    add(tokenise(section.heading), HEADING_WEIGHT);
    // The page title only counts once per section beyond the heading, else
    // long pages dominate purely by repeating their own name.
    if (section.heading !== section.pageTitle) add(tokenise(section.pageTitle), 1);

    for (const term of freqs.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    docs.push({ section, freqs, length });
    totalLength += length;
  }

  cached = { docs, docFreq, avgLength: docs.length > 0 ? totalLength / docs.length : 1 };
  return cached;
}

/** True when the query literally contains the section's page or heading title. */
function namesTitle(normalisedQuery: string, pageTitle: string, heading: string): boolean {
  for (const title of [pageTitle, heading]) {
    const needle = normalise(title);
    if (needle.length >= MIN_PHRASE_LENGTH && normalisedQuery.includes(needle)) return true;
  }
  return false;
}

function absoluteUrl(section: DocSection): string {
  return `${DOCS_SITE_URL}${section.url}${section.anchor}`;
}

function sectionTitle(section: DocSection): string {
  return section.heading === section.pageTitle
    ? section.pageTitle
    : `${section.pageTitle} · ${section.heading}`;
}

/** A window of the section text around the first matching term. */
function buildSnippet(text: string, queryTerms: Set<string>): string {
  if (text.length <= SNIPPET_CHARS) return text;

  const words = text.split(/\s+/);
  let hitWord = -1;
  for (let i = 0; i < words.length; i++) {
    const token = stem(normalise(words[i]!).replace(/[^a-z0-9]/g, ''));
    if (token && queryTerms.has(token)) {
      hitWord = i;
      break;
    }
  }
  if (hitWord < 0) return `${text.slice(0, SNIPPET_CHARS - 1).trimEnd()}…`;

  // Re-derive a character offset from the word index, then centre the window.
  const charOffset = words.slice(0, hitWord).join(' ').length;
  const start = Math.max(0, charOffset - Math.floor(SNIPPET_CHARS / 3));
  const slice = text.slice(start, start + SNIPPET_CHARS).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + SNIPPET_CHARS < text.length ? '…' : ''}`;
}

/**
 * BM25 search over the documentation sections.
 *
 * Returns [] for an empty/stopword-only query rather than throwing — the caller
 * is a chat tool and an empty result is a valid "nothing found" answer.
 */
export function searchDocs(query: string, limit = 5): DocsSearchHit[] {
  const terms = tokenise(query);
  if (terms.length === 0) return [];

  const normalisedQuery = normalise(query);
  const { docs, docFreq, avgLength } = buildIndex();
  const uniqueTerms = new Set(terms);
  const scored: DocsSearchHit[] = [];

  for (const doc of docs) {
    let score = 0;
    for (const term of uniqueTerms) {
      const tf = doc.freqs.get(term);
      if (!tf) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      const norm = tf + K1 * (1 - B + (B * doc.length) / avgLength);
      score += idf * ((tf * (K1 + 1)) / norm);
    }
    if (score <= 0) continue;
    score *= CATEGORY_PRIOR[doc.section.category] ?? DEFAULT_CATEGORY_PRIOR;
    if (namesTitle(normalisedQuery, doc.section.pageTitle, doc.section.heading)) {
      score *= TITLE_PHRASE_BOOST;
    }
    scored.push({
      url: absoluteUrl(doc.section),
      title: sectionTitle(doc.section),
      snippet: buildSnippet(doc.section.text, uniqueTerms),
      category: doc.section.category,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // One hit per URL+anchor is already guaranteed (sections are unique), but a
  // long page can otherwise fill the whole result list with its own sections.
  const perPage = new Map<string, number>();
  const out: DocsSearchHit[] = [];
  for (const hit of scored) {
    const page = hit.url.split('#')[0]!;
    const seen = perPage.get(page) ?? 0;
    if (seen >= 2) continue;
    perPage.set(page, seen + 1);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The pages most related to a query, for the tool's "verwandte Seiten" hint —
 * lets the model point at a whole page without spending a second tool call.
 */
export function relatedDocsPages(query: string, limit = 3): DocsPageRef[] {
  const seen = new Set<string>();
  const out: DocsPageRef[] = [];
  for (const hit of searchDocs(query, 12)) {
    const url = hit.url.split('#')[0]!;
    if (seen.has(url)) continue;
    seen.add(url);
    const page = DOCS_PAGES.find((p) => `${DOCS_SITE_URL}${p.url}` === url);
    if (!page) continue;
    out.push({ url, title: page.title });
    if (out.length >= limit) break;
  }
  return out;
}

let cachedPageMap: string | null = null;

/**
 * The full page map, grouped by category — every documentation page with its
 * absolute URL and lead paragraph. Stable across turns, so it is built once.
 */
export function buildDocsPageMap(): string {
  if (cachedPageMap) return cachedPageMap;

  const byCategory = new Map<string, string[]>();
  for (const page of DOCS_PAGES) {
    const lines = byCategory.get(page.category) ?? [];
    const lead = page.lead ? ` — ${page.lead}` : '';
    lines.push(`- ${page.title} (${DOCS_SITE_URL}${page.url})${lead}`);
    byCategory.set(page.category, lines);
  }

  const sections = [...byCategory.entries()].map(
    ([category, lines]) => `### ${category}\n${lines.join('\n')}`
  );

  cachedPageMap = `

## GRÜNERATOR-DOKUMENTATION (${DOCS_SITE_URL})
Anleitungen und Hilfeseiten zum Grünerator. Verlinke bei Anleitungsfragen IMMER die passende Seite mit ihrer vollständigen URL. Erfinde keine Seiten, die hier nicht stehen.

${sections.join('\n\n')}`;
  return cachedPageMap;
}

/** Number of indexed pages/sections — for logging and the drift test. */
export function docsIndexStats(): { pages: number; sections: number } {
  return { pages: DOCS_PAGES.length, sections: DOCS_SECTIONS.length };
}
