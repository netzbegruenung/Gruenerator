import { type ExplainableDraft, type ExplainableSource } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AiObjectCall } from '../ai/generate.js';

import { type InsertExplainable } from './explainableRepository.js';

const aiObject = vi.fn<(call: AiObjectCall<ExplainableDraft>) => Promise<unknown>>();
const reserve = vi.fn();
const release = vi.fn();
const insertExplainable = vi.fn<(row: InsertExplainable) => Promise<{ id: string }>>();

vi.mock('../ai/generate.js', () => ({
  aiObject: (call: AiObjectCall<ExplainableDraft>) => aiObject(call),
}));
vi.mock('../trees/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getTreeBudget: () => ({ reserve, release }),
}));
vi.mock('./explainableRepository.js', () => ({
  insertExplainable: (row: InsertExplainable) => insertExplainable(row),
}));

const { createExplainable, explainableUrl } = await import('./createExplainable.js');

const UNITS = 50; // flux-klein: 0,5 × 100
const DAY = '2026-10-09';
const SOURCES: ExplainableSource[] = [
  { index: 1, title: 'Programm', url: 'https://example.org/a' },
  { index: 2, title: 'Beschluss', url: null },
];

function draft(images: number): ExplainableDraft {
  const img = { prompt: 'A simple drawing of a wind turbine', alt: 'Ein Windrad auf einer Wiese' };
  return {
    title: 'Windkraft einfach erklärt',
    summary: 'Windräder machen aus Wind Strom [1]. Das ist gut fürs Klima [7].',
    sections: [0, 1, 2].map((i) => ({
      heading: `Abschnitt ${i}`,
      paragraphs: [`Text ${i} [2].`],
      ...(i < images && { image: img }),
    })),
    keyTakeaways: ['Wind ist Strom.', 'Das Klima profitiert.'],
  };
}

const input = {
  userId: 'u1',
  brief: 'Windräder erzeugen Strom [1].',
  sources: SOURCES,
  threadId: 't1',
  sourceMessageId: 'm1',
  locale: 'de-DE' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  reserve.mockResolvedValue({ ok: true, status: { day: DAY } });
  release.mockResolvedValue({});
  insertExplainable.mockResolvedValue({ id: 'e1' });
});

describe('createExplainable', () => {
  it('reserves three images and releases the units of sections without image', async () => {
    aiObject.mockResolvedValue({ ok: true, data: draft(2) });

    const result = await createExplainable(input);

    expect(reserve).toHaveBeenCalledWith('u1', 3 * UNITS);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('u1', UNITS, DAY);
    expect(result).toMatchObject({ ok: true, id: 'e1', imageCount: 2 });
    const row = insertExplainable.mock.calls[0]![0];
    expect(row).toMatchObject({
      status: 'images_pending',
      reservedUnits: 2 * UNITS,
      reservedDay: DAY,
      threadId: 't1',
      sourceMessageId: 'm1',
    });
    expect(row.content.sections[0]?.image?.status).toBe('pending');
    expect(row.content.sections[2].image).toBeUndefined();
  });

  it('stores the caller sources, drops markers naming none of them', async () => {
    aiObject.mockResolvedValue({ ok: true, data: draft(0) });

    const result = await createExplainable(input);

    const row = insertExplainable.mock.calls[0]![0];
    expect(row.content.sources).toEqual(SOURCES);
    expect(row.content.summary).toBe(
      'Windräder machen aus Wind Strom [1]. Das ist gut fürs Klima.'
    );
    expect(row).toMatchObject({ status: 'ready', reservedUnits: 0, reservedDay: null });
    expect(release).toHaveBeenCalledWith('u1', 3 * UNITS, DAY);
    expect(result.ok && result.url).toBe(
      explainableUrl('Windkraft einfach erklärt', row.slugSuffix)
    );
    expect(result.ok && result.url).toMatch(
      /^\/erklaert\/windkraft-einfach-erklaert-[A-Za-z0-9]{6}$/
    );
  });

  it('releases everything when the model fails', async () => {
    aiObject.mockResolvedValue({ ok: false, error: 'kaputt' });

    const result = await createExplainable(input);

    expect(result).toMatchObject({ ok: false, code: 'generation_failed' });
    expect(release).toHaveBeenCalledWith('u1', 3 * UNITS, DAY);
    expect(insertExplainable).not.toHaveBeenCalled();
  });

  it('releases everything when the model throws', async () => {
    aiObject.mockRejectedValue(new Error('provider down'));

    const result = await createExplainable(input);

    expect(result).toMatchObject({ ok: false, code: 'generation_failed' });
    expect(release).toHaveBeenCalledWith('u1', 3 * UNITS, DAY);
  });

  it('maps a refused reservation without calling the model', async () => {
    reserve.mockResolvedValue({
      ok: false,
      reason: 'exceeded',
      status: {
        usedUnits: 1000,
        limitUnits: 1000,
        remainingUnits: 0,
        resetsAt: new Date(Date.now() + 3600_000),
        newsletterBonus: false,
        day: DAY,
      },
    });
    expect(await createExplainable(input)).toMatchObject({ ok: false, code: 'budget_exhausted' });

    reserve.mockResolvedValue({ ok: false, reason: 'unavailable' });
    expect(await createExplainable(input)).toMatchObject({ ok: false, code: 'budget_unavailable' });

    expect(aiObject).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it('uses the explainable lane and forks the prompt for Austria', async () => {
    aiObject.mockResolvedValue({ ok: true, data: draft(0) });
    await createExplainable({ ...input, locale: 'de-AT' });
    const call = aiObject.mock.calls[0]![0];
    expect(call.lane).toBe('explainable');
    expect(call.system).toContain('ÖSTERREICH');
    expect(call.prompt).toContain('[2] Beschluss');
  });
});
