import { describe, it, expect } from 'vitest';

import {
  isSearchProgressTool,
  searchStatusLabel,
  selectHasVisibleToolCard,
  selectReasoningText,
  selectSearchSources,
  selectSearchStatusLabel,
  visibleToolNames,
  type StatusPartLike,
} from './toolStatusLine';

describe('isSearchProgressTool', () => {
  it('flags the retrieval tools whose hits reappear in the Quellen-Liste', () => {
    for (const name of [
      'web_search',
      'gruenerator_search',
      'gruenerator_docs_search',
      'search_sources',
      'bundestag',
    ]) {
      expect(isSearchProgressTool(name)).toBe(true);
    }
  });

  it('keeps the tools whose card IS the result', () => {
    for (const name of [
      'research',
      'scrape_url',
      'generate_image',
      'run_python',
      'documents',
      'notebooks',
      'search_chat_history',
      'search_user_content',
      'mcp_tool',
      's0__search',
    ]) {
      expect(isSearchProgressTool(name)).toBe(false);
    }
  });
});

describe('searchStatusLabel', () => {
  it('echoes the query behind the tool label', () => {
    expect(searchStatusLabel('web_search', 'Wer war Marilyn Monroe?')).toBe(
      'Websuche „Wer war Marilyn Monroe?“'
    );
  });

  it('falls back to the bare label without a query', () => {
    expect(searchStatusLabel('web_search', null)).toBe('Websuche');
    expect(searchStatusLabel('web_search', '   ')).toBe('Websuche');
  });

  it('drops a query that is only the card title echoed back', () => {
    expect(searchStatusLabel('web_search', 'Websuche…')).toBe('Websuche');
  });

  it('elides a long query', () => {
    const label = searchStatusLabel('web_search', 'x'.repeat(120));
    expect(label).toBe(`Websuche „${'x'.repeat(60)}…“`);
  });

  it('strips a run of trailing ellipses without backtracking on it', () => {
    expect(searchStatusLabel('web_search', 'Klimageld………')).toBe('Websuche „Klimageld“');

    // The shape that made `/…+$/` quadratic: a long run of ellipses that does
    // NOT end the string, so the end anchor fails and the engine retries the
    // whole run from every start position. The deadline IS the assertion; the
    // label is elided to 60 chars either way and says nothing about the cost.
    // Sized so the deadline actually discriminates: measured on this input the
    // loop takes 0.05 ms and `/…+$/` takes ~6.8 s. At 20k the regex was 274 ms
    // and would have passed a 1 s deadline — the test would have proved nothing.
    const adversarial = `${'…'.repeat(100_000)}x`;
    const started = performance.now();
    const label = searchStatusLabel('web_search', adversarial);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(label.length).toBeLessThan(100);
  });
});

describe('selectSearchStatusLabel', () => {
  const running: StatusPartLike = {
    type: 'tool-call',
    toolCallId: 't1',
    toolName: 'web_search',
    args: { query: 'Klimageld' },
  };

  it('names the running retrieval step', () => {
    expect(selectSearchStatusLabel([running])).toBe('Websuche „Klimageld“');
  });

  it('returns null once the step has a result', () => {
    expect(selectSearchStatusLabel([{ ...running, result: { results: [] } }])).toBeNull();
  });

  it('reads the newest step, not the first', () => {
    expect(
      selectSearchStatusLabel([
        { ...running, result: { results: [] } },
        { ...running, toolCallId: 't2', toolName: 'bundestag', args: { query: 'Heizung' } },
      ])
    ).toBe('Bundestag (DIP) „Heizung“');
  });

  it('ignores tools that keep their own card', () => {
    expect(
      selectSearchStatusLabel([
        { type: 'tool-call', toolCallId: 't1', toolName: 'generate_image', args: {} },
      ])
    ).toBeNull();
  });

  it('is null for a message without tool calls', () => {
    expect(selectSearchStatusLabel([{ type: 'text', text: 'Hallo' }])).toBeNull();
  });
});

