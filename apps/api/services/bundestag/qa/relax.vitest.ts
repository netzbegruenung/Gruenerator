import { describe, expect, it, vi } from 'vitest';

import { MAX_RELAXATIONS, suggestRelaxations } from './relax.js';

const GRUENE = 'Fraktion BÜNDNIS 90/DIE GRÜNEN';

/** DIP-Attrappe nach dem Live-Stand vom 07.11.2026 (WP 21, #5445). */
function liveDip() {
  const list = vi.fn(async (endpoint: string, p: Record<string, unknown>) => {
    const d = p['f.deskriptor'] as string[] | undefined;
    let n = 0;
    if (endpoint === 'vorgang' && d?.length === 1 && d[0] === 'Radverkehr') {
      n = p['f.initiative'] ? 6 : 15;
    }
    return { numFound: n, cursor: null, documents: [] };
  });
  return { dip: { list } as never, list };
}

describe('suggestRelaxations', () => {
  it('zählt je Deskriptor einzeln, wenn mehrere zusammen nichts treffen', async () => {
    const { dip } = liveDip();
    const r = await suggestRelaxations({
      filters: {
        wahlperiode: [21],
        drucksachetyp: ['Kleine Anfrage'],
        urheber: [GRUENE],
        deskriptor: ['Radverkehr', 'Radschnellweg'],
      },
      dip,
    });
    const radverkehr = r.find((x) => x.aenderung.includes('„Radverkehr"'));
    expect(radverkehr).toMatchObject({ treffer: 6, einheit: 'Vorgänge' });
    // Der nächste Aufruf behält Typ und Urheber, auch wenn die Vorgangs-Zählung den Typ ignoriert.
    expect(radverkehr?.filters).toEqual({
      wahlperiode: [21],
      drucksachetyp: ['Kleine Anfrage'],
      urheber: [GRUENE],
      deskriptor: ['Radverkehr'],
    });
    expect(r.find((x) => x.aenderung.includes('„Radschnellweg"'))?.treffer).toBe(0);
  });

  it('schlägt einen Titel ohne Deskriptor als Deskriptor vor', async () => {
    const { dip } = liveDip();
    const r = await suggestRelaxations({
      filters: { wahlperiode: [21], urheber: [GRUENE], titel: 'Radverkehr' },
      dip,
    });
    expect(r[0]).toMatchObject({
      aenderung: expect.stringContaining('als Deskriptor'),
      filters: { wahlperiode: [21], urheber: [GRUENE], deskriptor: ['Radverkehr'] },
      treffer: 6,
    });
    expect(r[0]!.filters).not.toHaveProperty('titel');
  });

  it('lockert Urheber und Zeitraum, höchstens MAX_RELAXATIONS Varianten', async () => {
    const { dip } = liveDip();
    const r = await suggestRelaxations({
      filters: {
        wahlperiode: [21],
        urheber: [GRUENE],
        datumVon: '2026-01-01',
        deskriptor: ['Radverkehr', 'Radweg', 'Fahrrad', 'Radschnellweg'],
      },
      dip,
    });
    expect(r).toHaveLength(MAX_RELAXATIONS);
    expect(r.every((x) => x.aenderung.startsWith('nur Deskriptor'))).toBe(true);

    const small = await suggestRelaxations({
      filters: { wahlperiode: [21], urheber: [GRUENE], datumVon: '2026-01-01' },
      dip,
    });
    expect(small.map((x) => x.aenderung)).toEqual(['ohne Urheber', 'ohne Zeitraum']);
    expect(small[1]!.filters).not.toHaveProperty('datumVon');
  });

  it('ohne lockerbaren Filter keine Varianten und keine Abfrage', async () => {
    const { dip, list } = liveDip();
    expect(await suggestRelaxations({ filters: { wahlperiode: [21] }, dip })).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it('eine fehlgeschlagene Zählung fällt weg, die anderen bleiben', async () => {
    const list = vi.fn(async (_e: string, p: Record<string, unknown>) => {
      if (p['f.initiative']) throw new Error('DIP 503');
      return { numFound: 3, cursor: null, documents: [] };
    });
    const r = await suggestRelaxations({
      filters: { wahlperiode: [21], urheber: [GRUENE], deskriptor: ['A1', 'B2'] },
      dip: { list } as never,
    });
    expect(r.map((x) => x.aenderung)).toEqual(['ohne Urheber']);
  });
});
