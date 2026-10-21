import { sharepicPatchOpSchema, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const aiObject = vi.hoisted(() => vi.fn());
vi.mock('../ai/generate.js', () => ({ aiObject }));
vi.mock('./toJpegBase64.js', () => ({ toJpegBase64: async () => 'jpeg' }));

import { reviewSharepic } from './review.js';
import { structureOf } from './toolSchema.js';

/** Objects a forced tool call can only fill with `{}` (21.10.2026). */
function openObjects(node: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(node)) node.forEach((n) => openObjects(n, found));
  else if (node && typeof node === 'object') {
    const n = node as Record<string, unknown>;
    if (n.type === 'object' && !n.properties && !n.anyOf) found.push(n);
    Object.values(n).forEach((v) => openObjects(v, found));
  }
  return found;
}

describe('structureOf', () => {
  it('keeps the shape and drops the content limits', () => {
    const schema = structureOf(
      z.object({ text: z.string().max(24), maximum: z.number().max(3) }).strict()
    );
    expect(schema).toEqual({
      type: 'object',
      properties: { text: { type: 'string' }, maximum: { type: 'number' } },
      required: ['text', 'maximum'],
    });
  });

  it('declares every patch op', () => {
    const ops = structureOf(sharepicPatchOpSchema);
    expect(openObjects(ops)).toEqual([]);
    expect((ops.anyOf as unknown[]).length).toBe(sharepicPatchOpSchema.options.length);
  });
});

describe('the review tool schema', () => {
  it('declares the patch ops it asks for', async () => {
    aiObject.mockResolvedValueOnce({ ok: true, data: { ok: true, issues: [], patch: [] } });
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
    await reviewSharepic(spec, 'Mobilität für alle', 'data:image/png;base64,x');
    expect(openObjects((aiObject.mock.calls[0]![0] as { schema: unknown }).schema)).toEqual([]);
  });
});
