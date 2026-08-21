import { describe, it, expect } from 'vitest';

import {
  normalizeNotebookHistory,
  prepareNotebookHistory,
  mergeCarriedCitations,
  buildRewriteTranscript,
  type NotebookHistoryMessage,
} from './notebookHistoryService.js';

import type { ReferenceData, ReferencesMap } from '../../../services/search/types.js';

function ref(overrides: Partial<ReferenceData> = {}): ReferenceData {
  return {
    title: 'Frisch',
    snippets: [['frischer Treffer']],
    description: null,
    date: null,
    source: 'qa_documents',
    document_id: 'doc-fresh',
    source_url: null,
    filename: null,
    similarity_score: 0.9,
    chunk_index: 0,
    page_number: null,
    ...overrides,
  };
}

function turn(i: number, answerChars = 400): NotebookHistoryMessage[] {
  return [
    { role: 'user', content: `Frage ${i}?` },
    { role: 'assistant', content: `Antwort ${i} `.padEnd(answerChars, 'x') },
  ];
}

describe('normalizeNotebookHistory', () => {
  it('akzeptiert String-Content und Parts-Arrays, verwirft Leeres und fremde Rollen', () => {
    const result = normalizeNotebookHistory([
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: [{ type: 'text', text: 'Antwort' }, { type: 'image' }] },
      { role: 'system', content: 'geheim' },
      { role: 'user', content: '   ' },
      null,
      'quatsch',
    ]);
    expect(result).toEqual([
      { role: 'user', content: 'Hallo' },
      { role: 'assistant', content: 'Antwort' },
    ]);
  });

  it('übernimmt nur Citations mit String-Index', () => {
    const result = normalizeNotebookHistory([
      {
        role: 'assistant',
        content: 'A',
        citations: [{ index: '1', document_id: 'd1' }, { index: 2 }, null],
      },
    ]);
    expect(result[0].citations).toEqual([{ index: '1', document_id: 'd1' }]);
  });
});

describe('prepareNotebookHistory', () => {
  it('kürzt nie innerhalb einer Nachricht — Turns fallen als Ganzes', () => {
    // Budget floor = 8000 tokens ≈ 28k chars; five turns of ~8k chars each →
    // the oldest turns must drop whole, the kept ones stay byte-identical.
    const history = [...turn(1, 8000), ...turn(2, 8000), ...turn(3, 8000), ...turn(4, 8000)];
    const { messages, droppedTurns } = prepareNotebookHistory(history);
    expect(droppedTurns).toBeGreaterThan(0);
    expect(messages.length % 2).toBe(0);
    for (const m of messages) {
      const original = history.find((h) => h.content === m.content);
      expect(original).toBeDefined();
    }
    // Newest turn survives in full.
    expect(messages[messages.length - 1].content).toBe(history[history.length - 1].content);
  });

  it('behält den jüngsten Turn auch über Budget, solange er unter der Fensterhälfte liegt', () => {
    const bigAnswer = turn(1, 40000); // ~11.4k tokens > 8k floor budget
    const { messages, droppedTurns } = prepareNotebookHistory(bigAnswer, 64000);
    expect(droppedTurns).toBe(0);
    expect(messages).toHaveLength(2);
  });

  it('verwirft die Historie ganz, wenn selbst der jüngste Turn die Fensterhälfte sprengt', () => {
    const huge = turn(1, 200000); // ~57k tokens > 32k (half of 64k window)
    const { messages, droppedTurns } = prepareNotebookHistory(huge, 64000);
    expect(messages).toHaveLength(0);
    expect(droppedTurns).toBe(1);
  });

  it('skaliert das Budget mit dem Fenster', () => {
    const history = Array.from({ length: 10 }, (_, i) => turn(i, 8000)).flat();
    const small = prepareNotebookHistory(history, 64000); // budget 12.8k tokens
    const large = prepareNotebookHistory(history, 262144); // budget ~52k tokens
    expect(large.messages.length).toBeGreaterThan(small.messages.length);
  });
});

