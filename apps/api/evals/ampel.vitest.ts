import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ampelOf,
  bewerteFall,
  PRUEFUNG_STUFE,
  pruefungsArt,
  stufeOf,
  verletzungen,
  zusammenfassen,
} from './ampel.js';
import { runAssertions } from './assertions.js';
import { buildRubricPrompt, rubricsForTurn } from './judge/rubrics.js';
import { noteJeFall, parseNote } from './judge/verdicts.js';

import type { AssertionResult, ChatTrace, TurnResult } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function trace(over: Partial<ChatTrace> = {}): ChatTrace {
  return {
    intent: 'agentic',
    agentic: true,
    toolCalls: [],
    sharepicGenerated: false,
    imageGenerated: false,
    citations: [],
    sources: 0,
    fullText: '',
    generatedText: [],
    artifactIds: [],
    latencyMs: 1000,
    error: null,
    threadId: null,
    interrupts: [],
    referencedIds: [],
    warnings: [],
    editorOps: false,
    sharepicUpdated: false,
    sharepicVariants: [],
    confirmActions: [],
    documentCreated: false,
    ...over,
  };
}

const a = (name: string, pass: boolean): AssertionResult => ({
  name,
  pass,
  detail: pass ? '' : 'x',
  stufe: stufeOf(name),
});

describe('Ampel', () => {
  it('hart verletzt → rot, auch mit Note 5', () => {
    const b = bewerteFall({ assertions: [a('tool:web_search', false)], error: null }, 5);
    expect(b.ampel).toBe('rot');
  });

  it('nur weich verletzt → gelb', () => {
    const b = bewerteFall({ assertions: [a('cited', false), a('routing', true)], error: null });
    expect(b.ampel).toBe('gelb');
  });

  it('Richternote 3 → gelb, 4 → grün, keine Note → grün', () => {
    const ok = { assertions: [a('routing', true)], error: null };
    expect(bewerteFall(ok, 3).ampel).toBe('gelb');
    expect(bewerteFall(ok, 4).ampel).toBe('gruen');
    expect(bewerteFall(ok, null).ampel).toBe('gruen');
  });

  it('Richternote 1 ohne harte Verletzung → gelb, nie rot', () => {
    expect(bewerteFall({ assertions: [a('routing', true)], error: null }, 1).ampel).toBe('gelb');
    expect(ampelOf([], 1)).toBe('gelb');
  });

  it('Stream-Fehler auf Fallebene ist hart, auch ohne Assertion', () => {
    const b = bewerteFall({ assertions: [], error: 'timeout' });
    expect(b.ampel).toBe('rot');
    expect(b.verletzungen[0]).toMatchObject({ name: 'streamCompleted', stufe: 'hart' });
  });

  it('liest Läufe ohne `stufe` über die Tabelle (alte last-run.json)', () => {
    const old: AssertionResult = { name: 'topic:Klima', pass: false, detail: 'x' };
    expect(verletzungen([old])[0]!.stufe).toBe('weich');
    expect(verletzungen([{ ...old, name: 'tool:web_search' }])[0]!.stufe).toBe('hart');
  });

  it('fasst zusammen: Zähler, Durchschnittsnote, auffällige Fälle', () => {
    const z = zusammenfassen([
      { id: 'a', bewertung: bewerteFall({ assertions: [], error: null }, 5) },
      { id: 'b', bewertung: bewerteFall({ assertions: [a('cited', false)], error: null }, 3) },
      { id: 'c', bewertung: bewerteFall({ assertions: [a('routing', false)], error: null }) },
    ]);
    expect([z.gruen, z.gelb, z.rot]).toEqual([1, 1, 1]);
    expect(z.durchschnittsnote).toBe(4);
    expect(z.benotet).toBe(2);
    expect(z.auffaellig.map((x) => x.id)).toEqual(['b', 'c']);
    expect(z.auffaellig[0]!.punkte).toEqual(['cited (weich)', 'Note 3']);
  });

  it('ohne Richter gibt es keine Durchschnittsnote', () => {
    const z = zusammenfassen([
      { id: 'a', bewertung: bewerteFall({ assertions: [], error: null }) },
    ]);
    expect(z.durchschnittsnote).toBeNull();
  });
});

describe('Latenz zweistufig', () => {
  const run = (ms: number) =>
    runAssertions(trace({ latencyMs: ms }), { maxLatencyMs: 1000 }).map((r) => [
      r.name,
      r.pass,
      r.stufe,
    ]);

  it('im Soll → grün, darüber → weich, über 2× Soll → hart', () => {
    expect(run(1000)).toEqual([['latency', true, 'weich']]);
    expect(run(1500)).toEqual([['latency', false, 'weich']]);
    expect(run(2000)).toEqual([['latency', false, 'weich']]);
    expect(run(2001)).toEqual([['latencyHard', false, 'hart']]);
  });
});

