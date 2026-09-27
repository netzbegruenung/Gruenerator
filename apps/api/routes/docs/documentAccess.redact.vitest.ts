/**
 * redactDocumentForReader — strips the collaborator ACL and internal wolke_*
 * fields before a document row is returned to a reader who is neither owner nor
 * editor. Regression guard for the resolve/getDocumentById info-disclosure fix:
 * previously `cd.*` leaked every collaborator user id (and Nextcloud sync paths)
 * to viewers and anonymous public-link readers.
 */

import { describe, expect, it } from 'vitest';

import { redactDocumentForReader } from './documentAccess.js';

const baseDoc = () => ({
  id: 'doc-1',
  title: 'Antrag',
  created_by: 'owner-1',
  share_mode: 'public' as const,
  share_permission: 'viewer' as const,
  is_public: true,
  permissions: {
    'owner-1': { level: 'owner', granted_at: 't0' },
    'editor-2': { level: 'editor', granted_at: 't1' },
    'viewer-3': { level: 'viewer', granted_at: 't2' },
  } as Record<string, { level?: string; granted_at?: string }>,
  wolke_share_link_id: 'nc-link-abc',
  wolke_file_path: '/Grünerator/geheim.md',
  wolke_etag: 'etag-1',
});

describe('redactDocumentForReader', () => {
  it('returns the full row untouched for the owner', () => {
    const doc = baseDoc();
    const out = redactDocumentForReader(doc, 'owner-1');
    expect(out).toBe(doc);
    expect(Object.keys(out.permissions)).toHaveLength(3);
    expect(out.wolke_file_path).toBe('/Grünerator/geheim.md');
  });

  it('returns the full row untouched for a granted editor', () => {
    const doc = baseDoc();
    const out = redactDocumentForReader(doc, 'editor-2');
    expect(out).toBe(doc);
    expect(out.permissions['viewer-3']).toBeDefined();
  });

  it('reduces the permissions map to the reader’s own entry for a viewer', () => {
    const out = redactDocumentForReader(baseDoc(), 'viewer-3');
    expect(Object.keys(out.permissions ?? {})).toEqual(['viewer-3']);
    expect(out.permissions?.['owner-1']).toBeUndefined();
    expect(out.permissions?.['editor-2']).toBeUndefined();
  });

  it('strips all wolke_* fields for a non-privileged reader', () => {
    const out = redactDocumentForReader(baseDoc(), 'viewer-3') as Record<string, unknown>;
    expect(out.wolke_share_link_id).toBeUndefined();
    expect(out.wolke_file_path).toBeUndefined();
    expect(out.wolke_etag).toBeUndefined();
    // Non-sensitive fields survive.
    expect(out.title).toBe('Antrag');
    expect(out.share_permission).toBe('viewer');
  });

  it('drops the permissions map entirely for an anonymous reader', () => {
    const out = redactDocumentForReader(baseDoc(), null);
    expect(out.permissions).toBeNull();
    expect((out as Record<string, unknown>).wolke_share_link_id).toBeUndefined();
  });

  it('returns null permissions for an authenticated reader with no entry', () => {
    const doc = baseDoc();
    const out = redactDocumentForReader(doc, 'stranger-9');
    expect(out.permissions).toBeNull();
  });

  it('does not mutate the original document object', () => {
    const doc = baseDoc();
    redactDocumentForReader(doc, 'viewer-3');
    expect(Object.keys(doc.permissions)).toHaveLength(3);
    expect(doc.wolke_file_path).toBe('/Grünerator/geheim.md');
  });
});
