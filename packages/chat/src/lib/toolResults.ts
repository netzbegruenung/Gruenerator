// Platform-agnostic parsing & metadata for assistant-ui tool calls.
//
// This module is the shared seam between the web tool UI (lucide + Radix +
// ReactMarkdown) and the mobile tool UI (Ionicons + react-native-markdown).
// It holds ZERO react/DOM imports so it can be exported from `index.native.ts`
// and consumed by Metro. Each platform keeps only its presentation: web maps
// `iconKey` → lucide components, mobile maps `iconKey` → Ionicons names; both
// feed off the same labels, accessors, citation builders, and research parser.

import { type SerializableCitation } from '../components/tool-ui/citation/schema';

import { extractDomain, faviconFromHostname, getHostname } from './urlUtils';

import type {
  ExampleSnippet,
  MarkdownReportVM,
  PersonVM,
  PressemitteilungExample,
  PressExamplesVM,
  ResearchCitation,
  ResearchSearchStep,
} from './toolViewModels';

// Parser output types are derived from the Zod view-model schemas in
// toolViewModels.ts (single type source) and re-exported here for
// backward compatibility.
export type {
  ExampleSnippet,
  PressemitteilungExample,
  ResearchCitation,
  ResearchSearchStep,
} from './toolViewModels';
export type ParsedResearchResult = Omit<MarkdownReportVM, 'kind'>;
export type ParsedPersonResult = Omit<PersonVM, 'kind'>;
export type ParsedPressemitteilungExamples = Omit<PressExamplesVM, 'kind'>;

// ---------------------------------------------------------------------------
// Safe accessors for `unknown` tool args/results (was duplicated inline in
// ToolCallUI.tsx and ResearchArtifactCard.tsx).
// ---------------------------------------------------------------------------

export function getString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : null;
  }
  return null;
}

export function getArray(obj: unknown, key: string): unknown[] | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return Array.isArray(val) ? val : null;
  }
  return null;
}

export function getObject(obj: unknown, key: string): Record<string, unknown> | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return val && typeof val === 'object' && !Array.isArray(val)
      ? (val as Record<string, unknown>)
      : null;
  }
  return null;
}

export function getNumber(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'number' ? val : null;
  }
  return null;
}

