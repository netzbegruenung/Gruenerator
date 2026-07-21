import { describe, it, expect } from 'vitest';

import {
  chatStreamEventSchemas,
  searchIntentSchema,
  sharepicVariantSchema,
} from '@gruenerator/contracts';

import { coerceSharepicVariants } from '../../hooks/useChatGraphStream';

/**
 * The parser validates every known SSE event against
 * `chatStreamEventSchemas` before its switch. These tests pin the gate's
 * contract: real payloads pass (including unknown extra fields —
 * passthrough), malformed ones are rejected, and the sharepic canvasType
 * enum is enforced where it protects the live store / studio handoff.
 */
describe('chatStreamEventSchemas gate', () => {
  it('accepts a real sharepic_updated payload and keeps extra fields', () => {
    const schema = chatStreamEventSchemas['sharepic_updated'];
    const result = schema!.safeParse({
      variantId: 'v1',
      canvasId: 'c1',
      version: 2,
      canvasType: 'dreizeilen',
      state: { line1: 'Hallo' },
      summary: 'Zeile gekürzt',
      futureField: 'kept',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).futureField).toBe('kept');
    }
  });

  it('rejects sharepic_updated with a non-canonical canvasType', () => {
    const result = chatStreamEventSchemas['sharepic_updated']!.safeParse({
      variantId: 'v1',
      canvasId: 'c1',
      version: 2,
      canvasType: 'not-a-template',
      summary: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('accepts every backend intent value on the intent event', () => {
    const schema = chatStreamEventSchemas['intent']!;
    for (const intent of searchIntentSchema.options) {
      expect(schema.safeParse({ intent, message: 'Los...' }).success).toBe(true);
    }
    expect(schema.safeParse({ intent: 'unknown_intent', message: 'x' }).success).toBe(false);
  });

  it('rejects text_delta without text but accepts extra fields', () => {
    const schema = chatStreamEventSchemas['text_delta']!;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ text: 'hi', seq: 4 }).success).toBe(true);
  });

  it('done stays loose: everything optional, unknown fields survive', () => {
    const schema = chatStreamEventSchemas['done']!;
    const result = schema.safeParse({
      threadId: 't1',
      citations: [],
      boardId: 'b1',
      boardGeneratedStructure: { rows: [] },
      metadata: { intent: 'direct', searchCount: 0 },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).boardId).toBe('b1');
    }
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('social_post_updated requires the full post payload', () => {
    const schema = chatStreamEventSchemas['social_post_updated']!;
    expect(
      schema.safeParse({
        postId: 'p1',
        summary: 'kürzer',
        post: {
          postId: 'p1',
          platform: 'instagram',
          text: 'Hallo #Gruen',
          hashtags: ['#Gruen'],
          charCount: 12,
          version: 2,
        },
      }).success
    ).toBe(true);
    expect(schema.safeParse({ postId: 'p1', summary: 'kürzer' }).success).toBe(false);
  });

  it('reel_updated pins the segment shape', () => {
    const schema = chatStreamEventSchemas['reel_updated']!;
    const base = { projectId: 'p', title: 't', summary: 's', changedIndices: [0] };
    expect(
      schema.safeParse({
        ...base,
        segments: [{ id: 1, startTime: 0, endTime: 2.5, text: 'Hi' }],
      }).success
    ).toBe(true);
    expect(schema.safeParse({ ...base, segments: [{ id: 'x', startTime: 'bad' }] }).success).toBe(
      false
    );
  });
});

describe('coerceSharepicVariants (schema-based)', () => {
  it('keeps valid variants and drops malformed ones individually', () => {
    const result = coerceSharepicVariants([
      { id: 'v1', canvasType: 'dreizeilen', initialProps: { line1: 'a' } },
      { id: 'v2', canvasType: 'junk-type', initialProps: {} },
      { id: 'v3', canvasType: 'info', initialProps: null },
    ]);
    expect(result?.map((v) => v.id)).toEqual(['v1']);
  });

  it('returns null for non-arrays and empty results', () => {
    expect(coerceSharepicVariants('nope')).toBe(null);
    expect(coerceSharepicVariants([{ id: 1 }])).toBe(null);
  });

  it('sharepicVariantSchema keeps deck pages and passthrough fields', () => {
    const parsed = sharepicVariantSchema.safeParse({
      id: 'd1',
      canvasType: 'slider',
      initialProps: {},
      canvasId: 'c9',
      pages: [{ headline: 'A' }, { headline: 'B' }],
      newField: true,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.pages?.length).toBe(2);
      expect((parsed.data as Record<string, unknown>).newField).toBe(true);
    }
  });
});
