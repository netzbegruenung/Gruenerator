/**
 * Schema-level tests that lock the wolke_folders contract.
 *
 * A user reported that wolke_folders disappear on page reload. The save → read
 * roundtrip in `notebookCollectionsContractRouter.ts` looks correct, but Zod
 * schemas are the most plausible silent-stripper: `.object()` defaults to
 * `strip` mode and any field missing from the schema would be removed during
 * parse without an error.
 *
 * These tests assert wolke_folders survives:
 *   1. `createCollectionBodySchema` parse (frontend → server body)
 *   2. `updateCollectionBodySchema` parse (frontend → server body)
 *   3. `transformedCollectionSchema` parse (server response → frontend)
 *   4. The full editor payload schema (frontend internal save type)
 *
 * If any of these strips the field, this test catches it. If they all
 * preserve, the bug is elsewhere (storage layer, deploy lag, or browser cache).
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { describe, it, expect } from 'vitest';

import {
  createCollectionBodySchema,
  notebookEditorSavePayloadSchema,
  transformedCollectionSchema,
  updateCollectionBodySchema,
  type WolkeFolderRef,
} from '@gruenerator/contracts';

const sampleFolder: WolkeFolderRef = {
  shareLinkId: 'share-abc-123',
  shareLabel: 'My Wolke',
  folderPath: '',
  folderName: 'My Wolke',
  lastSyncedAt: '2026-05-16T01:00:00.000Z',
};

const sampleFolderMinimal: WolkeFolderRef = {
  shareLinkId: 'share-xyz-456',
  folderPath: 'subdir/',
  folderName: 'Sub',
  lastSyncedAt: null,
};

describe('wolke_folders schema contract', () => {
  it('createCollectionBodySchema preserves wolke_folders through parse', () => {
    const input = {
      name: 'Test Notebook',
      description: 'desc',
      selection_mode: 'documents' as const,
      document_ids: ['doc-1'],
      wolke_folders: [sampleFolder, sampleFolderMinimal],
    };
    const parsed = createCollectionBodySchema.parse(input);
    expect(parsed.wolke_folders).toHaveLength(2);
    expect(parsed.wolke_folders?.[0]).toEqual(sampleFolder);
    expect(parsed.wolke_folders?.[1]).toEqual(sampleFolderMinimal);
  });

  it('updateCollectionBodySchema preserves wolke_folders through parse', () => {
    const input = {
      name: 'Updated Notebook',
      wolke_folders: [sampleFolder],
    };
    const parsed = updateCollectionBodySchema.parse(input);
    expect(parsed.wolke_folders).toEqual([sampleFolder]);
  });

  it('updateCollectionBodySchema preserves empty wolke_folders array', () => {
    // Empty array is a meaningful signal: "user removed all folders". Must
    // not be silently dropped to undefined, or the server cannot distinguish
    // "no change requested" from "clear all folders".
    const parsed = updateCollectionBodySchema.parse({
      name: 'Updated',
      wolke_folders: [],
    });
    expect(Array.isArray(parsed.wolke_folders)).toBe(true);
    expect(parsed.wolke_folders).toHaveLength(0);
  });

  it('transformedCollectionSchema surfaces wolke_folders on read', () => {
    const serverResponse = {
      id: 'notebook-1',
      user_id: 'user-1',
      name: 'Test',
      description: null,
      custom_prompt: null,
      selection_mode: 'documents',
      auto_sync: false,
      remove_missing_on_sync: false,
      created_at: '2026-05-16T00:00:00.000Z',
      updated_at: '2026-05-16T01:00:00.000Z',
      documents: [],
      document_count: 0,
      wolke_share_links: [],
      has_wolke_sources: false,
      documents_from_wolke: 0,
      wolke_folders: [sampleFolder],
    };
    const parsed = transformedCollectionSchema.parse(serverResponse);
    expect(parsed.wolke_folders).toEqual([sampleFolder]);
  });

  it('notebookEditorSavePayloadSchema preserves wolkeFolders (camelCase)', () => {
    const payload = {
      name: 'Test',
      description: '',
      selectionMode: 'documents' as const,
      documents: ['doc-1'],
      documentMeta: [{ id: 'doc-1', title: 'Document 1' }],
      labels: [],
      isPublic: false,
      publicOwnership: null,
      wolkeFolders: [sampleFolder, sampleFolderMinimal],
    };
    const parsed = notebookEditorSavePayloadSchema.parse(payload);
    expect(parsed.wolkeFolders).toHaveLength(2);
    expect(parsed.wolkeFolders[0]).toEqual(sampleFolder);
  });

  it('notebookEditorSavePayloadSchema defaults wolkeFolders to [] when missing', () => {
    const payload = {
      name: 'Test',
      description: '',
      selectionMode: 'documents' as const,
      documents: ['doc-1'],
      documentMeta: [{ id: 'doc-1', title: 'Document 1' }],
      labels: [],
      isPublic: false,
      publicOwnership: null,
    };
    const parsed = notebookEditorSavePayloadSchema.parse(payload);
    expect(parsed.wolkeFolders).toEqual([]);
  });

  it('rejects malformed wolke_folder entries (missing required shareLinkId)', () => {
    expect(() =>
      createCollectionBodySchema.parse({
        name: 'X',
        wolke_folders: [{ folderPath: '', folderName: 'no-id', lastSyncedAt: null }],
      })
    ).toThrow();
  });
});
