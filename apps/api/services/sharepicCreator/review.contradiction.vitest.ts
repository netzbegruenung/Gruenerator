import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));
vi.mock('./toJpegBase64.js', () => ({ toJpegBase64: async () => 'jpeg' }));

import { reviewSharepic } from './review.js';

const INVITATION =
  'Komm zu unserer Offenen Fraktionssitzung über die Entwicklung von Brachflächen in Chemnitz.';

const spec: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'foto-oben', filename: 'x.jpg', panelColor: 'mint' },
      position: 'oben',
      align: 'links',
      items: [
        { type: 'headline', lines: ['Vom Altstandort zum', '==Zukunftsquartier=='] },
        { type: 'text', text: INVITATION },
      ],
      datum: { date: '26.10.', time: '17 Uhr' },
      ort: { lines: ['fabrik'] },
      logo: true,
    },
  ],
};

async function validate(patch: unknown[]) {
  aiObject.mockResolvedValueOnce({ ok: true, data: { ok: true, issues: [], patch: [] } });
  await reviewSharepic(spec, 'Offene Fraktionssitzung in der fabrik', 'data:image/png;base64,x');
  const call = aiObject.mock.calls.at(-1)![0] as {
    validate: (input: unknown) => { ok: boolean; value?: { patch: unknown[] } };
  };
  return call.validate({ ok: false, issues: ['Der Ort steht verloren.'], patch });
}

describe('reviewSharepic — a patch that rewrites and removes the same item', () => {
  it('keeps the item (live 21.10.2026: the invitation vanished)', async () => {
    const setText = { slide: 0, op: 'set_text', item: 1, text: INVITATION };
    const checked = await validate([{ slide: 0, op: 'remove_item', item: 1 }, setText]);
    expect(checked.ok).toBe(true);
    expect(checked.value?.patch).toEqual([setText]);
  });

  it('still removes an item nothing else touches', async () => {
    const remove = { slide: 0, op: 'remove_item', item: 1 };
    const checked = await validate([remove]);
    expect(checked.value?.patch).toEqual([remove]);
  });
});
