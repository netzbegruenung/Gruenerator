import { NON_LIBRARY_UPLOAD_SOURCES } from '@gruenerator/shared/media-library/constants';
import { describe, expect, it } from 'vitest';

import {
  LIBRARY_ITEM_CLAUSE,
  USER_VISIBLE_SHARE_STATUSES,
  assetPoolWhere,
  creationFeedWhere,
} from './sharedMediaFilters.js';
import { SOURCE_CONTENT_ORIGINS } from './sharedMediaOrigin.js';

/**
 * The point of these tests is the *contrast* between the two predicates, not
 * either one on its own. Asserting only that creation feeds hide internal
 * artifacts would still pass if that filter had leaked into the Mediathek and
 * emptied the asset pool — which is exactly the failure mode this module exists
 * to prevent, three surfaces having to be kept in step by hand.
 */
describe('creationFeedWhere', () => {
  it('excludes internal artifacts and source images, tolerating rows older than either column', () => {
    const params: unknown[] = ['user-1'];
    const sql = creationFeedWhere(params, USER_VISIBLE_SHARE_STATUSES);

    expect(sql).toContain('upload_source IS NULL OR upload_source != ALL($2)');
    expect(params[1]).toEqual([...NON_LIBRARY_UPLOAD_SOURCES]);
    expect(sql).toContain('content_origin IS NULL OR content_origin != ALL($3)');
    expect(params[2]).toEqual([...SOURCE_CONTENT_ORIGINS]);
  });

  it("keeps 'unknown' origins visible — the backfill could not classify those rows", () => {
    const params: unknown[] = ['user-1'];
    creationFeedWhere(params, null);
    expect(params[2]).toEqual(['upload']);
    expect(params[2]).not.toContain('unknown');
  });

  it('numbers its placeholders off the params it was handed, not from $1', () => {
    const params: unknown[] = ['user-1', 'image', 'something-else'];
    const sql = creationFeedWhere(params, ['ready']);

    expect(sql).toContain('$4');
    expect(sql).toContain('$5');
    expect(sql).toContain('status = ANY($6)');
    expect(params).toHaveLength(6);
  });

  it('keeps drafts visible — canvas autosave never promotes to ready on its own', () => {
    const params: unknown[] = ['user-1'];
    creationFeedWhere(params, USER_VISIBLE_SHARE_STATUSES);
    expect(params[3]).toEqual(['ready', 'draft']);
  });

  it('takes a single status, and omits the status clause entirely for null', () => {
    const single: unknown[] = ['user-1'];
    expect(creationFeedWhere(single, 'ready')).toContain('status = $4');
    expect(single[3]).toBe('ready');

    const none: unknown[] = ['user-1'];
    const sql = creationFeedWhere(none, null);
    expect(sql).not.toContain('status');
    expect(none).toHaveLength(3);
  });

  it('never filters on is_library_item — that column belongs to the asset pool', () => {
    expect(creationFeedWhere(['user-1'], null)).not.toContain('is_library_item');
  });
});

describe('assetPoolWhere', () => {
  it('is ready-only and library-only, and binds nothing', () => {
    const sql = assetPoolWhere();
    expect(sql).toContain("status = 'ready'");
    expect(sql).toContain(LIBRARY_ITEM_CLAUSE);
    expect(sql).not.toMatch(/\$\d/);
  });

  it('does NOT exclude uploads — the Mediathek is where they belong', () => {
    expect(assetPoolWhere()).not.toContain('upload_source');
    expect(assetPoolWhere()).not.toContain('content_origin');
  });
});
