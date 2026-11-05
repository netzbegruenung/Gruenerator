import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findLandtag } from './index.js';

const resolveRefs = vi.fn<(refs: readonly string[]) => Promise<unknown[]>>();
const find = vi.fn<(args: unknown) => Promise<unknown>>();
vi.mock('./backends.js', () => ({
  LANDTAG_BACKENDS: {
    berlin: () => ({ find, resolveRefs, fetchTexts: vi.fn() }),
    nrw: () => ({ find, resolveRefs, fetchTexts: vi.fn() }),
    nationalrat: () => ({ find, resolveRefs, fetchTexts: vi.fn() }),
  },
}));

const doc = { ref: 'BE 19/2500', dokumentnummer: '19/2500' };

describe('findLandtag: Nummer vor Suche', () => {
  beforeEach(() => {
    resolveRefs.mockReset();
    find.mockReset().mockResolvedValue({ candidates: [], gesamt: 0, notes: [] });
  });

  it('löst eine Drucksachennummer im Suchwort direkt auf, mit und ohne Anfrage-S', async () => {
    resolveRefs.mockResolvedValue([doc]);
    const r = await findLandtag('berlin', 'Drucksache 19/2500', {});
    expect(resolveRefs).toHaveBeenCalledWith(['BE 19/2500', 'BE 19/S2500']);
    expect(find).not.toHaveBeenCalled();
    expect(r).toMatchObject({ candidates: [doc], gesamt: 1 });
    expect(r.notes[0]).toMatch(/parlament_lesen/);
  });

  it('nimmt das Präfix des Parlaments und auch den Titelfilter', async () => {
    resolveRefs.mockResolvedValue([{ ref: 'NW 18/21208' }]);
    await findLandtag('nrw', '', { titel: '18/21208' });
    expect(resolveRefs).toHaveBeenCalledWith(['NW 18/21208', 'NW 18/S21208']);
  });

  it('sucht wie bisher, wenn die Nummer unbekannt ist oder keine dasteht', async () => {
    resolveRefs.mockResolvedValue([]);
    await findLandtag('berlin', '11/2026', {});
    // Unbekannte Nummer: die Suche läuft, das Jahr ist als Filterwort schon draussen.
    expect(find).toHaveBeenCalledWith({ query: '11', filters: {} });

    await findLandtag('berlin', 'Radwege Anträge Grüne', {});
    expect(find).toHaveBeenLastCalledWith({ query: 'Radwege', filters: {} });
    expect(resolveRefs).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(2);
  });
});
