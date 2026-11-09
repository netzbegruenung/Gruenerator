/**
 * The plan-then-execute seam: the model only names the operation and its
 * operands, every figure comes from computeEngine — counted against the source
 * text, never against what the plan echoes back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let planJson = '';
vi.mock('../../../../services/ai/generate.js', () => ({
  aiText: async () => planJson,
}));

const { planAndCompute } = await import('./computeNode.js');

const TERMINE = [
  'Kreisversammlung · 07.01.2027 · 19:00',
  'Infostand · 17.01.2027 · 10:00',
  'Infostand · 02.02.2027 · 10:00',
].join('\n');

describe('planAndCompute', () => {
  beforeEach(() => (planJson = ''));

  // #5499: "Anzahl der Termine pro Monat" was `unsupported`, and the loop
  // retried `rechnen` until failure_cap.
  it('counts the planned terms per group in the source text', async () => {
    planJson = JSON.stringify({
      operation: 'count_terms',
      label: 'Termine pro Monat',
      terms: [
        { label: 'Januar', phrase: '01.2027' },
        { label: 'Februar', phrase: '02.2027' },
      ],
    });

    const { result, operation } = await planAndCompute(`Anfrage: "pro Monat"`, TERMINE);

    expect(operation).toBe('count_terms');
    expect(result?.entries).toEqual([
      { label: 'Januar („01.2027")', value: '2' },
      { label: 'Februar („02.2027")', value: '1' },
    ]);
  });

  it('drops malformed terms from the plan instead of failing on them', async () => {
    planJson = JSON.stringify({
      operation: 'count_terms',
      terms: [{ phrase: 'Infostand' }, { label: 'kaputt' }, 'Text', null],
    });

    const { result } = await planAndCompute('Anfrage: "wie oft Infostand"', TERMINE);

    expect(result?.entries).toEqual([{ label: '„Infostand"', value: '2' }]);
  });

  it('computes nothing when the plan lists no terms', async () => {
    planJson = JSON.stringify({ operation: 'count_terms', terms: null });

    expect((await planAndCompute('Anfrage: "zähl"', TERMINE)).result).toBeNull();
  });
});
