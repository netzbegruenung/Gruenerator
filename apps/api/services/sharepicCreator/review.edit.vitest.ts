import { type SharepicSpec } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));
vi.mock('./toJpegBase64.js', () => ({ toJpegBase64: async () => 'jpeg' }));

import { reviewSharepic } from './review.js';

const spec: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'tanne' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Mobilität', 'für alle'] }],
      logo: false,
    },
  ],
};

const RULE = 'mach sie nie rückgängig und widersprich ihr nicht';

function sent(): { system: string; text: string } {
  const call = aiObject.mock.calls[0]![0] as {
    system: string;
    messages: { content: { type: string; text?: string }[] }[];
  };
  return {
    system: call.system,
    text: call.messages[0]!.content.find((c) => c.type === 'text')!.text!,
  };
}

describe('reviewSharepic — after an edit', () => {
  beforeEach(() => aiObject.mockReset());

  it('takes the request as the change and forbids reverting it', async () => {
    aiObject.mockResolvedValueOnce({ ok: true, data: { ok: true, issues: [], patch: [] } });
    await reviewSharepic(spec, 'Schrift der Headline größer', 'data:image/png;base64,x', 'edit');

    const { system, text } = sent();
    expect(text).toContain('Änderungswunsch der Person');
    expect(text).toContain('Schrift der Headline größer');
    expect(`${system}\n${text}`).toContain(RULE);
  });

  it('keeps the freitext review as it was', async () => {
    aiObject.mockResolvedValueOnce({ ok: true, data: { ok: true, issues: [], patch: [] } });
    await reviewSharepic(spec, 'Mobilität für alle', 'data:image/png;base64,x');

    const { system, text } = sent();
    expect(text).toContain('Auftrag:\nMobilität für alle');
    expect(`${system}\n${text}`).not.toContain(RULE);
  });

  it('counts slides from 1 as „Folie" where the person reads the issues', async () => {
    aiObject.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: false,
        issues: ['Die Headline auf Slide 0 ist zu groß.', 'Slides 2 wirkt leer.'],
        patch: [],
      },
    });
    const review = await reviewSharepic(spec, 'x', 'data:image/png;base64,x', 'edit');

    expect(review.issues).toEqual(['Die Headline auf Folie 1 ist zu groß.', 'Folie 3 wirkt leer.']);
  });

  it('names a slide once when the model already added its „Folie" label', async () => {
    aiObject.mockResolvedValueOnce({
      ok: true,
      data: {
        ok: false,
        issues: [
          'Die Hintergrundfarbe der Slide 1 (Folie 2) ist zu dunkel.',
          'Folie 3 (Slide 2) wirkt leer.',
          'Auf Folie 1 ist die Headline zu groß.',
        ],
        patch: [],
      },
    });
    const review = await reviewSharepic(spec, 'x', 'data:image/png;base64,x', 'edit');

    expect(review.issues).toEqual([
      'Die Hintergrundfarbe der Folie 2 ist zu dunkel.',
      'Folie 3 wirkt leer.',
      'Auf Folie 1 ist die Headline zu groß.',
    ]);
  });
});
