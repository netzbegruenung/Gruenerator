import { describe, expect, it, vi } from 'vitest';

import {
  DECISION_MAX_REQUEST_BYTES,
  type ChoiceAnswer,
  type DecideCall,
} from '../../../services/ai/decide.js';

import { DOC_OPTION_LIMIT, decideNotebookTurnNeeds } from './notebookTurnNeeds.js';

import type { InventoryList } from './notebookInventory.js';

const NB = '5a438806-4e76-43c4-bf1e-1751708d123b';

function inventory(n: number, pages = 28): InventoryList[] {
  return [
    {
      notebookId: NB,
      total: n,
      items: Array.from({ length: n }, (_, i) => ({
        ref: `ref-${i}`,
        title: `Dokument ${i}.pdf`,
        detail: '',
        pages,
      })),
    },
  ];
}

const answer = (choice: string, confidence = 0.9): ChoiceAnswer => ({
  choice,
  confidence,
  probabilities: {},
});

type Answers = Partial<Record<string, ChoiceAnswer>>;

/** Ein Entscheidungs-Mock, der die Aufrufe typisiert mitschreibt. */
function decider(...results: Array<Answers | Error>) {
  const calls: DecideCall<string>[] = [];
  const decide = vi.fn(async (call: DecideCall<string>): Promise<Answers> => {
    calls.push(call);
    const next = results[Math.min(calls.length - 1, results.length - 1)]!;
    if (next instanceof Error) throw next;
    return next;
  });
  return { decide, calls };
}

const FIRST_NO = {
  zaehlen: answer('nein'),
  stelle: answer('nein'),
  dokument: answer('keins'),
};

describe('decideNotebookTurnNeeds', () => {
  it('asks every question in one call', async () => {
    const { decide, calls } = decider({ ...FIRST_NO, zaehlen: answer('ja') });
    const needs = await decideNotebookTurnNeeds(
      { question: 'Wie oft kommt Polizei vor?', history: [], inventory: inventory(3) },
      { decide }
    );
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!.questions).sort()).toEqual(['dokument', 'stelle', 'zaehlen']);
    expect(needs).toEqual({ count: true, page: null, confidence: 0.9 });
  });

  it('asks for the page only when a document was picked', async () => {
    const { decide, calls } = decider(
      { ...FIRST_NO, stelle: answer('ja'), dokument: answer('ref-1') },
      { seite: answer('3', 0.8) }
    );
    const needs = await decideNotebookTurnNeeds(
      { question: 'Was steht auf Seite 3 von Dokument 1?', history: [], inventory: inventory(3) },
      { decide }
    );
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[1]!.questions.seite!.criteria)).toHaveLength(28);
    expect(needs).toEqual({
      count: false,
      page: { sourceId: 'ref-1', page: 3 },
      confidence: 0.8,
    });
  });

  it('does not ask for the page when no page is wanted', async () => {
    const { decide, calls } = decider({ ...FIRST_NO, dokument: answer('ref-1') });
    const needs = await decideNotebookTurnNeeds(
      { question: 'Was steht zu Kitas drin?', history: [], inventory: inventory(3) },
      { decide }
    );
    expect(calls).toHaveLength(1);
    expect(needs?.page).toBeNull();
  });

  it('skips the document question beyond DOC_OPTION_LIMIT', async () => {
    const { decide, calls } = decider({
      zaehlen: answer('nein'),
      stelle: answer('ja'),
    });
    const needs = await decideNotebookTurnNeeds(
      { question: 'Seite 3?', history: [], inventory: inventory(DOC_OPTION_LIMIT + 1) },
      { decide }
    );
    expect(Object.keys(calls[0]!.questions)).not.toContain('dokument');
    expect(calls).toHaveLength(1);
    expect(needs?.page).toBeNull();
  });

  it('returns null when the decision fails', async () => {
    const { decide } = decider(new Error('timeout'));
    expect(
      await decideNotebookTurnNeeds({ question: 'x', history: [], inventory: [] }, { decide })
    ).toBeNull();
  });

  it('returns null when an answer is missing', async () => {
    const { decide } = decider({ zaehlen: answer('ja') });
    expect(
      await decideNotebookTurnNeeds({ question: 'x', history: [], inventory: [] }, { decide })
    ).toBeNull();
  });

  it('stays inside DECISION_MAX_REQUEST_BYTES with long titles', async () => {
    const long = inventory(DOC_OPTION_LIMIT);
    const items = long[0]!.items.map((it) => ({ ...it, title: 'Ä'.repeat(400) + it.title }));
    const { decide, calls } = decider(FIRST_NO);
    await decideNotebookTurnNeeds(
      { question: 'x', history: [], inventory: [{ ...long[0]!, items }] },
      { decide }
    );
    const { state, questions } = calls[0]!;
    expect(Buffer.byteLength(JSON.stringify({ state, questions }))).toBeLessThan(
      DECISION_MAX_REQUEST_BYTES
    );
  });
});
