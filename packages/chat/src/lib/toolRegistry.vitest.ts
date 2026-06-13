import { describe, expect, it } from 'vitest';

import { INTENT_TO_TOOL, DEEP_TOOL_MAP } from './toolMappings';
import {
  parseGenericFallback,
  resolveToolEntry,
  TOOL_REGISTRY,
  UI_TOOL_NAMES,
} from './toolRegistry';

// ---------------------------------------------------------------------------
// Drift guard: every tool name the SSE mappings can produce must have a
// registry entry. This is what keeps the tool list in ONE place — adding a
// tool to the mappings without a registry entry fails CI.
// ---------------------------------------------------------------------------

describe('tool registry drift guard', () => {
  it('covers every INTENT_TO_TOOL value', () => {
    for (const toolName of Object.values(INTENT_TO_TOOL)) {
      expect(UI_TOOL_NAMES.options, `missing registry entry for ${toolName}`).toContain(toolName);
    }
  });

  it('covers every DEEP_TOOL_MAP value', () => {
    for (const toolName of Object.values(DEEP_TOOL_MAP)) {
      expect(UI_TOOL_NAMES.options, `missing registry entry for ${toolName}`).toContain(toolName);
    }
  });

  it('every registry entry has a label and matching kind', () => {
    for (const name of UI_TOOL_NAMES.options) {
      const entry = TOOL_REGISTRY[name];
      expect(entry.meta.label.length).toBeGreaterThan(0);
      expect(resolveToolEntry(name)).toBe(entry);
    }
  });
});

// ---------------------------------------------------------------------------
// Parse fixtures — shapes lifted from the live SSE payloads
// (intentExecutionService / sseHelpers ThinkingStepPayload).
// ---------------------------------------------------------------------------