describe('answerShouldContain', () => {
  it('fehlende Passage ist weich (gelb), vorhandene besteht', () => {
    const rs = runAssertions(trace({ fullText: 'Der Antrag 21/123 liegt vor.' }), {
      answerShouldContain: ['21/\\d+', 'Beschluss'],
    });
    expect(rs.map((r) => [r.name, r.pass, r.stufe])).toEqual([
      ['answerShouldContain:21/\\d+', true, 'weich'],
      ['answerShouldContain:Beschluss', false, 'weich'],
    ]);
    expect(bewerteFall({ assertions: rs, error: null }).ampel).toBe('gelb');
  });

  it('answerMustContain bleibt hart', () => {
    const rs = runAssertions(trace({ fullText: 'x' }), { answerMustContain: ['Beschluss'] });
    expect(rs[0]).toMatchObject({ pass: false, stufe: 'hart' });
  });
});

describe('Wächter der Stufentabelle', () => {
  it('jeder Name, den assertions.ts und runChatEval.ts erzeugen, steht in der Tabelle', () => {
    const src =
      readFileSync(join(HERE, 'assertions.ts'), 'utf8') +
      readFileSync(join(HERE, 'runChatEval.ts'), 'utf8');
    // ok('x' / fail('x' / ok(`x:${…}` — das erste Literal, bis zum ersten `:`.
    const arts = new Set(
      [...src.matchAll(/\b(?:ok|fail)\(\s*['`]([A-Za-z]+)/g)].map((m) => pruefungsArt(m[1]!))
    );
    // Namen, die über eine Variable laufen, stehen als `const name = \`art:…\``.
    for (const m of src.matchAll(/const name = [`']([A-Za-z]+)/g)) arts.add(m[1]!);
    // Direkt als Objektliteral erzeugte Ergebnisse (`name: 'scenarioComplete'`).
    for (const m of src.matchAll(/\bname: '([A-Za-z]+)',\s*\n\s*pass: false/g)) arts.add(m[1]!);
    expect(arts.size).toBeGreaterThan(30);
    const missing = [...arts].filter((x) => !Object.hasOwn(PRUEFUNG_STUFE, x));
    expect(missing).toEqual([]);
  });

  it('ein unbekannter Name wirft statt still ungestuft durchzurutschen', () => {
    expect(() => stufeOf('gibtEsNicht')).toThrow(/PRUEFUNG_STUFE/);
  });

  it('weich sind genau die Güte-Prüfungen', () => {
    const weich = Object.entries(PRUEFUNG_STUFE)
      .filter(([, s]) => s === 'weich')
      .map(([k]) => k)
      .sort();
    expect(weich).toEqual(
      [
        'answerShouldContain',
        'cited',
        'correctsFalsePremise',
        'latency',
        'maxToolCalls',
        'minAnswerChars',
        'statesAsOf',
        'topic',
      ].sort()
    );
  });
});

describe('Richternote', () => {
  it('parseNote liest 1–5, auch umhüllt, und lehnt Ungültiges ab', () => {
    expect(parseNote('{"note": 4, "reason": "gut"}')).toEqual({ note: 4, reason: 'gut' });
    expect(parseNote('```json\n{"note":"2","reason":"x"}\n```')).toEqual({ note: 2, reason: 'x' });
    expect(parseNote('{"note": 0, "reason": "x"}')).toBeNull();
    expect(parseNote('{"note": 6}')).toBeNull();
    expect(parseNote('{"pass": true}')).toBeNull();
    expect(parseNote('kein json')).toBeNull();
  });

  it('noteJeFall nimmt den schlechtesten Turn', () => {
    const v = (turnIndex: number, note: number) => ({
      caseId: 'c',
      turnIndex,
      rubric: 'antwortqualitaet' as const,
      pass: note >= 4,
      reason: '',
      note,
    });
    expect(noteJeFall([v(0, 5), v(1, 2)]).get('c')).toBe(2);
  });

  const turn = (over: Partial<TurnResult> = {}): TurnResult =>
    ({
      turnIndex: 0,
      prompt: 'Was beschloss der Bundestag?',
      latencyMs: 1,
      intent: null,
      agentic: false,
      toolCalls: [],
      threadId: null,
      warnings: [],
      interrupts: [],
      artifactIds: [],
      editorOps: false,
      sharepicUpdated: false,
      imageGenerated: false,
      citations: [],
      fullText: 'Er beschloss X.',
      generatedText: [],
      error: null,
      assertions: [],
      passed: true,
      ...over,
    }) as TurnResult;

  it('Rubrik trägt Anker, Frage und Antwort; läuft auf jedem Turn mit Antwort', () => {
    const p = buildRubricPrompt('antwortqualitaet', turn(), {})!;
    expect(p.system).toContain('5 = vollständig, belegt, präzise');
    expect(p.system).toContain('1 = falsch oder erfunden');
    expect(p.system).toContain('"note"');
    expect(p.user).toContain('Was beschloss der Bundestag?');
    expect(p.user).toContain('Er beschloss X.');
    expect(rubricsForTurn(turn())).toContain('antwortqualitaet');
    expect(rubricsForTurn(turn({ fullText: '' }))).not.toContain('antwortqualitaet');
    expect(buildRubricPrompt('antwortqualitaet', turn({ fullText: '' }), {})).toBeNull();
  });
});
