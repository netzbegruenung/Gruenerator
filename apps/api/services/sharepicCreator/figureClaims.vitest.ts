import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiDecide = vi.hoisted(() => vi.fn());
vi.mock('../ai/decide.js', async (original) => ({
  ...(await original<typeof import('../ai/decide.js')>()),
  aiDecide,
}));

import { falsifiedFigureClaims, hasFigureClaims } from './figureClaims.js';

const SOURCE =
  'Die 2,4 km lange Strecke gilt seit Jahren als Unfallschwerpunkt: Allein 2025 registrierte die Polizei dort 17 Unfälle mit Radfahrenden.';

const spec = (...titel: string[]) =>
  ({
    locale: 'de-DE',
    slides: [
      {
        background: { kind: 'farbe', color: 'hellgrau' },
        position: 'oben',
        align: 'zentriert',
        logo: false,
        items: [
          { type: 'headline', lines: ['Radweg', 'jetzt!'] },
          {
            type: 'infografik',
            form: 'raster',
            punkte: titel.map((t) => ({ titel: t, icon: 'fahrrad' })),
          },
        ],
      },
    ],
  }) as unknown as SharepicSpec;

const answers = (...a: [string, number][]) =>
  Object.fromEntries(a.map(([choice, confidence], i) => [`b${i + 1}`, { choice, confidence }]));

beforeEach(() => aiDecide.mockReset());

describe('falsifiedFigureClaims (#5480)', () => {
  it('sends a falsified figure back with what to fix', async () => {
    aiDecide.mockResolvedValueOnce(answers(['verfaelscht', 0.8], ['gedeckt', 0.9]));
    const error = await falsifiedFigureClaims(spec('17 Unfälle weniger', '2,4 km'), SOURCE);
    expect(error).toMatch(/"17 Unfälle weniger" sagt etwas anderes als der Auftrag/);
    expect(error).not.toContain('2,4 km');
  });

  it('asks only about texts with a figure, against the source around it', async () => {
    aiDecide.mockResolvedValueOnce(answers(['gedeckt', 0.9], ['gedeckt', 0.9]));
    await falsifiedFigureClaims(spec('17 Unfälle', '2,4 km'), SOURCE);
    const [{ state, questions }] = aiDecide.mock.calls[0] as [
      { state: string; questions: Record<string, unknown> },
    ];
    expect(Object.keys(questions)).toEqual(['b1', 'b2']);
    expect(state).toContain('QUELLE:\nDie 2,4 km lange Strecke');
    expect(state).toContain('1. 17 Unfälle\n2. 2,4 km');
    expect(state).not.toContain('Radweg jetzt');
  });

  it('lets an unsure verdict pass', async () => {
    aiDecide.mockResolvedValueOnce(answers(['verfaelscht', 0.3]));
    expect(await falsifiedFigureClaims(spec('17 Unfälle weniger'), SOURCE)).toBeNull();
  });

  it('fails open when no host answers', async () => {
    aiDecide.mockRejectedValueOnce(new Error('rate limited'));
    expect(await falsifiedFigureClaims(spec('17 Unfälle weniger'), SOURCE)).toBeNull();
  });

  it('asks nothing when no figure is on the draft or in the source', async () => {
    expect(hasFigureClaims(spec('Sicher radeln'))).toBe(false);
    expect(await falsifiedFigureClaims(spec('Sicher radeln'), SOURCE)).toBeNull();
    expect(await falsifiedFigureClaims(spec('99 Unfälle'), SOURCE)).toBeNull();
    expect(aiDecide).not.toHaveBeenCalled();
  });
});
