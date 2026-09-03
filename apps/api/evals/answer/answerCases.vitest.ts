/**
 * Die Fallmenge der Antwort-Eval ist eine Ableitung, kein Verzeichnis — und
 * eine Ableitung kann still schrumpfen: ein umbenanntes `kind`, eine
 * verschwundene Sammlung, ein doppelter Fall aus zwei Quellen. Diese drei
 * Zusicherungen sind das Netz darunter.
 */
import { describe, it, expect } from 'vitest';

import { ANSWER_CASES, QA_CASE_TARGET, hasScope, selectQaCases } from './answerCases.js';

import { type RetrievalCase } from '../retrieval/cases.js';

describe('ANSWER_CASES', () => {
  it('trägt 34 Fälle: 9 notebook, 20 qa, 5 near-topic', () => {
    expect(ANSWER_CASES).toHaveLength(34);
    const byGroup = (g: string): number => ANSWER_CASES.filter((c) => c.group === g).length;
    expect(byGroup('notebook')).toBe(9);
    expect(byGroup('qa')).toBe(QA_CASE_TARGET);
    expect(byGroup('near-topic')).toBe(5);
  });

  it('hat eindeutige Fall-IDs', () => {
    const ids = ANSWER_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('löst jeden Fall auf einen Suchumfang auf', () => {
    const withoutScope = ANSWER_CASES.filter((c) => !hasScope(c)).map((c) => c.id);
    expect(withoutScope).toEqual([]);
  });

  // Drei Fälle teilen sich den Fragetext („Und in Bayern?") und unterscheiden
  // sich nur im Verlauf — das ist der Punkt dieser Fälle, nicht ein Duplikat.
  // Geprüft wird deshalb Frage PLUS Umfang.
  it('stellt keine Frage zweimal im selben Umfang', () => {
    const keys = ANSWER_CASES.map((c) => `${c.question}|${JSON.stringify(c.notebook)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('behält den Verlauf der Folgefragen', () => {
    const followUps = ANSWER_CASES.filter((c) => c.question === 'Und in Bayern?');
    expect(followUps).toHaveLength(3);
    for (const c of followUps) expect(c.notebook.history?.length).toBe(2);
  });
});

describe('selectQaCases', () => {
  const cases: RetrievalCase[] = [
    { id: 'a1', collection: 'a', query: 'a1?', expect: [] },
    { id: 'a2', collection: 'a', query: 'a2?', expect: [] },
    { id: 'a3', collection: 'a', query: 'a3?', expect: [] },
    { id: 'b1', collection: 'b', query: 'b1?', expect: [] },
    { id: 'b2', collection: 'b', query: 'b2?', expect: [] },
    { id: 'm1', collection: 'a', query: 'm1', expect: [], kind: 'manual' },
  ];

  it('geht reihum über die Sammlungen statt der Reihe nach', () => {
    expect(selectQaCases(cases, 4).map((c) => c.id)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('lässt Fälle anderer Sorten aus', () => {
    expect(selectQaCases(cases, 10).map((c) => c.id)).not.toContain('m1');
  });

  it('gibt weniger zurück, als verlangt wurde, wenn nichts mehr da ist', () => {
    expect(selectQaCases(cases, 99)).toHaveLength(5);
  });
});
