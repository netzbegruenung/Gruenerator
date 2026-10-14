import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));

import { draftSharepic } from './draftAgent.js';

const slide = (color: 'tanne' | 'mint') => ({
  background: { kind: 'farbe' as const, color },
  position: 'mitte' as const,
  align: 'links' as const,
  logo: true,
  items: [{ type: 'headline' as const, lines: ['Mehr Busse', 'für alle'] }],
});
const deck: SharepicSpec = { locale: 'de-DE', slides: [slide('tanne'), slide('mint')] };

describe('draftSharepic — a carousel revision with a focus', () => {
  beforeEach(() => {
    aiObject.mockReset();
    aiObject
      .mockResolvedValueOnce({
        ok: true,
        data: {
          land: 'de-DE',
          anlass: [],
          kapitel: [],
          fotos_suchen: [],
          form: 'karussell',
          alternativen: [],
        },
      })
      .mockResolvedValueOnce({ ok: true, data: { spec: deck, scene: null } });
  });

  it('lets a wish the focused slide already shows reach the other slides', async () => {
    // Live: „Hintergrundfarbe auf Tanne“ while looking at the Tanne slide left Folie 2 mint.
    await draftSharepic(
      'Ändere die Hintergrundfarbe auf Tanne.',
      'de-DE',
      deck,
      [],
      {},
      null,
      'Ändere die Hintergrundfarbe auf Tanne.',
      { slide: 0 }
    );
    const prompt = (aiObject.mock.calls[1]![0] as { prompt: string }).prompt;
    expect(prompt).toContain('Ändere nur Folie 1');
    expect(prompt).toContain('zeigt Folie 1 das schon');
  });
});
