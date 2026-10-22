/**
 * canWriteDocument must answer exactly as the Hocuspocus connection does
 * (`readOnly` in services/hocuspocus/src/auth.ts): the REST layer refused
 * project editors a canvas they could edit live, and let an explicit viewer
 * write through an editor link (#4887). The same cases are pinned on the
 * Hocuspocus side in services/hocuspocus/src/auth.vitest.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { canWriteDocument, checkDocumentWriteAccess } = await import('./documentAccess.js');

type Group = { read?: boolean; write?: boolean } | null;

function primeDb(group: Group, doc: Record<string, unknown> | null = null) {
  query.mockReset().mockImplementation(async (sql: string) => {
    if (/FROM group_content_shares/i.test(sql)) {
      return group ? [{ content_type: 'collaborative_documents', permissions: group }] : [];
    }
    if (/FROM collaborative_documents/i.test(sql)) return doc ? [doc] : [];
    return [];
  });
}

const doc = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  created_by: 'owner-1',
  permissions: {},
  is_public: false,
  share_mode: 'private',
  share_permission: null,
  ...overrides,
});

const viewerEntry = { 'user-9': { level: 'viewer' } };

const cases: [string, Record<string, unknown>, Group, boolean][] = [
  ['the owner', { created_by: 'user-9' }, null, true],
  ['a direct editor', { permissions: { 'user-9': { level: 'editor' } } }, null, true],
  [
    'an explicit viewer on an editor link',
    { permissions: viewerEntry, share_mode: 'authenticated', share_permission: 'editor' },
    null,
    false,
  ],
  [
    'an explicit viewer on a public editor link',
    { permissions: viewerEntry, is_public: true, share_mode: 'public', share_permission: 'editor' },
    null,
    false,
  ],
  ['an editor link', { share_mode: 'authenticated', share_permission: 'editor' }, null, true],
  ['a public link without share_permission', { is_public: true, share_mode: 'public' }, null, true],
  [
    'a viewer link, even with a project write share',
    { share_mode: 'authenticated', share_permission: 'viewer' },
    { read: true, write: true },
    false,
  ],
  ['a project write share', {}, { read: true, write: true }, true],
  ['a project read share', {}, { read: true, write: false }, false],
  ['a project share with read off', {}, { read: false, write: true }, false],
  [
    'an entry without a level, even with a project write share',
    { permissions: { 'user-9': {} } },
    { read: true, write: true },
    false,
  ],
  ['nobody in particular', {}, null, false],
];

describe('canWriteDocument', () => {
  beforeEach(() => primeDb(null));

  it.each(cases)('%s', async (_name, overrides, group, expected) => {
    primeDb(group);
    expect(await canWriteDocument(doc(overrides), 'user-9')).toBe(expected);
  });

  it('counts a canvas_template project share like Hocuspocus does', async () => {
    primeDb({ read: true, write: true });
    await canWriteDocument(doc(), 'user-9');
    const groupSql = query.mock.calls
      .map(([sql]) => sql as string)
      .find((sql) => /FROM group_content_shares/i.test(sql));
    expect(groupSql).toContain("'canvas_template'");
  });
});

describe('checkDocumentWriteAccess', () => {
  it('applies the same rule to the stored row', async () => {
    primeDb({ read: true, write: true }, doc());
    expect(await checkDocumentWriteAccess('doc-1', 'user-9')).toBe(true);
  });

  it('refuses a document that does not exist', async () => {
    primeDb(null, null);
    expect(await checkDocumentWriteAccess('doc-1', 'user-9')).toBe(false);
  });
});
