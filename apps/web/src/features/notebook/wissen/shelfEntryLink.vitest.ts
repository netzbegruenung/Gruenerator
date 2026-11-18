import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { describe, expect, it } from 'vitest';

import { item } from '../../../test/marketplaceFixtures';

import { shelfEntryLink } from './NotebookShelf';

import type { ShelfEntry } from './useNotebookShelves';

type OwnEntry = Extract<ShelfEntry, { kind: 'own' }>;

// Only the fields shelfEntryLink reads; the rest of the wire shape is irrelevant here.
const collection = {
  id: 'c-1',
  name: 'Haushalt 2027',
  slug_suffix: 'ab12cd',
} as OwnEntry['collection'];

describe('shelfEntryLink', () => {
  it('system: config title and path', () => {
    const entry = {
      kind: 'system',
      notebook: { id: 'gruene', title: 'Grüne Texte', path: '/notebooks/gruene' },
    } as unknown as ShelfEntry;
    const link = shelfEntryLink(entry);
    expect(link.title).toBe('Grüne Texte');
    expect(link.to).toBe('/notebooks/gruene');
  });

  it.each(['own', 'shared'] as const)('%s: collection name and slug path', (kind) => {
    const link = shelfEntryLink({ kind, collection } as unknown as ShelfEntry);
    expect(link.title).toBe('Haushalt 2027');
    expect(link.to).toBe(`/notebooks/${buildNotebookSlug('Haushalt 2027', 'ab12cd')}`);
  });

  it('own: falls back to the id for legacy rows without suffix', () => {
    const legacy = { ...collection, slug_suffix: null };
    const link = shelfEntryLink({ kind: 'own', collection: legacy } as unknown as ShelfEntry);
    expect(link.to).toBe('/notebooks/c-1');
  });

  it('saved: item title and notebook slug', () => {
    const saved = item('notebook', 'Kommunalpolitik Nord', { ref: 'basis-1' });
    const link = shelfEntryLink({ kind: 'saved', item: saved } as unknown as ShelfEntry);
    expect(link.title).toBe('Kommunalpolitik Nord');
    expect(link.to).toBe(`/notebooks/${(saved as { notebook: { slug: string } }).notebook.slug}`);
  });
});