describe('mergeCarriedCitations', () => {
  const history: NotebookHistoryMessage[] = [
    { role: 'user', content: 'Was sagt das Programm zu Windkraft?' },
    {
      role: 'assistant',
      content: 'Das Programm fordert Ausbau [1] und Beteiligung [cite:2]. Beides zentral [1, 2].',
      citations: [
        {
          index: '1',
          document_id: 'doc-old',
          document_title: 'Wahlprogramm',
          cited_text: 'Windkraft massiv ausbauen',
          chunk_index: 4,
        },
        {
          index: '2',
          document_id: 'doc-fresh',
          document_title: 'Frisch',
          cited_text: 'Bürgerbeteiligung stärken',
          chunk_index: 0,
        },
      ],
    },
  ];

  it('dedupliziert gegen frische Treffer und hängt nur den Rest an', () => {
    const fresh: ReferencesMap = { '1': ref() }; // doc-fresh:0 ist schon da
    const { referencesMap, appended } = mergeCarriedCitations(fresh, history);
    expect(appended).toHaveLength(1);
    expect(appended[0].id).toBe('2');
    expect(appended[0].ref.title).toBe('Wahlprogramm');
    expect(appended[0].ref.chunk_text).toBe('Windkraft massiv ausbauen');
    expect(Object.keys(referencesMap)).toEqual(['1', '2']);
  });

  it('schreibt alte Marker beider Formen auf die gemergten Nummern um', () => {
    const fresh: ReferencesMap = { '1': ref() };
    const { history: rewritten } = mergeCarriedCitations(fresh, history);
    // alt [1] (doc-old) → neu [2]; alt [cite:2] (doc-fresh) → neu [1]
    expect(rewritten[1].content).toBe(
      'Das Programm fordert Ausbau [2] und Beteiligung [1]. Beides zentral [2, 1].'
    );
  });

  it('strippt Marker ohne Mapping, statt sie auf falsche Quellen zeigen zu lassen', () => {
    const noMeta: NotebookHistoryMessage[] = [
      { role: 'assistant', content: 'Behauptung mit altem Beleg [3].' },
    ];
    const { history: rewritten, appended } = mergeCarriedCitations({ '1': ref() }, noMeta);
    expect(appended).toHaveLength(0);
    expect(rewritten[0].content).toBe('Behauptung mit altem Beleg.');
  });

  it('deckelt Carry-over auf die letzten 3 Assistant-Antworten und 12 Quellen', () => {
    const manyMessages: NotebookHistoryMessage[] = Array.from({ length: 5 }, (_, m) => ({
      role: 'assistant' as const,
      content: `Antwort ${m} [1]`,
      citations: Array.from({ length: 6 }, (_, c) => ({
        index: String(c + 1),
        document_id: `doc-${m}-${c}`,
        document_title: `Quelle ${m}-${c}`,
        cited_text: 'Passage',
        chunk_index: 0,
      })),
    }));
    const { appended } = mergeCarriedCitations({}, manyMessages);
    expect(appended.length).toBeLessThanOrEqual(12);
    // Nur die letzten 3 Nachrichten liefern Kandidaten.
    const fromMessages = new Set(appended.map((a) => a.ref.document_id.split('-')[1]));
    expect([...fromMessages].every((m) => Number(m) >= 2)).toBe(true);
  });

  it('lässt User-Nachrichten unangetastet', () => {
    const { history: rewritten } = mergeCarriedCitations({}, history);
    expect(rewritten[0]).toEqual(history[0]);
  });
});

describe('buildRewriteTranscript', () => {
  it('hält Anfang UND Ende langer Antworten sichtbar und strippt Marker', () => {
    const longAnswer = `ANFANG ${'x'.repeat(5000)} SCHLUSSFOLGERUNG [cite:3]`;
    const transcript = buildRewriteTranscript([
      { role: 'user', content: 'Frage?' },
      { role: 'assistant', content: longAnswer },
    ]);
    expect(transcript).toContain('ANFANG');
    expect(transcript).toContain('SCHLUSSFOLGERUNG');
    expect(transcript).not.toContain('[cite:');
    expect(transcript).toContain('Nutzer*in: Frage?');
  });
});