export function getBoolean(obj: unknown, key: string): boolean {
  if (obj && typeof obj === 'object' && key in obj) {
    return !!(obj as Record<string, unknown>)[key];
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tool metadata: label + a platform-neutral icon key. Web resolves the key to
// a lucide component, mobile to an Ionicons name.
// ---------------------------------------------------------------------------

export type ToolIconKey =
  | 'search'
  | 'globe'
  | 'book'
  | 'sparkles'
  | 'user'
  | 'image'
  | 'external-link'
  | 'message-circle'
  | 'file';

export interface ToolMeta {
  label: string;
  iconKey: ToolIconKey;
}

const TOOL_METADATA: Record<string, ToolMeta> = {
  search_sources: { label: 'Quellen', iconKey: 'search' },
  gruenerator_search: { label: 'Dokumente', iconKey: 'search' },
  gruenerator_person_search: { label: 'Person', iconKey: 'user' },
  gruenerator_examples_search: { label: 'Beispiele', iconKey: 'image' },
  web_search: { label: 'Websuche', iconKey: 'globe' },
  research: { label: 'Deep Research', iconKey: 'book' },
  generate_image: { label: 'Bild', iconKey: 'sparkles' },
  scrape_url: { label: 'URL', iconKey: 'external-link' },
  recall_memory: { label: 'Erinnerung', iconKey: 'message-circle' },
  save_memory: { label: 'Speichern', iconKey: 'message-circle' },
  search_chat_history: { label: 'Vergangene Gespräche', iconKey: 'message-circle' },
  search_user_content: { label: 'Inhalte', iconKey: 'search' },
  gruenerator_pressemitteilung_examples: { label: 'Pressemitteilungen', iconKey: 'file' },
  ask_human: { label: 'Rückfrage', iconKey: 'message-circle' },
  run_python: { label: 'Tabellen-Berechnung', iconKey: 'sparkles' },
  sharepic_edit: { label: 'Sharepic', iconKey: 'image' },
  reel_edit: { label: 'Reel', iconKey: 'image' },
};

export function getToolMeta(toolName: string): ToolMeta {
  return TOOL_METADATA[toolName] ?? { label: toolName, iconKey: 'search' };
}

/** The user-facing query/question a tool was invoked with, if any. */
export function getToolQuery(args: unknown): string | null {
  return getString(args, 'query') ?? getString(args, 'question');
}

// ---------------------------------------------------------------------------
// Citation builders → SerializableCitation (the JSON-safe citation shape both
// the web CitationList and a mobile citation list can render).
// ---------------------------------------------------------------------------

/** Map an arbitrary search/web result item to a SerializableCitation. */
export function toSerializableCitation(
  item: unknown,
  index: number,
  typeHint: 'document' | 'webpage' = 'webpage'
): SerializableCitation {
  const url = getString(item, 'url') || '';
  const domain = getString(item, 'domain') || extractDomain(url) || undefined;
  return {
    id: `tc-citation-${index}`,
    href: url,
    title: getString(item, 'title') || getString(item, 'source') || 'Quelle',
    snippet:
      getString(item, 'snippet') ||
      getString(item, 'content') ||
      getString(item, 'excerpt') ||
      undefined,
    domain,
    favicon: domain ? faviconFromHostname(domain) : undefined,
    type: typeHint,
  };
}

/** Document-search / source-search results → citations (first 5). */
export function parseSearchCitations(result: unknown): SerializableCitation[] {
  const items = getArray(result, 'results') || (Array.isArray(result) ? result : []);
  return items.slice(0, 5).map((item, i) => toSerializableCitation(item, i, 'document'));
}

/** Example-search results → citations (first 5). */
export function parseExampleCitations(result: unknown): SerializableCitation[] {
  const items =
    getArray(result, 'examples') ||
    getArray(result, 'results') ||
    (Array.isArray(result) ? result : []);
  return items.slice(0, 5).map((item, i) => toSerializableCitation(item, i, 'document'));
}

/** Web-search results → citations (first 5). */
export function parseWebCitations(result: unknown): SerializableCitation[] {
  const items = getArray(result, 'results') || [];
  return items.slice(0, 5).map((item, i) => toSerializableCitation(item, i, 'webpage'));
}

// ---------------------------------------------------------------------------
// Research result parsing & markdown helpers.
// ---------------------------------------------------------------------------

export type ResearchConfidence = 'high' | 'medium' | 'low';

/** Human-readable confidence labels (German). Colors are platform-specific. */
export const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'Hohe Konfidenz',
  medium: 'Mittlere Konfidenz',
  low: 'Niedrige Konfidenz',
};

export function parseResearchResult(result: unknown): ParsedResearchResult {
  const answer = getString(result, 'answer');
  const rawCitations = getArray(result, 'citations') ?? [];
  const citations: ResearchCitation[] = rawCitations.map((c, i) => ({
    id: getNumber(c, 'id') ?? i + 1,
    title: getString(c, 'title') ?? 'Quelle',
    url: getString(c, 'url') ?? '',
    domain: getString(c, 'domain') ?? extractDomain(getString(c, 'url')) ?? '',
    snippet: getString(c, 'snippet') ?? '',
  }));

  const followUps = getArray(result, 'followUpQuestions') ?? [];
  const followUpQuestions = followUps.filter((q): q is string => typeof q === 'string');

  const searchSteps = getArray(result, 'searchSteps') ?? [];
  const stepsList: ResearchSearchStep[] = [];
  for (const s of searchSteps) {
    const stepQuery = getString(s, 'query') ?? '';
    if (stepQuery) {
      stepsList.push({
        tool: getString(s, 'tool') ?? '',
        query: stepQuery,
        resultsCount: getNumber(s, 'resultsCount') ?? 0,
      });
    }
  }

  return {
    answer,
    citations,
    confidence: getString(result, 'confidence'),
    followUpQuestions,
    searchStepsCount: searchSteps.length,
    stepsList,
  };
}

/** A research Citation → SerializableCitation (for the citation list). */
export function researchCitationToSerializable(c: ResearchCitation): SerializableCitation {
  const domain = c.domain || extractDomain(c.url) || undefined;
  return {
    type: 'document',
    id: String(c.id),
    title: c.title,
    href: c.url,
    ...(c.snippet ? { snippet: c.snippet } : {}),
    ...(domain ? { domain } : {}),
    ...(domain ? { favicon: faviconFromHostname(domain) } : {}),
  };
}

/** First few `##` headings of a markdown answer, for a table-of-contents preview. */
export function extractHeadings(markdown: string): string[] {
  if (!markdown) return [];
  const out: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) out.push(m[1].trim());
    if (out.length >= 6) break;
  }
  return out;
}

