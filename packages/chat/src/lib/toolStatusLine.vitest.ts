import { describe, it, expect } from 'vitest';

import {
  isSearchProgressTool,
  searchStatusLabel,
  selectHasVisibleToolCard,
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
