/**
 * Generates the chat-searchable index of the Docusaurus user documentation
 * (`documentation/docs`) into `apps/api/services/docs/docsIndex.generated.ts`.
 *
 * Why a build-time artifact and not a runtime read: the API container does not
 * COPY `documentation/` (see apps/api/Dockerfile), so the markdown simply is not
 * on disk in production. Committing the generated module is what makes the docs
 * reachable from the chat at all — `pnpm docs:index` regenerates it and CI fails
 * any PR that edits the docs without rerunning it.
 *
 * Emitted as a .ts data module (not .json) to match the repo's other generated
 * data — `packages/shared/src/agents/definitions/index.generated.ts`,
 * `services/mcp/src/prompts/agents.generated.ts` — so it compiles into dist/
 * with the rest of the source and needs no JSON import attributes under NodeNext.
 *
 * Two layers, matching the two consumption tiers (see services/docs/docsIndex.ts):
 *  - `pages`   — one record per doc page (~33), each with the lead paragraph.
 *                Cheap enough (~1.3k tokens for ALL of them) to inject whole.
 *  - `sections`— one record per heading (~250), the BM25 search corpus, each
 *                carrying the `#anchor` so a citation deep-links to the section.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DOCS_DIR = path.join(REPO_ROOT, 'documentation', 'docs');
const OUT_FILE = path.join(REPO_ROOT, 'apps', 'api', 'services', 'docs', 'docsIndex.generated.ts');

/**
 * Folders Docusaurus itself excludes from the build (`docs.exclude` in
 * documentation/docusaurus.config.ts). Indexing them would emit citation links
 * to pages that 404.
 */
const EXCLUDED_TOP_FOLDERS = new Set(['intern', 'experimente']);

/**
 * Individual pages temporarily out of the docs (docs.exclude in
 * documentation/docusaurus.config.ts) — same reason as EXCLUDED_TOP_FOLDERS.
 */
const EXCLUDED_FILES = new Set(['basics/finetuning', 'basics/welches-ki-tool-wofuer']);

/** Human labels per top-level folder — becomes the page-map grouping. */
const CATEGORY_LABELS = {
  basics: 'Basics',
  guides: 'Guides',
  chat: 'Chat',
  features: 'Features',
  konto: 'Konto & Projekte',
  integrationen: 'Integrationen',
  sonstiges: 'Sonstiges',
  archiv: 'Archiv',
};

const LEAD_MAX_CHARS = 200;
// Also the guard that keeps expanded ChatTables sections (COMPONENT_EXPANSIONS)
// from inflating the corpus statistics — raising it to fit fuller rows flipped
// a borderline BM25 ranking; the expansions are compact instead.
const SECTION_MAX_CHARS = 1200;

function walk(dir, relBase = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const rel = relBase ? `${relBase}/${name}` : name;
    if (statSync(abs).isDirectory()) {
      if (!relBase && EXCLUDED_TOP_FOLDERS.has(name)) continue;
      out.push(...walk(abs, rel));
    } else if (name.endsWith('.md') || name.endsWith('.mdx')) {
      if (EXCLUDED_FILES.has(rel.replace(/\.mdx?$/, ''))) continue;
      out.push(rel);
    }
  }
  return out;
}

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { data, body: raw.slice(match[0].length) };
}

/**
 * File path → site URL. Docusaurus is running with default settings here: no
 * `slug`/`id` frontmatter overrides anywhere in the corpus, `routeBasePath`
 * '/docs', and case preserved (`/docs/Grundlagen/…` really is capitalised).
 *
 * Number prefixes are deliberately NOT stripped. The only numeric prefixes in
 * the corpus are the newsletter date prefixes (`2025-03-gruugo.md`), and
 * Docusaurus' DefaultNumberPrefixParser leaves date-like prefixes intact — the
 * live sitemap serves `/docs/newsletter/2025-03-gruugo`. `assertUrlsResolve`
 * below guards this assumption against future files.
 */
function toUrl(relPath) {
  const withoutExt = relPath.replace(/\.mdx?$/, '');
  if (withoutExt.endsWith('/index')) return `/docs/${withoutExt.slice(0, -'/index'.length)}/`;
  return `/docs/${withoutExt}`;
}

/**
 * Heading anchor, matching Docusaurus' default id generation. Umlauts are kept
 * (the live pages really do serve `#was-du-benötigst`).
 *
 * Each whitespace character maps to its OWN hyphen — runs are NOT collapsed.
 * Docusaurus drops a disallowed character in place and then hyphenates the
 * spaces that surrounded it, so "Ausnahme – Redaktionelle" becomes
 * `ausnahme--redaktionelle` with a double hyphen. Collapsing here produced a
 * single hyphen and a dead deep link.
 */
function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** An MDX ESM statement (`import UiLabel from '@site/...'`) — never prose. */
const MDX_ESM_RE = /^\s*(import|export)\s/;

/**
 * The manifest behind the `ChatTables` components. Loaded lazily so the index
 * generator keeps working (minus the expansions) if the file is ever absent.
 */