describe('per-tool parsers', () => {
  it('search tools → citations', () => {
    const result = {
      results: [
        { title: 'Wahlprogramm', url: 'https://gruene.de/programm', snippet: 'Auszug …' },
        { title: 'Beschluss', url: 'https://gruene.de/beschluss', content: 'Text …' },
      ],
    };
    for (const name of ['gruenerator_search', 'search_sources', 'search_user_content'] as const) {
      const vm = TOOL_REGISTRY[name].parse({}, result);
      expect(vm.kind).toBe('citations');
      if (vm.kind === 'citations') {
        expect(vm.citations).toHaveLength(2);
        expect(vm.citations[0].href).toBe('https://gruene.de/programm');
      }
    }
  });

  it('web_search → citations', () => {
    const vm = TOOL_REGISTRY.web_search.parse(
      { query: 'klimageld' },
      { results: [{ title: 'Artikel', url: 'https://example.org/a', snippet: 's' }] }
    );
    expect(vm.kind).toBe('citations');
    if (vm.kind === 'citations') expect(vm.citations[0].type).toBe('webpage');
  });

  it('research → markdown report with citations, confidence, follow-ups', () => {
    const vm = TOOL_REGISTRY.research.parse(
      { query: 'Wärmepumpen-Förderung' },
      {
        answer: '## Lage\nDie Förderung …',
        citations: [
          { id: 1, title: 'BMWK', url: 'https://bmwk.de/x', domain: 'bmwk.de', snippet: 's' },
        ],
        confidence: 'high',
        followUpQuestions: ['Wie hoch ist die Förderung 2026?'],
        searchSteps: [{ tool: 'web_search', query: 'förderung wärmepumpe', resultsCount: 8 }],
      }
    );
    expect(vm.kind).toBe('markdown-report');
    if (vm.kind === 'markdown-report') {
      expect(vm.answer).toContain('## Lage');
      expect(vm.citations[0].domain).toBe('bmwk.de');
      expect(vm.confidence).toBe('high');
      expect(vm.followUpQuestions).toHaveLength(1);
      expect(vm.stepsList[0].resultsCount).toBe(8);
    }
  });

  it('examples → snippets', () => {
    const vm = TOOL_REGISTRY.gruenerator_examples_search.parse(
      {},
      { examples: [{ platform: 'instagram', content: 'Post-Text' }] }
    );
    expect(vm.kind).toBe('snippets');
    if (vm.kind === 'snippets') expect(vm.items[0].platform).toBe('instagram');
  });

  it('pressemitteilung examples → press-examples', () => {
    const vm = TOOL_REGISTRY.gruenerator_pressemitteilung_examples.parse(
      {},
      {
        examples: [
          {
            id: 'pm-1',
            title: 'PM Titel',
            body: 'Text',
            lv: 'BY',
            publishedAt: '2026-05-01T10:00:00Z',
            url: 'https://gruene-bayern.de/pm',
          },
        ],
      }
    );
    expect(vm.kind).toBe('press-examples');
    if (vm.kind === 'press-examples') expect(vm.examples[0].lv).toBe('BY');
  });

  it('person search → person', () => {
    const vm = TOOL_REGISTRY.gruenerator_person_search.parse(
      { query: 'Lang' },
      {
        isPersonQuery: true,
        person: { name: 'Ricarda Lang', fraktion: 'Grüne', wahlkreis: 'Backnang' },
      }
    );
    expect(vm.kind).toBe('person');
    if (vm.kind === 'person') {
      expect(vm.found).toBe(true);
      expect(vm.name).toBe('Ricarda Lang');
    }
  });

  it('scrape_url → link preview', () => {
    const vm = TOOL_REGISTRY.scrape_url.parse(
      { url: 'https://taz.de/artikel' },
      'Langer Seiteninhalt …'
    );
    expect(vm.kind).toBe('link-preview');
    if (vm.kind === 'link-preview') {
      expect(vm.href).toBe('https://taz.de/artikel');
      expect(vm.domain).toBe('taz.de');
    }
  });

  it('generate_image → image (ThinkingStepPayload result.image shape)', () => {
    const vm = TOOL_REGISTRY.generate_image.parse(
      { prompt: 'Solarpark Sonnenaufgang' },
      { image: { url: 'https://cdn.gruenerator.eu/img/1.png' } }
    );
    expect(vm.kind).toBe('image');
    if (vm.kind === 'image') {
      expect(vm.url).toBe('https://cdn.gruenerator.eu/img/1.png');
      expect(vm.prompt).toBe('Solarpark Sonnenaufgang');
    }
  });

  it('memory tools → text note', () => {
    expect(TOOL_REGISTRY.recall_memory.parse({}, 'Nutzer mag kurze Antworten')).toEqual({
      kind: 'text-note',
      text: 'Nutzer mag kurze Antworten',
    });
    const vm = TOOL_REGISTRY.save_memory.parse({}, { summary: 'Gespeichert.' });
    expect(vm).toEqual({ kind: 'text-note', text: 'Gespeichert.' });
  });

  it('ask_human → interactive (platforms render their own component)', () => {
    expect(TOOL_REGISTRY.ask_human.parse({ question: '?' }, undefined)).toEqual({
      kind: 'interactive',
    });
  });
});

// ---------------------------------------------------------------------------
// Generic fallback — unknown/future tools must degrade legibly, never throw.
// ---------------------------------------------------------------------------

describe('parseGenericFallback', () => {
  it('string result → text note', () => {
    expect(parseGenericFallback({}, 'fertig')).toEqual({ kind: 'text-note', text: 'fertig' });
  });

  it('object with results → lifts citations and scalar entries', () => {
    const vm = parseGenericFallback(
      {},
      {
        status: 'ok',
        resultCount: 3,
        results: [{ title: 'A', url: 'https://a.de' }, { note: 'no url, skipped' }],
      }
    );
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') {
      expect(vm.citations).toHaveLength(1);
      expect(vm.entries).toContainEqual({ label: 'status', value: 'ok' });
      expect(vm.entries).toContainEqual({ label: 'resultCount', value: '3' });
    }
  });

  it('object with image → lifts image url', () => {
    const vm = parseGenericFallback({}, { image: { url: 'https://img.de/x.png' }, seed: 42 });
    expect(vm.kind).toBe('key-value');
    if (vm.kind === 'key-value') expect(vm.imageUrl).toBe('https://img.de/x.png');
  });

  it('long content-only object → markdown text note', () => {
    const vm = parseGenericFallback({}, { content: 'x'.repeat(200) });
    expect(vm.kind).toBe('text-note');
  });

  it('unknown tool name resolves to the fallback entry', () => {
    const entry = resolveToolEntry('future_tool');
    expect(entry.kind).toBe('key-value');
    expect(entry.parse({}, { error: 'nope', status: 'failed' }).kind).toBe('key-value');
  });
});
