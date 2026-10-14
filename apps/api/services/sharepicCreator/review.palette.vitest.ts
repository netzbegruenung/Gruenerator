import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));
vi.mock('./toJpegBase64.js', () => ({ toJpegBase64: async () => 'jpeg' }));

import { reviewSharepic } from './review.js';

const spec: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'hellgrau' },
      position: 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Klimaschutz', 'vor Ort'] }],
      logo: false,
    },
  ],
};

describe('reviewSharepic — a colour outside the palette', () => {
  it('names the closest colour and takes an off-palette patch without a retry', async () => {
    aiObject.mockResolvedValueOnce({ ok: true, data: { ok: true, issues: [], patch: [] } });
    await reviewSharepic(spec, 'Ändere die Hintergrundfarbe auf Sand', 'data:image/png;base64,x');

    const call = aiObject.mock.calls[0]![0] as {
      messages: { content: { type: string; text?: string }[] }[];
      validate: (input: unknown) => { ok: boolean; value?: { patch: unknown[] } };
    };
    const text = call.messages[0]!.content.find((c) => c.type === 'text')!.text!;
    expect(text).toContain('„Sand“ gibt es im Sharepic-Baukasten nicht');
    const checked = call.validate({
      ok: false,
      issues: ['Kein Sand'],
      patch: [{ op: 'set_color', color: 'sand' }],
    });
    expect(checked.ok).toBe(true);
    expect(checked.value?.patch).toEqual([{ op: 'set_color', color: 'creme' }]);
  });
});
