import { describe, expect, it } from 'vitest';

import { isFullDocument, docPreviewHtml } from '../../services/docs/documentShape';

import { toDocListItems } from './docListItems';

import { type Document } from '../../services/docs/docsApi';
import { type OfficeItem } from '../office/officeItem';

/**
 * Two backends answer `/docs`, and both have to work.
 *
 * A build that knows `?preview=true` can reach a deployment that does not —
 * mobile updates over the air, ahead of any backend deploy — and then the list
 * comes back the old way, with full `content` and no excerpt. Every assertion
 * about the excerpt below has a twin about that case.
 */

const base = {
  owner_id: 'u1',
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
} satisfies Partial<Document>;

const previewRow: Document = {
  ...base,
  id: 'd1',
  title: 'Antrag',
  content_excerpt: '<h1>Antrag</h1><p>Kurz</p>',
};

const legacyRow: Document = {
  ...base,
  id: 'd1',
  title: 'Antrag',
  content: '<h1>Antrag</h1><p>Ganzer Text</p>',
};

describe('docPreviewHtml', () => {
  it('prefers the excerpt', () => {
    expect(docPreviewHtml({ ...previewRow, content: '<p>voll</p>' })).toBe(
      '<h1>Antrag</h1><p>Kurz</p>'
    );
  });

  it('falls back to the body when the backend sent no excerpt', () => {
    expect(docPreviewHtml(legacyRow)).toBe('<h1>Antrag</h1><p>Ganzer Text</p>');
  });

  it('is undefined when the document has neither', () => {
    expect(docPreviewHtml({ ...base, id: 'd1', title: 'Leer' })).toBeUndefined();
  });
});

describe('isFullDocument', () => {
  it('rejects a preview row', () => {
    // The load-bearing case: this row would satisfy an id lookup while carrying
    // only a truncated excerpt.
    expect(isFullDocument(previewRow)).toBe(false);
  });

  it('accepts a row from a backend that still sends the body', () => {
    expect(isFullDocument(legacyRow)).toBe(true);
  });

  it('accepts an empty document', () => {
    // A document whose content is the empty string is complete, not missing.
    expect(isFullDocument({ ...base, id: 'd1', title: 'Neu', content: '' })).toBe(true);
  });

  it.each([undefined, null])('rejects %s', (value) => {
    expect(isFullDocument(value)).toBe(false);
  });
});

describe('toDocListItems', () => {
  it('carries the excerpt into the item preview', () => {
    const [item] = toDocListItems([previewRow]);
    expect(item.preview).toBe('<h1>Antrag</h1><p>Kurz</p>');
  });

  it('carries the body when that is all there is', () => {
    const [item] = toDocListItems([legacyRow]);
    expect(item.preview).toBe('<h1>Antrag</h1><p>Ganzer Text</p>');
  });

  it('leaves the preview key off a document with no content', () => {
    const [item] = toDocListItems([{ ...base, id: 'd1', title: 'Leer' }]);
    expect('preview' in item).toBe(false);
  });

  it('maps the subtype to the kind that picks the viewer', () => {
    const items = toDocListItems([
      { ...base, id: 'a', title: 'A', document_subtype: 'sheets' },
      { ...base, id: 'b', title: 'B', document_subtype: 'presentations' },
      { ...base, id: 'c', title: 'C' },
    ]);
    expect(items.map((i) => i.kind).sort()).toEqual(['doc', 'presentation', 'sheet']);
  });

  it('sorts documents and extra items together, newest first', () => {
    // Boards and canvases arrive from their own endpoints; interleaving them by
    // date is the whole reason the merge exists.
    const canvas: OfficeItem = {
      id: 'c1',
      title: 'Sharepic',
      updatedAt: '2026-07-05T10:00:00Z',
      kind: 'canvas',
    };
    const items = toDocListItems(
      [
        { ...base, id: 'd1', title: 'Alt', updated_at: '2026-07-01T10:00:00Z' },
        { ...base, id: 'd2', title: 'Neu', updated_at: '2026-07-09T10:00:00Z' },
      ],
      [canvas]
    );
    expect(items.map((i) => i.id)).toEqual(['d2', 'c1', 'd1']);
  });

  it('returns an empty list when there is nothing at all', () => {
    expect(toDocListItems([])).toEqual([]);
  });
});