describe('selectHasVisibleToolCard', () => {
  it('is false for a search-only turn', () => {
    expect(
      selectHasVisibleToolCard([
        { type: 'tool-call', toolCallId: 't1', toolName: 'web_search' },
        { type: 'text', text: '' },
      ])
    ).toBe(false);
  });

  it('is true as soon as one tool still draws a card', () => {
    expect(
      selectHasVisibleToolCard([
        { type: 'tool-call', toolCallId: 't1', toolName: 'web_search' },
        { type: 'tool-call', toolCallId: 't2', toolName: 'generate_image' },
      ])
    ).toBe(true);
  });
});

describe('visibleToolNames', () => {
  it('drops the search steps from the group chrome', () => {
    expect(visibleToolNames(['web_search', 'gruenerator_search', 'generate_image'])).toEqual([
      'generate_image',
    ]);
  });

  it('can empty the run entirely', () => {
    expect(visibleToolNames(['web_search', 'web_search'])).toEqual([]);
  });
});

describe('selectReasoningText', () => {
  it('joins every reasoning part in order', () => {
    expect(
      selectReasoningText([
        { type: 'reasoning', text: 'Erst ' },
        { type: 'text', text: 'Antwort' },
        { type: 'reasoning', text: 'dann.' },
      ])
    ).toBe('Erst dann.');
  });

  it('is null without reasoning, and for whitespace-only thinking', () => {
    expect(selectReasoningText([{ type: 'text', text: 'Antwort' }])).toBeNull();
    expect(selectReasoningText([{ type: 'reasoning', text: '  \n ' }])).toBeNull();
  });

  it('ignores a non-string text field', () => {
    expect(selectReasoningText([{ type: 'reasoning', text: 42 }])).toBeNull();
  });
});

describe('selectSearchSources', () => {
  const hit = (url: string, title: string) => ({ url, title, snippet: 's' });

  it('collects the hits of finished retrieval steps', () => {
    const sources = selectSearchSources([
      {
        type: 'tool-call',
        toolCallId: 't1',
        toolName: 'web_search',
        args: { query: 'a' },
        result: { results: [hit('https://a.de/1', 'A')] },
      },
    ]);
    expect(sources.map((s) => s.href)).toEqual(['https://a.de/1']);
    expect(sources[0].title).toBe('A');
  });

  it('skips a step that has not returned yet', () => {
    expect(
      selectSearchSources([
        { type: 'tool-call', toolCallId: 't1', toolName: 'web_search', args: { query: 'a' } },
      ])
    ).toEqual([]);
  });

  it('skips tools that keep their own card', () => {
    expect(
      selectSearchSources([
        {
          type: 'tool-call',
          toolCallId: 't1',
          toolName: 'scrape_url',
          args: {},
          result: { results: [hit('https://a.de/1', 'A')] },
        },
      ])
    ).toEqual([]);
  });

  it('dedupes the same URL across two steps', () => {
    const sources = selectSearchSources([
      {
        type: 'tool-call',
        toolCallId: 't1',
        toolName: 'web_search',
        args: {},
        result: { results: [hit('https://a.de/1', 'A')] },
      },
      {
        type: 'tool-call',
        toolCallId: 't2',
        toolName: 'gruenerator_search',
        args: {},
        result: { results: [hit('https://a.de/1', 'A nochmal'), hit('https://b.de/2', 'B')] },
      },
    ]);
    expect(sources.map((s) => s.href)).toEqual(['https://a.de/1', 'https://b.de/2']);
  });

  it('caps the panel at 8 sources', () => {
    // Each tool parser itself takes only the first 5 hits, so the cap needs
    // several steps to bite — exactly the agentic-loop shape it exists for.
    const step = (n: number): StatusPartLike => ({
      type: 'tool-call',
      toolCallId: `t${n}`,
      toolName: 'web_search',
      args: {},
      result: {
        results: Array.from({ length: 5 }, (_, i) => hit(`https://s${n}.de/${i}`, `S${n}-${i}`)),
      },
    });
    expect(selectSearchSources([step(1), step(2), step(3)])).toHaveLength(8);
  });
});
