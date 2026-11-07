import { describe, expect, it } from 'vitest';

import { SHELF_HIDDEN_NOTEBOOK_IDS, buildNotebookShelves } from './shelves.js';

const nb = (id: string) => ({ id, title: id.toUpperCase(), meta: `meta-${id}` });
const col = (id: string) => ({ id });
const saved = (ref: string) => ({ ref });

const base = {
  austrian: false,
  austrianNotebooks: [],
  laender: [nb('by'), nb('he')],
  bundesverband: nb('bv'),
  parlamente: [nb('btg')],
  wiki: nb('wiki'),
  own: [],
  shared: [],
  saved: [],
  mineLoading: false,
};

const ids = (shelves: ReturnType<typeof buildNotebookShelves>) => shelves.map((s) => s.id);

describe('buildNotebookShelves', () => {
  it('orders Germany: laender, parlamente, meine, kommunalwiki', () => {
    expect(ids(buildNotebookShelves(base))).toEqual(['laender', 'parlamente', 'meine', 'wiki']);
  });

  it('puts the Bundesverband first in laender', () => {
    const laender = buildNotebookShelves(base)[0];
    expect(laender.kind).toBe('group');
    if (laender.kind !== 'group') return;
    expect(laender.layout).toBe('photos');
    expect(laender.meta).toBe('2 Landesverbände');
    expect(laender.entries.map((e) => e.key)).toEqual(['bv', 'by', 'he']);
  });

  it('turns the Bundesverband into its own tile when there are no laender', () => {
    const shelves = buildNotebookShelves({ ...base, laender: [] });
    expect(shelves[0]).toMatchObject({ id: 'bv', kind: 'notebook', title: 'BV' });
  });

  it('skips the laender shelf without laender and Bundesverband', () => {
    const shelves = buildNotebookShelves({ ...base, laender: [], bundesverband: null });
    expect(ids(shelves)).toEqual(['parlamente', 'meine', 'wiki']);
  });

  it('lists the Austrian notebooks as tiles, then meine', () => {
    const shelves = buildNotebookShelves({
      ...base,
      austrian: true,
      austrianNotebooks: [nb('at')],
    });
    expect(shelves).toHaveLength(2);
    expect(shelves[0]).toMatchObject({ id: 'at', kind: 'notebook' });
    expect(shelves[1].id).toBe('meine');
  });

  it('offers to create the first notebook when nothing is there and nothing loads', () => {
    const meine = buildNotebookShelves(base).find((s) => s.id === 'meine');
    expect(meine).toEqual({
      id: 'meine',
      kind: 'create',
      title: 'Meine Notebooks',
      meta: 'Erstes Notebook anlegen',
    });
  });

  it('has a null meta while loading', () => {
    const meine = buildNotebookShelves({ ...base, mineLoading: true }).find(
      (s) => s.id === 'meine'
    );
    expect(meine).toMatchObject({ kind: 'group', meta: null, entries: [] });
  });

  it('counts own, shared and saved entries in meine', () => {
    const one = buildNotebookShelves({ ...base, own: [col('a')] }).find((s) => s.id === 'meine');
    expect(one).toMatchObject({ kind: 'group', meta: '1 Notebook', layout: 'cards' });

    const three = buildNotebookShelves({
      ...base,
      own: [col('a')],
      shared: [col('b')],
      saved: [saved('r')],
    }).find((s) => s.id === 'meine');
    expect(three).toMatchObject({ kind: 'group', meta: '3 Notebooks' });
    if (three?.kind !== 'group') return;
    expect(three.entries.map((e) => e.key)).toEqual(['own-a', 'shared-b', 'saved-r']);
  });

  it('hides the four ids that get no tile', () => {
    expect(SHELF_HIDDEN_NOTEBOOK_IDS).toEqual([
      'gruenerator-notebook',
      'gruenblog-notebook',
      'boell-stiftung-notebook',
      'abgeordnetenwatch-notebook',
    ]);
  });
});
