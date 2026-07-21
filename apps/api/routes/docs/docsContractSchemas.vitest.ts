import {
  collabSubtypeSchema,
  shareSettingsSchema,
  updateDocumentBodySchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

describe('updateDocumentBodySchema', () => {
  it('accepts a title-only rename and a folder move', () => {
    expect(updateDocumentBodySchema.safeParse({ title: 'Neuer Titel' }).success).toBe(true);
    expect(updateDocumentBodySchema.safeParse({ folder_id: 'f-1' }).success).toBe(true);
    expect(updateDocumentBodySchema.safeParse({}).success).toBe(true);
  });

  it('accepts null for unset optional fields (nullish convention)', () => {
    expect(updateDocumentBodySchema.safeParse({ folder_id: null }).success).toBe(true);
  });

  it('rejects a wrongly-typed field', () => {
    expect(updateDocumentBodySchema.safeParse({ title: 42 }).success).toBe(false);
    expect(updateDocumentBodySchema.safeParse({ wolke_live_sync: 'yes' }).success).toBe(false);
  });
});

describe('collabSubtypeSchema (closed set)', () => {
  it('accepts known subtypes and rejects unknown ones', () => {
    expect(collabSubtypeSchema.safeParse('boards').success).toBe(true);
    expect(collabSubtypeSchema.safeParse('sheets').success).toBe(true);
    expect(collabSubtypeSchema.safeParse('not-a-subtype').success).toBe(false);
  });
});

describe('shareSettingsSchema (enum fields, not free strings)', () => {
  it('accepts valid share_mode/share_permission and rejects out-of-set values', () => {
    expect(
      shareSettingsSchema.safeParse({
        is_public: true,
        share_permission: 'editor',
        share_mode: 'public',
      }).success
    ).toBe(true);
    expect(
      shareSettingsSchema.safeParse({
        is_public: true,
        share_permission: 'admin',
        share_mode: 'public',
      }).success
    ).toBe(false);
  });
});