function loadChatCapabilities() {
  const file = path.join(REPO_ROOT, 'documentation/src/generated/chat-capabilities.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/**
 * `stripInline` drops every JSX tag, so a table rendered by a React component
 * would vanish from the BM25 corpus — the chat's `gruenerator_docs_search`
 * could then no longer answer "welche Rezepte gibt es?" from the very page
 * that lists them. For components whose content IS a generated manifest, we
 * can do better: expand them to flat prose before stripping. One entry per
 * component; an unknown component still strips to nothing, as before.
 *
 * Deliberately compact — command/mention + title, no descriptions. The full
 * rows tripled some section lengths, which shifted the BM25 corpus statistics
 * enough to flip borderline rankings on unrelated pages (docsIndex.vitest.ts
 * caught one). The identifiers and titles are the terms people search for; the
 * descriptions live on the page, not in the index.
 */
const COMPONENT_EXPANSIONS = {
  RecipeTables: (m) => m.skills.map((s) => `${s.command} ${s.title}`).join('\n'),
  SourceTable: (m) => m.notebookSources.map((s) => `${s.mention} ${s.title}`).join('\n'),
  ToolMentionTable: (m) =>
    Object.values(m.mentionables)
      .filter((t) => t.mention)
      .map((t) => `${t.mention} ${t.title}`)
      .join('\n'),
  SharepicVariantTable: (m) =>
    m.sharepicVariants.map((v) => `${v.type}: ${v.keywords.join(', ')}`).join('\n'),
};

function expandGeneratedComponents(body) {
  const manifest = loadChatCapabilities();
  if (!manifest) return body;
  return body.replace(/<(\w+)\s*\/>/g, (match, name) => {
    const expand = COMPONENT_EXPANSIONS[name];
    return expand ? `\n${expand(manifest)}\n` : match;
  });
}

/**
 * Strip markdown/MDX syntax down to readable prose (for leads, snippets, BM25).
 *
 * Order matters. Fenced code and JSX go first (they can contain anything). The
 * emphasis strip skips BACKSLASH-ESCAPED markers via a lookbehind, because the
 * corpus writes `Agent\*innen` to stop Docusaurus reading the `*` as emphasis —
 * that asterisk is real text and must survive. The unescape then runs last, so
 * `Agent\*innen` ends up as `Agent*innen` rather than `Agentinnen` (asterisk
 * eaten) or `Agent\innen` (stray backslash).
 */
function stripInline(md) {
  return (
    md
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, ' ')
      // Twice: MDX expressions nest one level in the newsletter mail-merge
      // placeholders (`{{ name }}`), and one pass leaves the outer braces.
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/\{[^{}]*\}/g, ' ')
      .replace(/(?<!\\)[*_~]/g, '')
      .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Heading/title text. Deliberately inline-only: {@link stripMarkdown}'s
 * block-level rules include an ordered-list stripper (`^\d+\. `), which eats
 * the numeric prefix of headings like `## 1. Texterstellung` — and Docusaurus
 * KEEPS that number in the anchor (`#1-texterstellung-…`), so stripping it
 * here produced a page full of dead deep links.
 */
function stripHeading(md) {
  return stripInline(md);
}

function stripMarkdown(md) {
  const withoutBlocks = md
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n/)
    .filter((line) => !MDX_ESM_RE.test(line))
    .join('\n')
    .replace(/^\s*:::.*$/gm, '')
    .replace(/^\s*[>|]\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '');
  return stripInline(withoutBlocks);
}

/**
 * The page-map summary: the first real prose paragraph. Prefers a substantial
 * one (≥40 chars) but falls back to a shorter one — several newsletter pages
 * open with just "Newsletter März 2025", which is a weak summary but still
 * better than none.
 */
function firstParagraph(body) {
  const candidates = [];
  for (const block of body.split(/\r?\n\s*\r?\n/)) {
    if (MDX_ESM_RE.test(block)) continue;
    const text = stripMarkdown(block);
    if (!text || text.startsWith('#')) continue;
    if (text.length >= 40) return truncateLead(text);
    if (text.length >= 12) candidates.push(text);
  }
  return candidates.length > 0 ? truncateLead(candidates[0]) : '';
}

/** Cap at the last word boundary before the limit — never mid-word. */
function truncateSection(text) {
  if (text.length <= SECTION_MAX_CHARS) return text;
  const cut = text.lastIndexOf(' ', SECTION_MAX_CHARS - 1);
  return `${text.slice(0, cut > 0 ? cut : SECTION_MAX_CHARS - 1).trimEnd()}…`;
}

function truncateLead(text) {
  return text.length > LEAD_MAX_CHARS ? `${text.slice(0, LEAD_MAX_CHARS - 1).trimEnd()}…` : text;
}

/** Split a page body into its intro + one record per H2/H3. */
function splitSections(body, pageTitle) {
  const sections = [{ heading: pageTitle, anchor: '', lines: [] }];
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const text = stripHeading(heading[2]);
      sections.push({ heading: text, anchor: `#${slugifyHeading(text)}`, lines: [] });
      continue;
    }
    if (!inFence && /^#\s+/.test(line)) continue;
    sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function build() {
  const pages = [];
  const sections = [];

  for (const rel of walk(DOCS_DIR)) {
    const raw = readFileSync(path.join(DOCS_DIR, rel), 'utf8');
    const { data, body: rawBody } = parseFrontmatter(raw);
    const body = expandGeneratedComponents(rawBody);
    const h1 = /^#\s+(.+?)\s*$/m.exec(body);
    const title = data.title || (h1 ? stripHeading(h1[1]) : path.basename(rel, path.extname(rel)));
    const topFolder = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '';
    const category = CATEGORY_LABELS[topFolder] ?? 'Allgemein';
    const url = toUrl(rel);

    pages.push({ url, title, category, lead: firstParagraph(body) });

    for (const section of splitSections(body, title)) {
      const text = stripMarkdown(section.lines.join('\n'));
      if (text.length < 40) continue;
      sections.push({
        url,
        pageTitle: title,
        heading: section.heading,
        anchor: section.anchor,
        category,
        text: truncateSection(text),
      });
    }
  }

  pages.sort((a, b) => a.url.localeCompare(b.url));
  sections.sort((a, b) => a.url.localeCompare(b.url) || a.anchor.localeCompare(b.anchor));

  return {
    siteUrl: 'https://doku.gruenerator.eu',
    generatedFrom: 'documentation/docs (pnpm docs:index)',
    pages,
    sections,
  };
}

/**
 * Guards the two URL assumptions in `toUrl` that a future doc file could break:
 * a `slug:`/`id:` frontmatter override (which would move the page), and a
 * non-date number prefix (which Docusaurus WOULD strip, unlike the newsletter
 * dates). Either one silently produces 404 citation links, so fail loudly.
 */
function assertUrlsResolve() {
  const problems = [];
  for (const rel of walk(DOCS_DIR)) {
    const { data } = parseFrontmatter(readFileSync(path.join(DOCS_DIR, rel), 'utf8'));
    if (data.slug || data.id) {
      problems.push(`${rel}: frontmatter slug/id override — toUrl() does not honour it`);
    }
    const base = path.basename(rel);
    if (/^\d+[-_.]/.test(base) && !/^\d{4}-/.test(base)) {
      problems.push(`${rel}: number prefix Docusaurus strips but toUrl() keeps`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Docs URL derivation is out of date:\n  ${problems.join('\n  ')}`);
  }
}

function emit(index) {
  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: ${index.generatedFrom}
 * Regenerate: pnpm docs:index
 *
 * The chat's searchable view of the user documentation. \`pages\` backs the
 * page map injected into the system prompt; \`sections\` is the BM25 corpus
 * behind the \`gruenerator_docs_search\` tool. See ./docsIndex.ts.
 */

export interface DocPage {
  /** Site-relative URL path, e.g. \`/docs/chat/ki-chat\`. */
  url: string;
  title: string;
  category: string;
  /** First paragraph after the H1 — the page-map summary. */
  lead: string;
}

export interface DocSection {
  url: string;
  /** Page title, for citation labels ("KI-Chat · Modelle wechseln"). */
  pageTitle: string;
  /** Heading text; equals \`pageTitle\` for the page-intro section. */
  heading: string;
  /** \`#slug\` anchor, or '' for the page-intro section. */
  anchor: string;
  category: string;
  text: string;
}

/** Absolute base prepended to every \`url\` when a citation link is built. */
export const DOCS_SITE_URL = ${JSON.stringify(index.siteUrl)};

export const DOCS_PAGES: readonly DocPage[] = ${JSON.stringify(index.pages, null, 2)};

export const DOCS_SECTIONS: readonly DocSection[] = ${JSON.stringify(index.sections, null, 2)};
`;
}

assertUrlsResolve();
const index = build();
const output = emit(index);
const mapChars = index.pages.reduce((n, p) => n + p.title.length + p.url.length + p.lead.length, 0);
const summary =
  `${index.pages.length} pages, ${index.sections.length} sections ` +
  `(page map ≈ ${Math.round(mapChars / 3.5)} tokens)`;

// `--check` is the CI mode: the generated module is committed, so a docs edit
// without a regenerate would silently ship a stale index — the chat would cite
// pages that no longer exist and miss ones that do.
if (process.argv.includes('--check')) {
  const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;
  if (current !== output) {
    console.error(
      `✗ ${path.relative(REPO_ROOT, OUT_FILE)} is out of date.\n` +
        `  documentation/docs changed without regenerating the chat index.\n` +
        `  Run: pnpm docs:index`
    );
    process.exit(1);
  }
  console.log(`✓ docs index up to date — ${summary}`);
} else {
  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, output, 'utf8');
  console.log(`docs index: ${summary} → ${path.relative(REPO_ROOT, OUT_FILE)}`);
}
