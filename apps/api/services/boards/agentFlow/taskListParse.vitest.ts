import { describe, it, expect } from 'vitest';

import { MAX_TASKS, parseTaskList } from './taskListParse.js';

describe('parseTaskList', () => {
  it('parses a clean tasks array', () => {
    const out = parseTaskList('{"tasks":[{"title":"Plakate drucken","description":"A2"}]}');
    expect(out).toEqual([{ title: 'Plakate drucken', description: 'A2', dueDate: null }]);
  });

  it('extracts JSON from surrounding prose / fences', () => {
    const raw =
      'Hier die Aufgaben:\n```json\n{"tasks":[{"title":"Termin planen"}]}\n```\nViel Erfolg!';
    expect(parseTaskList(raw)).toEqual([{ title: 'Termin planen', dueDate: null }]);
  });

  it('drops entries without a usable title and trims titles', () => {
    const out = parseTaskList(
      '{"tasks":[{"title":"  Aufräumen  "},{"title":""},{"description":"kein Titel"},{"title":42}]}'
    );
    expect(out).toEqual([{ title: 'Aufräumen', dueDate: null }]);
  });

  it('keeps a valid dueDate and defaults it to null otherwise', () => {
    const out = parseTaskList(
      '{"tasks":[{"title":"A","dueDate":"2026-08-01"},{"title":"B","dueDate":123}]}'
    );
    expect(out).toEqual([
      { title: 'A', dueDate: '2026-08-01' },
      { title: 'B', dueDate: null },
    ]);
  });

  it(`caps the list at ${MAX_TASKS} tasks`, () => {
    const many = { tasks: Array.from({ length: 50 }, (_, i) => ({ title: `T${i}` })) };
    expect(parseTaskList(JSON.stringify(many))).toHaveLength(MAX_TASKS);
  });

  it('returns [] for non-JSON or missing tasks array', () => {
    expect(parseTaskList('nope')).toEqual([]);
    expect(parseTaskList('{"foo":1}')).toEqual([]);
    expect(parseTaskList('{"tasks":"x"}')).toEqual([]);
  });
});
