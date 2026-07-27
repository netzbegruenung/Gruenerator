import { describe, expect, it } from 'vitest';

import { DOC_EXCERPT_CHARS, docListColumns } from './constants.js';

/**
 * `?preview=true` exists to keep whole documents out of a list response. The one
 * way it can fail silently is by still selecting `content` — the payload would
 * stay exactly as large while everything downstream believed it had shrunk.
 */

describe('docListColumns', () => {
  it('is unchanged for callers that do not ask for a preview', () => {
    // Web reads this list and renders rich previews from the body. Anything but
    // `cd.*` here is a breaking change for it.
    expect(docListColumns(false)).toBe('cd.*');
  });

  it('never selects the full content in preview mode', () => {
    const sql = docListColumns(true);
    expect(sql).not.toMatch(/\bcd\.content\b(?!,)/);
    expect(sql).not.toContain('cd.*');
  });

  it('truncates the excerpt to the documented budget', () => {
    expect(docListColumns(true)).toContain(`LEFT(cd.content, ${DOC_EXCERPT_CHARS})`);
    expect(docListColumns(true)).toContain('AS content_excerpt');
  });

  it('still selects everything the response schema declares', () => {
    // Dropping one of these would remove a field from the preview response that
    // callers of the non-preview response can rely on.
    const sql = docListColumns(true);
    for (const column of [
      'id',
      'title',
      'created_by',
      'created_at',
      'updated_at',
      'last_edited_by',
      'document_subtype',
      'folder_id',
      'permissions',
      'is_public',
      'share_mode',
      'share_permission',
      'is_deleted',
    ]) {
      expect(sql).toContain(`cd.${column}`);
    }
  });

  it('qualifies every column with the table alias', () => {
    // The list query joins `profiles` twice; an unqualified `id` or `title`
    // would be ambiguous and fail at runtime, not at build time.
    //
    // Only the plain columns are split on commas — the excerpt expression
    // carries one of its own inside `LEFT(...)`.
    const sql = docListColumns(true);
    const plainColumns = sql.slice(0, sql.indexOf('LEFT(')).split(',');
    for (const part of plainColumns) {
      if (part.trim()) expect(part.trim()).toMatch(/^cd\./);
    }
  });
});
