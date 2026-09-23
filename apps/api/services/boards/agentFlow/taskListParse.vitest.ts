import { describe, it, expect } from 'vitest';

import { MAX_TASKS, agentTaskSubset, parseTaskList, type GeneratedTask } from './taskListParse.js';

describe('parseTaskList', () => {
  it('parses a clean tasks array', () => {
    const out = parseTaskList('{"tasks":[{"title":"Plakate drucken","description":"A2"}]}');
    expect(out).toEqual([
      { title: 'Plakate drucken', description: 'A2', dueDate: null, byAgent: false, dependsOn: [] },
    ]);
  });

  it('extracts JSON from surrounding prose / fences', () => {
    const raw =
      'Hier die Aufgaben:\n```json\n{"tasks":[{"title":"Termin planen"}]}\n```\nViel Erfolg!';
    expect(parseTaskList(raw)).toEqual([
      { title: 'Termin planen', dueDate: null, byAgent: false, dependsOn: [] },
    ]);
  });

  it('drops entries without a usable title and trims titles', () => {
    const out = parseTaskList(
      '{"tasks":[{"title":"  Aufräumen  "},{"title":""},{"description":"kein Titel"},{"title":42}]}'
    );
    expect(out).toEqual([{ title: 'Aufräumen', dueDate: null, byAgent: false, dependsOn: [] }]);
  });

  it('keeps a valid dueDate and defaults it to null otherwise', () => {
    const out = parseTaskList(
      '{"tasks":[{"title":"A","dueDate":"2026-08-01"},{"title":"B","dueDate":123}]}'
    );
    expect(out).toEqual([
      { title: 'A', dueDate: '2026-08-01', byAgent: false, dependsOn: [] },
      { title: 'B', dueDate: null, byAgent: false, dependsOn: [] },
    ]);
  });

  it(`caps the list at ${MAX_TASKS} tasks`, () => {
    const many = { tasks: Array.from({ length: 50 }, (_, i) => ({ title: `T${i}` })) };
    expect(parseTaskList(JSON.stringify(many))).toHaveLength(MAX_TASKS);
  });

  it('reads byAgent only when it is literally true', () => {
    const out = parseTaskList(
      '{"tasks":[{"title":"A","byAgent":true},{"title":"B","byAgent":"true"},{"title":"C"}]}'
    );
    expect(out.map((t) => t.byAgent)).toEqual([true, false, false]);
  });

  it('keeps only backward dependsOn references and remaps them past dropped entries', () => {
    const out = parseTaskList(
      JSON.stringify({
        tasks: [
          { title: 'Recherche' },
          { title: '' },
          { title: 'Entwurf', dependsOn: [0, 1, 0] },
          { title: 'Fazit', dependsOn: [2, 3, 5, -1, 'x', 0.5] },
        ],
      })
    );
    expect(out.map((t) => t.dependsOn)).toEqual([[], [0], [1]]);
  });

  it('returns [] for non-JSON or missing tasks array', () => {
    expect(parseTaskList('nope')).toEqual([]);
    expect(parseTaskList('{"foo":1}')).toEqual([]);
    expect(parseTaskList('{"tasks":"x"}')).toEqual([]);
  });
});

describe('agentTaskSubset', () => {
  const task = (byAgent: boolean, dependsOn: number[] = []): GeneratedTask => ({
    title: 't',
    dueDate: null,
    byAgent,
    dependsOn,
  });

  it('keeps only byAgent tasks and remaps their dependencies onto the subset', () => {
    // 0 research (agent) → 1 print (people) → 2 draft (agent, needs 0 and 1) → 3 post (agent, needs 2)
    const out = agentTaskSubset([task(true), task(false), task(true, [0, 1]), task(true, [2])]);
    expect(out).toEqual([
      { index: 0, dependsOn: [] },
      { index: 2, dependsOn: [0] },
      { index: 3, dependsOn: [1] },
    ]);
  });

  it('returns [] when nothing is for the Grünerator', () => {
    expect(agentTaskSubset([task(false), task(false, [0])])).toEqual([]);
  });
});
