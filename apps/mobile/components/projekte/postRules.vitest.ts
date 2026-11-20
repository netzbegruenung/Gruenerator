import { GROUP_POST_FILE_LIMIT, GROUP_POST_FILE_MAX_BYTES } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  addDraftFiles,
  buildPostActions,
  canDeletePost,
  canEditPost,
  canSubmitPost,
  canWritePost,
  toUploadFile,
  visibilityHint,
  type DraftFile,
} from './postRules';

const file = (name: string, size = 10): Omit<DraftFile, 'id'> => ({
  uri: `file:///${name}`,
  name,
  type: 'image/jpeg',
  size,
  isImage: true,
});
let n = 0;
const id = () => `id${n++}`;

describe('canWritePost', () => {
  it('allows team projects, never personal ones', () => {
    expect(canWritePost({ group_type: 'team' }, false)).toBe(true);
    expect(canWritePost({ group_type: 'personal' }, true)).toBe(false);
  });
  it('allows the system project only for admins', () => {
    expect(canWritePost({ group_type: 'team', is_system: true }, false)).toBe(false);
    expect(canWritePost({ group_type: 'team', is_system: true }, true)).toBe(true);
  });
});

describe('canEditPost / canDeletePost', () => {
  it('edit is author-only', () => {
    expect(canEditPost({ authorId: 'a' }, 'a')).toBe(true);
    expect(canEditPost({ authorId: 'a' }, 'b')).toBe(false);
    expect(canEditPost({ authorId: 'a' }, null)).toBe(false);
    expect(canEditPost({ authorId: null }, null)).toBe(false);
  });
  it('delete is author or admin', () => {
    expect(canDeletePost({ authorId: 'a' }, 'b', false)).toBe(false);
    expect(canDeletePost({ authorId: 'a' }, 'b', true)).toBe(true);
    expect(canDeletePost({ authorId: 'a' }, 'a', false)).toBe(true);
  });
});

describe('buildPostActions', () => {
  it('lists edit before a destructive delete, and nothing without rights', () => {
    const a = buildPostActions(true, true);
    expect(a.map((x) => x.id)).toEqual(['edit-post', 'delete-post']);
    expect(a[1]?.attributes?.destructive).toBe(true);
    expect(buildPostActions(false, true).map((x) => x.id)).toEqual(['delete-post']);
    expect(buildPostActions(false, false)).toEqual([]);
  });
});

describe('visibilityHint', () => {
  it('names the audience', () => {
    expect(visibilityHint(null)).toBe('Alle im Grünerator sehen den Beitrag');
    expect(visibilityHint(1)).toBe('Nur du siehst den Beitrag');
    expect(visibilityHint(12)).toBe('Alle 12 Mitglieder sehen den Beitrag');
  });
});

describe('addDraftFiles', () => {
  it('rejects oversize files with a reason and keeps the rest', () => {
    const r = addDraftFiles(
      [],
      [file('a.jpg'), file('big.pdf', GROUP_POST_FILE_MAX_BYTES + 1)],
      id
    );
    expect(r.files.map((f) => f.name)).toEqual(['a.jpg']);
    expect(r.error).toContain('big.pdf');
  });
  it('stops at the file limit', () => {
    const existing = addDraftFiles(
      [],
      Array.from({ length: GROUP_POST_FILE_LIMIT - 1 }, (_, i) => file(`f${i}`)),
      id
    ).files;
    const r = addDraftFiles(existing, [file('x'), file('y')], id);
    expect(r.files).toHaveLength(GROUP_POST_FILE_LIMIT);
    expect(r.error).toContain(String(GROUP_POST_FILE_LIMIT));
  });
  it('gives every file its own id', () => {
    const r = addDraftFiles([], [file('a'), file('b')], id);
    expect(new Set(r.files.map((f) => f.id)).size).toBe(2);
  });
});

describe('toUploadFile / canSubmitPost', () => {
  it('maps to the react native upload shape', () => {
    const f = addDraftFiles([], [file('a.jpg')], id).files[0]!;
    expect(toUploadFile(f)).toEqual({ uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' });
  });
  it('needs text or a file, and no request in flight', () => {
    expect(canSubmitPost('  ', 0, false, false)).toBe(false);
    expect(canSubmitPost('', 1, false, false)).toBe(true);
    expect(canSubmitPost('hi', 0, true, false)).toBe(false);
    expect(canSubmitPost('hi', 0, false, true)).toBe(false);
  });
});
