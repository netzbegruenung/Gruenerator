import { describe, expect, it } from 'vitest';

import { mentionableTextFormSchema, saveTextFormBodySchema } from './textForm.js';

const body = {
  title: 'OV-Einladung',
  examples: [],
  styleBlock: 'Schreibe kurz.',
};

describe('saveTextFormBodySchema.category', () => {
  it('accepts a known category', () => {
    expect(saveTextFormBodySchema.parse({ ...body, category: 'social' }).category).toBe('social');
  });

  it('keeps null valid, so a client can clear the category', () => {
    expect(saveTextFormBodySchema.parse({ ...body, category: null }).category).toBeNull();
  });

  it('stays optional: shipped clients do not send it', () => {
    expect(saveTextFormBodySchema.parse(body).category).toBeUndefined();
  });

  it('rejects a category outside the closed set', () => {
    expect(saveTextFormBodySchema.safeParse({ ...body, category: 'politik' }).success).toBe(false);
  });
});

describe('mentionableTextFormSchema.category', () => {
  it('falls back to null for a row without the field (old server)', () => {
    const parsed = mentionableTextFormSchema.parse({
      id: 'r1',
      mention: 'ov',
      title: 'OV',
      description: null,
      iconKey: null,
      kind: 'custom',
      sharedFromGroup: null,
      ownerName: null,
      isPublic: false,
    });
    expect(parsed.category).toBeNull();
  });
});
