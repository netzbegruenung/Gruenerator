import { describe, expect, it } from 'vitest';

import { type JudgeVerdict } from './judge/verdicts.js';
import {
  buildReviewData,
  RICHTER_ANDERER_LAUF,
  renderReviewHtml,
  richterFuerLauf,
} from './renderReview.js';

import type { CaseResult, TurnResult } from './types.js';

const turn = (over: Partial<TurnResult> = {}): TurnResult =>
  ({
    turnIndex: 0,
    prompt: 'Frage <b>fett</b>?',
    latencyMs: 10,
    intent: 'agentic',
    agentic: true,
    toolCalls: [{ toolName: 'parlament_lesen', ok: true, args: { ref: '21/1</script>' } }],
    fullText: 'Antwort <script>alert(1)</script> & "mehr"',
    assertions: [],
    ...over,
  }) as TurnResult;

const fall = (id: string, over: Partial<CaseResult> = {}): CaseResult => ({
  id,
  category: 'bundestag',
  prompt: 'p',
  latencyMs: 1234,
  intent: 'agentic',
  agentic: true,
  toolNames: [],
  error: null,
  assertions: [],
  passed: true,
  turns: [turn()],
  ...over,
});

const FAELLE = [
  fall('gruen-1'),
  fall('gelb-1', {
    assertions: [{ name: 'cited', pass: false, detail: 'no <i>markers</i>' }],
  }),
  fall('rot-1', {
    assertions: [{ name: 'tool:parlament_lesen', pass: false, detail: 'missing', stufe: 'hart' }],
    passed: false,
  }),
];

const VERDICTS: JudgeVerdict[] = [
  {
    caseId: 'gruen-1',
    turnIndex: 0,
    rubric: 'antwortqualitaet',
    pass: true,
    reason: 'sauber',
    note: 5,
  },
  {
    caseId: 'rot-1',
    turnIndex: 0,
    rubric: 'antwortqualitaet',
    pass: false,
    reason: 'erfunden <x>',
    note: 1,
  },
  { caseId: 'gelb-1', turnIndex: 0, rubric: 'groundedness', pass: false, reason: 'ungedeckt' },
];

describe('renderReview', () => {
  const data = buildReviewData(FAELLE, VERDICTS, '2026-10-29T10:00:00.000Z');
  const html = renderReviewHtml(data);

  it('enthält alle Fälle mit Ampel und die Zusammenfassung', () => {
    for (const f of FAELLE) expect(html).toContain(`id="${f.id}"`);
    expect(data.faelle.map((f) => f.ampel)).toEqual(['gruen', 'gelb', 'rot']);
    expect(data.zusammenfassung).toMatchObject({ gruen: 1, gelb: 1, rot: 1, benotet: 2 });
    expect(data.zusammenfassung.durchschnittsnote).toBe(3);
    expect(html).toContain('Ø Note 3');
  });

  it('escaped fremden Text: kein rohes Tag aus Frage, Antwort, Argumenten, Details', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>fett');
    expect(html).not.toContain('<i>markers');
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;mehr&quot;');
    expect(html).toContain('21/1&lt;/script&gt;');
  });

  it('Richter allein macht nie rot: Note 1 ohne harte Verletzung bleibt gelb', () => {
    const d = buildReviewData(
      [fall('nur-richter')],
      [
        {
          caseId: 'nur-richter',
          turnIndex: 0,
          rubric: 'antwortqualitaet',
          pass: false,
          reason: '',
          note: 1,
        },
      ],
      'r'
    );
    expect(d.faelle[0]!.ampel).toBe('gelb');
  });

  it('review-data.json: stabile Form je Fall', () => {
    const f = data.faelle[2]!;
    expect(data.version).toBe(1);
    expect(data.runId).toBe('2026-10-29T10:00:00.000Z');
    expect(Object.keys(f).sort()).toEqual(
      [
        'ampel',
        'category',
        'id',
        'knownFailure',
        'latenzMs',
        'modell',
        'note',
        'notenBegruendung',
        'richter',
        'turns',
        'verletzungen',
      ].sort()
    );
    expect(f.turns[0]!.tools[0]).toEqual({
      name: 'parlament_lesen',
      ok: true,
      args: { ref: '21/1</script>' },
    });
    expect(f.verletzungen[0]).toEqual({
      name: 'tool:parlament_lesen',
      stufe: 'hart',
      detail: 'missing',
    });
    expect(f.note).toBe(1);
    expect(f.notenBegruendung).toBe('erfunden <x>');
    expect(data.faelle[1]!.richter[0]).toMatchObject({ rubric: 'groundedness', pass: false });
  });

  it('läuft ohne Richter-Ergebnisse', () => {
    const d = buildReviewData(FAELLE, [], 'r');
    expect(d.zusammenfassung.durchschnittsnote).toBeNull();
    expect(renderReviewHtml(d)).toContain('kein Richter gelaufen');
  });

  it('verneinte Richter-Rubrik färbt den Fall gelb, nicht rot', () => {
    const d = buildReviewData(
      [fall('g')],
      [{ caseId: 'g', turnIndex: 0, rubric: 'groundedness', pass: false, reason: 'ungedeckt' }],
      'r'
    );
    expect(d.faelle[0]!.ampel).toBe('gelb');
    expect(d.zusammenfassung).toMatchObject({ gruen: 0, gelb: 1, rot: 0 });
  });

  it('übernimmt Richterurteile nur bei passender runId', () => {
    const file = { runId: 'A', verdicts: VERDICTS };
    expect(richterFuerLauf(file, 'A')).toEqual({ verdicts: VERDICTS, hinweis: null });
    expect(richterFuerLauf(file, 'B')).toEqual({ verdicts: [], hinweis: RICHTER_ANDERER_LAUF });
    // Alte Form (nacktes Array) hat keine runId und passt zu keinem Lauf.
    expect(richterFuerLauf(VERDICTS, 'A').hinweis).toBe(RICHTER_ANDERER_LAUF);
  });

  it('zeigt den Hinweis sichtbar auf der Seite', () => {
    const html = renderReviewHtml(buildReviewData(FAELLE, [], 'B', RICHTER_ANDERER_LAUF));
    expect(html).toContain('Richter-Ergebnisse gehören zu einem anderen Lauf, nicht übernommen');
  });

  it('übernimmt angefragtes Modell und gemeldete Fallbacks, erfindet kein verwendetes', () => {
    const t = turn({
      requestedModelId: 'gemma-4',
      fallbacks: [{ von: 'a', nach: 'b', grund: 'timeout' }],
    });
    const d = buildReviewData([fall('m', { turns: [t] })], [], 'r');
    expect(d.faelle[0]!.modell).toEqual({
      intent: 'agentic',
      agentic: true,
      angefragt: 'gemma-4',
      fallbacks: [{ von: 'a', nach: 'b', grund: 'timeout' }],
    });
    expect(buildReviewData(FAELLE, [], 'r').faelle[0]!.modell.angefragt).toBeNull();
  });
});
