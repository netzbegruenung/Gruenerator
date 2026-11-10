import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type StructuredValidation } from '../../ai/structuredParsing.js';
import { findTakeGroups } from '../takeGroups.js';

import { RADWEG_DURATION, radwegUnits } from './fixtures.js';

interface Call {
  lane: string;
  reasoning?: string;
  prompt: string;
  validate: (input: unknown, attempt: number, attempts: number) => StructuredValidation<unknown>;
}

const aiObject = vi.fn();
vi.mock('../../ai/generate.js', () => ({ aiObject }));

const { buildCutPrompt, decideCut } = await import('../decideCut.js');

const units = radwegUnits();
const input = {
  brief: {
    topic: 'Radweg Sauerlacher Straße',
    format: '9:16' as const,
    target: { minSeconds: 30, maxSeconds: 45 },
    hints: null,
    locale: 'de-DE' as const,
  },
  clips: [{ id: 'c1', role: 'footage' as const, duration: RADWEG_DURATION, quality: [] }],
  units,
  takes: findTakeGroups([...units.values()]),
  assets: [],
};

const GOOD = ['c1.s8', 'c1.s5', 'c1.s6', 'c1.s7', 'c1.s11', 'c1.s16', 'c1.s17', 'c1.s18'];
const SHUFFLED = ['c1.s6', 'c1.s7', 'c1.s8', 'c1.s5', 'c1.s11', 'c1.s16', 'c1.s17', 'c1.s18'];

beforeEach(() => {
  aiObject.mockReset();
});

describe('decideCut', () => {
  it('sends the repair turn the order violation, then returns the valid cut', async () => {
    const seen: StructuredValidation<unknown>[] = [];
    aiObject.mockImplementation(async (call: Call) => {
      seen.push(call.validate({ segmente: SHUFFLED, ausgelassen: [] }, 1, 2));
      const second = call.validate(
        { segmente: GOOD, ausgelassen: [{ id: 'c1.s13', grund: 'zurückgenommen' }] },
        2,
        2
      );
      return second.ok ? { ok: true, data: second.value } : { ok: false, error: second.error };
    });

    const decision = await decideCut(input);

    expect(seen[0]).toEqual({ ok: false, error: expect.stringContaining('Reihenfolge') });
    expect(decision.unitIds).toEqual(GOOD);
    expect(decision.omitted).toEqual({ 'c1.s13': 'zurückgenommen' });
    expect(decision.validation.timeline.duration).toBeGreaterThan(25);
    expect(aiObject.mock.calls[0][0]).toMatchObject({ lane: 'video_ai_cut', reasoning: 'medium' });
  });

  it('throws when the model never produces a valid cut', async () => {
    aiObject.mockResolvedValue({ ok: false, error: 'Reihenfolge: …' });
    await expect(decideCut(input)).rejects.toThrow('Reihenfolge');
  });
});

describe('buildCutPrompt', () => {
  it('lists units, take hints and the briefing', () => {
    const prompt = buildCutPrompt(input);
    expect(prompt).toContain('Ziellänge: 30–45 s');
    expect(prompt).toContain('c1.s16 [');
    expect(prompt).toContain('„Die CSU hat den Antrag leider abgelehnt.“');
    expect(prompt).toMatch(/c1\.s12, c1\.s16 → Vorschlag c1\.s16/);
  });
});
