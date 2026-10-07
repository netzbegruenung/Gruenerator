import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../../../services/ai/generate.js', () => ({ aiObject }));

import { GEMMA_31B_ON_MELIOUS } from '../../../services/ai/gemmaHosts.js';

import { checkCanvasEdit, validateCheck } from './canvasAiCheck.js';

let IMAGE = '';

beforeAll(async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  IMAGE = `data:image/png;base64,${png.toString('base64')}`;
});

beforeEach(() => {
  aiObject.mockReset();
});

describe('validateCheck', () => {
  it('keeps at most three issues, as text objects, and drops blanks', () => {
    const result = validateCheck({ ok: false, issues: ['a', ' ', 'b', 'c', 'd'] });
    expect(result).toEqual({
      ok: true,
      value: { ok: false, issues: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
    });
  });

  it('rejects a payload without ok', () => {
    expect(validateCheck({ issues: [] }).ok).toBe(false);
  });
});

describe('checkCanvasEdit', () => {
  it('reports ok for a clean page and pins Gemma with the image part', async () => {
    aiObject.mockResolvedValue({ ok: true, data: { ok: true, issues: [] } });
    const res = await checkCanvasEdit(IMAGE, 'Kürze den Text');
    expect(res).toEqual({ ok: true, issues: [] });
    const call = aiObject.mock.calls[0]![0] as {
      pinned: unknown;
      messages: { content: { text?: string }[] }[];
    };
    expect(call.pinned).toEqual({
      provider: GEMMA_31B_ON_MELIOUS.provider,
      model: GEMMA_31B_ON_MELIOUS.model,
    });
    expect(call.messages[0].content[0]).toMatchObject({
      type: 'image',
      source: { media_type: 'image/jpeg' },
    });
    expect(call.messages[0].content[1].text).toContain('Kürze den Text');
  });

  it('passes issues through', async () => {
    aiObject.mockResolvedValue({
      ok: true,
      data: { ok: false, issues: [{ text: 'Text läuft aus dem Bild.' }] },
    });
    expect(await checkCanvasEdit(IMAGE, 'x')).toEqual({
      ok: false,
      issues: [{ text: 'Text läuft aus dem Bild.' }],
    });
  });

  it('fails soft when the model rejects', async () => {
    aiObject.mockResolvedValue({ ok: false, error: 'bad json' });
    expect(await checkCanvasEdit(IMAGE, 'x')).toEqual({ ok: true, issues: [] });
  });

  it('fails soft when the call throws', async () => {
    aiObject.mockRejectedValue(new Error('down'));
    expect(await checkCanvasEdit(IMAGE, 'x')).toEqual({ ok: true, issues: [] });
  });
});
