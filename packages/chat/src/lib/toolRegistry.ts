// Single platform-neutral registry: tool name → metadata + view kind + parser.
//
// Web (GrueneratorToolUIs / ToolCallUI) and mobile (MessageBubble) both
// dispatch through this registry, so the set of chat tools lives in exactly
// one place — `toolRegistry.vitest.ts` enforces that every tool name the SSE
// mappings can produce has an entry. Platforms only map ToolViewKind →
// component. Metro-safe: zod + toolResults/toolViewModels only.

import { z } from 'zod';

import {
  getArray,
  getObject,
  getString,
  getToolMeta,
  faviconFromHostname,
  parseExamples,
  parsePersonResult,
  parsePressemitteilungExamples,
  parseResearchResult,
  parseScrapeResult,
  parseSearchCitations,
  parseWebCitations,
  toSerializableCitation,
  type ToolMeta,
} from './toolResults';

import type { SerializableCitation } from '../components/tool-ui/citation/schema';
import type { KeyValueEntry, ToolResultVM, ToolViewKind } from './toolViewModels';

export const UI_TOOL_NAMES = z.enum([
  'gruenerator_search',
  'search_sources',
  'search_user_content',
  'web_search',
  'research',
  'gruenerator_examples_search',
  'gruenerator_pressemitteilung_examples',
  'gruenerator_person_search',
  'scrape_url',
  'generate_image',
  'recall_memory',
  'save_memory',
  'ask_human',
]);
export type UiToolName = z.infer<typeof UI_TOOL_NAMES>;

export interface ToolRegistryEntry {
  meta: ToolMeta;
  kind: ToolViewKind;
  /** Tolerant — never throws; degrades to text-note/key-value on unexpected shapes. */
  parse: (args: unknown, result: unknown) => ToolResultVM;
}

// ---------------------------------------------------------------------------
// Generic fallback: renders ANY tool result legibly (replaces web's raw JSON
// dump and mobile's bare pill for unregistered tools).
// ---------------------------------------------------------------------------

const MARKDOWNISH_KEYS = ['answer', 'markdown', 'content', 'text', 'summary'];
const LIFTED_KEYS = new Set([...MARKDOWNISH_KEYS, 'results', 'citations', 'image', 'imageUrl']);

function liftCitations(result: unknown): SerializableCitation[] {
  const items =
    getArray(result, 'results') ??
    getArray(result, 'citations') ??
    (Array.isArray(result) ? result : null);
  if (!items) return [];
  return items
    .filter((item) => getString(item, 'url'))
    .slice(0, 5)
    .map((item, i) => toSerializableCitation(item, i, 'webpage'));
}

function liftMarkdown(result: unknown): string | null {
  for (const key of MARKDOWNISH_KEYS) {
    const val = getString(result, key);
    if (val && val.length > 120) return val;
  }
  return null;
}

function liftImageUrl(result: unknown): string | null {
  return getString(getObject(result, 'image'), 'url') ?? getString(result, 'imageUrl');
}

export function parseGenericFallback(_args: unknown, result: unknown): ToolResultVM {
  if (result == null) return { kind: 'text-note', text: '' };
  if (typeof result === 'string') return { kind: 'text-note', text: result };

  const citations = liftCitations(result);
  const markdown = liftMarkdown(result);
  const imageUrl = liftImageUrl(result);

  const entries: KeyValueEntry[] = [];
  if (typeof result === 'object' && !Array.isArray(result)) {
    for (const [key, val] of Object.entries(result as Record<string, unknown>)) {
      if (entries.length >= 8) break;
      if (LIFTED_KEYS.has(key)) continue;
      if (typeof val === 'string' && val && val.length <= 120) {
        entries.push({ label: key, value: val });
      } else if (typeof val === 'number' || typeof val === 'boolean') {
        entries.push({ label: key, value: String(val) });
      }
    }
  }

  // A pure text payload reads better as a note than as a one-row table.
  if (!entries.length && !citations.length && !imageUrl && markdown) {
    return { kind: 'text-note', text: markdown };
  }
  return { kind: 'key-value', entries, citations, markdown, imageUrl };
}

// ---------------------------------------------------------------------------
// Per-tool parsers (thin VM wrappers over the tolerant toolResults accessors).
// ---------------------------------------------------------------------------

function parseImageVM(args: unknown, result: unknown): ToolResultVM {
  const image = getObject(result, 'image');
  const url = getString(image, 'url') ?? getString(result, 'url') ?? getString(result, 'imageUrl');
  if (!url) return parseGenericFallback(args, result);
  const prompt = getString(args, 'prompt') ?? getString(image, 'prompt');
  return { kind: 'image', url, prompt, alt: prompt };
}

function parseTextNoteVM(args: unknown, result: unknown): ToolResultVM {
  const text =
    typeof result === 'string'
      ? result
      : (getString(result, 'summary') ??
        getString(result, 'memory') ??
        getString(result, 'message'));
  if (!text) return parseGenericFallback(args, result);
  return { kind: 'text-note', text };
}

function parseLinkPreviewVM(args: unknown, result: unknown): ToolResultVM {
  const page = parseScrapeResult(args, result);
  if (!page) return parseGenericFallback(args, result);
  return {
    kind: 'link-preview',
    href: page.url,
    title: page.domain ?? page.url,
    description: page.snippet || null,
    domain: page.domain,
    favicon: page.domain ? faviconFromHostname(page.domain) : null,
  };
}

function entry(name: UiToolName, kind: ToolViewKind, parse: ToolRegistryEntry['parse']) {
  return { meta: getToolMeta(name), kind, parse };
}

export const TOOL_REGISTRY: Record<UiToolName, ToolRegistryEntry> = {
  gruenerator_search: entry('gruenerator_search', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  search_sources: entry('search_sources', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  search_user_content: entry('search_user_content', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseSearchCitations(r),
  })),
  web_search: entry('web_search', 'citations', (_a, r) => ({
    kind: 'citations',
    citations: parseWebCitations(r),
  })),
  research: entry('research', 'markdown-report', (_a, r) => ({
    kind: 'markdown-report',
    ...parseResearchResult(r),
  })),
  gruenerator_examples_search: entry('gruenerator_examples_search', 'snippets', (_a, r) => ({
    kind: 'snippets',
    items: parseExamples(r),
  })),
  gruenerator_pressemitteilung_examples: entry(
    'gruenerator_pressemitteilung_examples',
    'press-examples',
    (_a, r) => ({ kind: 'press-examples', ...parsePressemitteilungExamples(r) })
  ),
  gruenerator_person_search: entry('gruenerator_person_search', 'person', (_a, r) => ({
    kind: 'person',
    ...parsePersonResult(r),
  })),
  scrape_url: entry('scrape_url', 'link-preview', parseLinkPreviewVM),
  generate_image: entry('generate_image', 'image', parseImageVM),
  recall_memory: entry('recall_memory', 'text-note', parseTextNoteVM),
  save_memory: entry('save_memory', 'text-note', parseTextNoteVM),
  ask_human: entry('ask_human', 'interactive', () => ({ kind: 'interactive' })),
};

/** Lookup that degrades gracefully for unregistered tool names. */
export function resolveToolEntry(toolName: string): ToolRegistryEntry {
  const known = UI_TOOL_NAMES.safeParse(toolName);
  if (known.success) return TOOL_REGISTRY[known.data];
  return { meta: getToolMeta(toolName), kind: 'key-value', parse: parseGenericFallback };
}
