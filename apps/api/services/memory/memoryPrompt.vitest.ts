import { describe, expect, it } from 'vitest';

import { numberMemories, renderMemoryLines } from './memoryPrompt.js';

import type { UserMemoryRow } from '../../database/schema/index.js';

function row(
  over: Partial<UserMemoryRow> & Pick<UserMemoryRow, 'id' | 'kind' | 'text'>
): UserMemoryRow {
  return {
    user_id: 'u1',
    source: 'chat',
    thread_id: null,
    created_at: new Date('2026-08-12T10:00:00Z'),
    updated_at: new Date('2026-08-12T10:00:00Z'),
    ...over,
  };
}

describe('numberMemories', () => {
  it('numbers instructions first, then facts, from 1', () => {
    const rendered = numberMemories({
      anweisungen: [row({ id: 'a', kind: 'anweisung', text: 'Immer Du-Form.' })],
      fakten: [
        row({ id: 'f1', kind: 'fakt', text: 'Aus Köln.' }),
        row({ id: 'f2', kind: 'fakt', text: 'Schreibt für Instagram.' }),
      ],
    });
    expect(rendered.map((m) => [m.nr, m.id])).toEqual([
      [1, 'a'],
      [2, 'f1'],
      [3, 'f2'],
    ]);
  });
});

describe('renderMemoryLines', () => {
  it('renders both sections with German dates and no [N] citation markers', () => {
    const text = renderMemoryLines(
      numberMemories({
        anweisungen: [row({ id: 'a', kind: 'anweisung', text: 'Immer Du-Form.' })],
        fakten: [
          row({
            id: 'f',
            kind: 'fakt',
            text: 'Aus Köln.',
            updated_at: new Date('2026-07-03T08:00:00Z'),
          }),
        ],
      })
    );
    expect(text).toContain('### Dauerhafte Anweisungen\nNr. 1 (12.08.2026): Immer Du-Form.');
    expect(text).toContain('### Fakten zur Person\nNr. 2 (03.07.2026): Aus Köln.');
    expect(text).not.toMatch(/\[\d+\]/);
  });

  it('omits an empty section entirely and is empty with nothing to show', () => {
    const onlyFacts = renderMemoryLines(
      numberMemories({
        anweisungen: [],
        fakten: [row({ id: 'f', kind: 'fakt', text: 'Aus Köln.' })],
      })
    );
    expect(onlyFacts).not.toContain('Anweisungen');
    expect(onlyFacts).toContain('Nr. 1');
    expect(renderMemoryLines([])).toBe('');
  });
});
