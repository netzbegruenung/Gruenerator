import { describe, expect, it } from 'vitest';

import { agendaBody, findAgendaItem, type AgendaEntry } from './agenda.js';

const entry = (code: string | null, title: string, motions = false): AgendaEntry => ({
  code,
  title,
  time: null,
  motions,
});

describe('agendaBody', () => {
  it('lets only motion items accept the motion type', () => {
    const body = agendaBody([entry('1.', 'Begrüßung'), entry('2.', 'Anträge', true)], 7);
    expect(body.items.map((i) => i.settings.motion_types)).toEqual([[], [7]]);
  });

  it('keeps the id of an existing item with the same code, else the same title', () => {
    const existing = [
      { id: 11, code: '2.', title: 'Anträge Verkehr' },
      { id: 12, code: null, title: 'Verschiedenes' },
    ];
    const body = agendaBody(
      [entry('TOP 2', 'Anträge Mobilität', true), entry(null, 'verschiedenes'), entry('4.', 'Neu')],
      7,
      existing
    );
    expect(body.items.map((i) => ('id' in i ? i.id : null))).toEqual([11, 12, null]);
  });

  it('drops a time that Antragsgrün would not take', () => {
    const body = agendaBody([{ ...entry('1.', 'A'), time: 'morgens' }], 7);
    expect(body.items[0].time).toBeNull();
  });
});

describe('findAgendaItem', () => {
  const items = [
    { id: 1, code: '1.', title: 'Begrüßung' },
    { id: 2, code: '2.', title: 'Anträge Verkehr' },
  ];
  it('finds by code in any spelling', () => {
    expect(findAgendaItem(items, 'TOP 2')?.id).toBe(2);
    expect(findAgendaItem(items, '2')?.id).toBe(2);
  });
  it('finds by title fragment', () => {
    expect(findAgendaItem(items, 'verkehr')?.id).toBe(2);
  });
  it('treats a number as the position when Antragsgrün numbers itself', () => {
    const auto = [
      { id: 7, code: null, title: 'Begrüßung' },
      { id: 8, code: null, title: 'Berichte' },
      { id: 9, code: null, title: 'Anträge' },
    ];
    expect(findAgendaItem(auto, '3')?.id).toBe(9);
    expect(findAgendaItem(auto, 'TOP 3')?.id).toBe(9);
  });

  it('returns null when nothing fits', () => {
    expect(findAgendaItem(items, 'Wahlen')).toBeNull();
  });
});
