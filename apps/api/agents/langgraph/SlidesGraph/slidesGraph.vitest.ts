import { describe, it, expect } from 'vitest';

import { normalizeAIContent, LAYOUT_MAP, LAYOUT_FIELD_SPECS } from './types.js';

// ─── normalizeAIContent ──────────────────────────────────────────────────────

describe('normalizeAIContent', () => {
  it('passes through primitives unchanged', () => {
    expect(normalizeAIContent('hello')).toBe('hello');
    expect(normalizeAIContent(42)).toBe(42);
    expect(normalizeAIContent(true)).toBe(true);
    expect(normalizeAIContent(null)).toBe(null);
  });

  it('unwraps {text: "value"} to plain string', () => {
    expect(normalizeAIContent({ text: 'Hello World' })).toBe('Hello World');
  });

  it('unwraps {type: "text", value: "..."} to plain string', () => {
    expect(normalizeAIContent({ type: 'text', value: 'My Title' })).toBe('My Title');
  });

  it('unwraps {items: [...]} to plain array', () => {
    const input = { items: [{ title: 'A' }, { title: 'B' }] };
    const result = normalizeAIContent(input);
    expect(result).toEqual([{ title: 'A' }, { title: 'B' }]);
  });

  it('unwraps {list: [...]} to plain array', () => {
    const input = { list: ['a', 'b', 'c'] };
    expect(normalizeAIContent(input)).toEqual(['a', 'b', 'c']);
  });

  it('unwraps {points: [...]} to plain array', () => {
    const input = { points: [{ title: 'X' }] };
    expect(normalizeAIContent(input)).toEqual([{ title: 'X' }]);
  });

  it('unwraps {type: "list", items: [...]} — items key takes priority', () => {
    const input = { type: 'list', items: ['a', 'b'] };
    expect(normalizeAIContent(input)).toEqual(['a', 'b']);
  });

  it('converts numeric-keyed object to array', () => {
    const input = { '0': 'first', '1': 'second', '2': 'third' };
    expect(normalizeAIContent(input)).toEqual(['first', 'second', 'third']);
  });

  it('recursively normalizes nested structures', () => {
    const input = {
      title: { text: 'My Slide' },
      description: { type: 'text', value: 'Some description' },
      bulletPoints: {
        items: [
          { title: { text: 'Point 1' }, description: { text: 'Detail 1' } },
          { title: { text: 'Point 2' }, description: { text: 'Detail 2' } },
        ],
      },
    };
    expect(normalizeAIContent(input)).toEqual({
      title: 'My Slide',
      description: 'Some description',
      bulletPoints: [
        { title: 'Point 1', description: 'Detail 1' },
        { title: 'Point 2', description: 'Detail 2' },
      ],
    });
  });

  it('preserves normal objects without unwrapping', () => {
    const input = { title: 'Hello', count: 5, nested: { a: 1, b: 2 } };
    expect(normalizeAIContent(input)).toEqual(input);
  });

  it('does not unwrap {text: "..."} when there are other keys', () => {
    const input = { text: 'Hello', other: 'World' };
    expect(normalizeAIContent(input)).toEqual({ text: 'Hello', other: 'World' });
  });

  it('normalizes arrays of wrapped items', () => {
    const input = [{ text: 'A' }, { text: 'B' }, 'C'];
    expect(normalizeAIContent(input)).toEqual(['A', 'B', 'C']);
  });

  it('handles deeply nested AI quirks', () => {
    const input = {
      tableData: {
        headers: { list: ['Col1', 'Col2'] },
        rows: { items: [{ '0': 'a', '1': 'b' }] },
      },
    };
    expect(normalizeAIContent(input)).toEqual({
      tableData: {
        headers: ['Col1', 'Col2'],
        rows: [['a', 'b']],
      },
    });
  });
});

// ─── LAYOUT_MAP ──────────────────────────────────────────────────────────────

describe('LAYOUT_MAP', () => {
  it('maps all 12 layout types', () => {
    const expectedKeys = [
      'intro',
      'basic-info',
      'bullet-points',
      'bullet-with-icons',
      'metrics',
      'quote',
      'table',
      'chart',
      'team',
      'numbered-bullets',
      'table-of-contents',
      'closing',
    ];
    for (const key of expectedKeys) {
      expect(LAYOUT_MAP[key]).toBeDefined();
      expect(LAYOUT_MAP[key]!.layout).toContain(':');
      expect(LAYOUT_MAP[key]!.layoutGroup).toBeTruthy();
    }
  });

  it('layout IDs follow group:name format', () => {
    for (const [key, value] of Object.entries(LAYOUT_MAP)) {
      const [group, name] = value.layout.split(':');
      expect(group).toBe(value.layoutGroup);
      expect(name).toBeTruthy();
    }
  });
});

// ─── LAYOUT_FIELD_SPECS ──────────────────────────────────────────────────────

describe('LAYOUT_FIELD_SPECS', () => {
  it('has a spec for every LAYOUT_MAP entry', () => {
    for (const key of Object.keys(LAYOUT_MAP)) {
      expect(LAYOUT_FIELD_SPECS[key]).toBeDefined();
      expect(LAYOUT_FIELD_SPECS[key]!.length).toBeGreaterThan(10);
    }
  });

  it('bullet-points spec mentions columnLeft and columnRight', () => {
    expect(LAYOUT_FIELD_SPECS['bullet-points']).toContain('columnLeft');
    expect(LAYOUT_FIELD_SPECS['bullet-points']).toContain('columnRight');
  });

  it('table spec mentions columnLeft and columnRight', () => {
    expect(LAYOUT_FIELD_SPECS['table']).toContain('columnLeft');
    expect(LAYOUT_FIELD_SPECS['table']).toContain('columnRight');
  });
});

// ─── Graph routing logic ─────────────────────────────────────────────────────

describe('graph routing', () => {
  it('routeAfterOutline returns __end__ when error is set', () => {
    const state = { error: 'Something failed', outline: null } as any;
    const route = state.error || !state.outline ? '__end__' : 'gen_content';
    expect(route).toBe('__end__');
  });

  it('routeAfterOutline returns gen_content when outline exists', () => {
    const state = { error: null, outline: { title: 'Test', slides: [] } } as any;
    const route = state.error || !state.outline ? '__end__' : 'gen_content';
    expect(route).toBe('gen_content');
  });

  it('routeAfterValidate returns gen_correct when errors exist and retries remain', () => {
    const state = {
      validationErrors: [{ slideIndex: 0, errors: ['bad'] }],
      retryCount: 0,
      maxRetries: 2,
    } as any;
    const route =
      state.validationErrors.length > 0 && state.retryCount < state.maxRetries
        ? 'gen_correct'
        : 'gen_finalize';
    expect(route).toBe('gen_correct');
  });

  it('routeAfterValidate returns gen_finalize when no errors', () => {
    const state = { validationErrors: [], retryCount: 0, maxRetries: 2 } as any;
    const route =
      state.validationErrors.length > 0 && state.retryCount < state.maxRetries
        ? 'gen_correct'
        : 'gen_finalize';
    expect(route).toBe('gen_finalize');
  });

  it('routeAfterValidate returns gen_finalize when max retries reached', () => {
    const state = {
      validationErrors: [{ slideIndex: 0, errors: ['bad'] }],
      retryCount: 2,
      maxRetries: 2,
    } as any;
    const route =
      state.validationErrors.length > 0 && state.retryCount < state.maxRetries
        ? 'gen_correct'
        : 'gen_finalize';
    expect(route).toBe('gen_finalize');
  });
});