/** First non-heading paragraph of a markdown answer, truncated for preview. */
export function extractFirstParagraph(markdown: string): string {
  if (!markdown) return '';
  const lines = markdown.split('\n');
  const buf: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buf.length > 0) break;
      continue;
    }
    if (trimmed.startsWith('#')) {
      if (buf.length > 0) break;
      continue;
    }
    buf.push(trimmed);
    if (buf.join(' ').length > 240) break;
  }
  const para = buf.join(' ');
  return para.length > 280 ? para.slice(0, 280) + '…' : para;
}

/** Build the markdown document body for "Als Dokument speichern". */
export function buildExportMarkdown(
  query: string,
  answer: string,
  citations: ResearchCitation[]
): string {
  const lines: string[] = [];
  if (query) {
    lines.push(`# Recherche: ${query}`, '');
  }
  lines.push(answer);
  if (citations.length > 0) {
    lines.push('', '## Quellen', '');
    for (const c of citations) {
      lines.push(`- [${c.id}] [${c.title}](${c.url}) — ${c.domain}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// gruenerator_person_search → a single politician profile.
// ---------------------------------------------------------------------------

export function parsePersonResult(result: unknown): ParsedPersonResult {
  const person = getObject(result, 'person');
  if (!getBoolean(result, 'isPersonQuery') || !person) {
    return { found: false, name: null, fraktion: null, wahlkreis: null };
  }
  return {
    found: true,
    name: getString(person, 'name'),
    fraktion: getString(person, 'fraktion'),
    wahlkreis: getString(person, 'wahlkreis'),
  };
}

// ---------------------------------------------------------------------------
// gruenerator_examples_search → platform-tagged content snippets (no URLs, so
// these render as snippets rather than citations).
// ---------------------------------------------------------------------------

export function parseExamples(result: unknown): ExampleSnippet[] {
  const items =
    getArray(result, 'examples') ||
    getArray(result, 'results') ||
    (Array.isArray(result) ? result : []);
  return items
    .map((item) => ({
      platform: getString(item, 'platform'),
      content: getString(item, 'content'),
    }))
    .filter((e) => e.content !== null || e.platform !== null);
}

// ---------------------------------------------------------------------------
// scrape_url → a single link-preview struct (URL + domain + text snippet).
// ---------------------------------------------------------------------------

export interface ScrapedPage {
  url: string;
  domain: string | null;
  snippet: string;
}

export function parseScrapeResult(args: unknown, result: unknown): ScrapedPage | null {
  const url = getString(args, 'url') || '';
  if (!url) return null;
  const content = typeof result === 'string' ? result : getString(result, 'content') || '';
  const snippet = content.length > 200 ? content.slice(0, 200) + '…' : content;
  return { url, domain: extractDomain(url) ?? null, snippet };
}

// ---------------------------------------------------------------------------
// gruenerator_pressemitteilung_examples → press releases grouped by Landesverband.
// ---------------------------------------------------------------------------

const PRESSEMITTEILUNG_LV_LABELS: Record<string, string> = {
  BE: 'Berlin',
  'BE-F': 'Berlin (Fraktion)',
  HH: 'Hamburg',
  TH: 'Thüringen',
  MV: 'Meck-Pomm',
  BB: 'Brandenburg',
  BY: 'Bayern',
  SH: 'Schleswig-Holstein',
};

export function pressemitteilungLvLabel(lv: string): string {
  if (!lv) return 'Landesverband';
  return PRESSEMITTEILUNG_LV_LABELS[lv] ?? lv;
}

export function parsePressemitteilungExamples(result: unknown): ParsedPressemitteilungExamples {
  const raw = getArray(result, 'examples') ?? [];
  const examples: PressemitteilungExample[] = raw.map((ex, i) => ({
    id: getString(ex, 'id') ?? `pm-${i}`,
    title: getString(ex, 'title') ?? 'Ohne Titel',
    body: getString(ex, 'body') ?? '',
    lv: getString(ex, 'lv') ?? '',
    publishedAt: getString(ex, 'publishedAt'),
    url: getString(ex, 'url'),
  }));
  return { examples, message: getString(result, 'message') };
}

/** German short date (e.g. "05. Mai 2026") from an ISO string, or null. */
export function formatGermanDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Re-export so callers needing raw URL helpers don't reach past this module.
export { extractDomain, getHostname, faviconFromHostname };
