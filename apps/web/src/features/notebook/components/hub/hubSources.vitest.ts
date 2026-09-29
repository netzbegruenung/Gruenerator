import { describe, expect, it } from 'vitest';

import { kindLabel, partitionSources, sourceStatus, tabCount } from './hubSources';

const doc = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `${id}.pdf`,
  created_at: '2026-09-01T10:00:00Z',
  ...extra,
});

const folder = (shareLinkId: string, folderPath = '/') => ({
  shareLinkId,
  folderPath,
  folderName: folderPath,
  lastSyncedAt: null,
});

describe('partitionSources', () => {
  it('ordnet jede Quelle genau einem Reiter zu', () => {
    const sources = partitionSources({
      documents: [
        doc('up'),
        doc('w1', { source_type: 'wolke', wolke_share_link_id: 'L1' }),
        doc('linked'),
        doc('wp1', { source_type: 'wordpress' }),
      ],
      wolke_folders: [folder('L1')],
      linked_docs: [{ docId: 'doc-a', docTitle: 'A', documentId: 'linked' }],
      wordpress_sites: [
        { websiteId: 'site', categories: [], allPosts: true, pages: false, documentIds: ['wp1'] },
      ],
    });

    expect(sources.upload.map((d) => d.id)).toEqual(['up']);
    expect(sources.docs.map((d) => d.id)).toEqual(['linked']);
    expect(sources.wolke).toHaveLength(1);
    expect(sources.wolke[0].documents.map((d) => d.id)).toEqual(['w1']);
    expect(sources.wordpress[0].documents.map((d) => d.id)).toEqual(['wp1']);
    expect(sources.total).toBe(4);
  });

  it('sammelt Wolke-Dateien ohne verbundenen Ordner in einer eigenen Gruppe', () => {
    const sources = partitionSources({
      documents: [doc('w1', { source_type: 'wolke', wolke_share_link_id: 'weg' })],
      wolke_folders: [],
    });

    expect(sources.wolke).toEqual([
      { folder: null, documents: [expect.objectContaining({ id: 'w1' })] },
    ]);
    // Die Waisen-Gruppe zählt nicht als verbundener Ordner.
    expect(tabCount(sources, 'wolke')).toBe(0);
  });

  it('hängt Dateien eines Links an den ersten Ordner dieses Links', () => {
    const sources = partitionSources({
      documents: [doc('w1', { source_type: 'wolke', wolke_share_link_id: 'L1' })],
      wolke_folders: [folder('L1', '/A'), folder('L1', '/B')],
    });

    expect(sources.wolke.map((g) => g.documents.length)).toEqual([1, 0]);
  });

  it('zeigt WordPress-Dokumente ohne Website-Eintrag unter Upload', () => {
    const sources = partitionSources({ documents: [doc('wp', { source_type: 'wordpress' })] });
    expect(sources.upload.map((d) => d.id)).toEqual(['wp']);
  });
});

describe('sourceStatus', () => {
  it.each([
    ['uploaded', 'indexing'],
    ['processing', 'indexing'],
    ['failed', 'failed'],
    ['completed', 'ready'],
    [null, 'ready'],
  ] as const)('%s → %s', (status, expected) => {
    expect(sourceStatus({ status })).toBe(expected);
  });
});

describe('kindLabel', () => {
  it('nimmt die Dateiendung, sonst die Quelle', () => {
    expect(kindLabel({ title: 'Antrag.docx' })).toBe('DOCX');
    expect(kindLabel({ title: 'Ein Beitrag', source_type: 'wordpress' })).toBe('WP');
    expect(kindLabel({ title: 'Notiz' })).toBe('DOC');
  });
});
