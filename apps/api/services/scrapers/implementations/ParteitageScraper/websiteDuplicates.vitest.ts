/**
 * Die Satzanfänge sind echte Formulierungen von gruene-nrw.de (Kategorie
 * „Beschlüsse", abgerufen 15.11.2026) — jede schreibt ihr Datum anders.
 */
import { describe, expect, it } from 'vitest';

import {
  gremiumOf,
  matchWebsiteDuplicates,
  normalizeTitle,
  websiteDateOf,
  type AntragsgruenBeschluss,
  type WebsiteBeschluss,
} from './websiteDuplicates.js';

describe('websiteDateOf', () => {
  it('liest die Datumsformen der Website', () => {
    expect(
      websiteDateOf('Beschluss der Landesdelegiertenkonferenz am 21. Juni 2026. NRW ist')
    ).toBe('2026-06-21');
    expect(websiteDateOf('Beschluss des Landesvorstandes vom 3 . September 2026 Die')).toBe(
      '2026-09-03'
    );
    expect(websiteDateOf('Beschluss des Landesparteirats in Krefeld am 16.11. 2025 Am')).toBe(
      '2025-11-16'
    );
    expect(websiteDateOf('Beschluss des Landesvorstandes vom 02.07.2026 Die Hitzewelle')).toBe(
      '2026-07-02'
    );
    expect(websiteDateOf('Positionspapier BÜNDNIS 90/DIE GRÜNEN NRW')).toBeNull();
  });
});

describe('gremiumOf', () => {
  it('unterscheidet LDK, Landesparteirat und Landesvorstand', () => {
    expect(gremiumOf('Beschluss der Landesdelegiertenkonferenz am …')).toBe('ldk');
    expect(gremiumOf('Beschluss des Landesparteirats in Krefeld')).toBe('lpr');
    expect(gremiumOf('Beschluss des Landesvorstands am 21. März 2026')).toBe('lavo');
    expect(gremiumOf(null)).toBeNull();
  });
});

describe('matchWebsiteDuplicates', () => {
  const beschluesse: AntragsgruenBeschluss[] = [
    {
      documentId: 'ag-nrw-m103758',
      title: 'Bis es für alle Frauen gilt: Sicherheit, Freiheit und Gleichberechtigung!',
      beschlossenAm: '2026-06-21',
      beschlussDurch: 'Landesdelegiertenkonferenz',
    },
    {
      documentId: 'ag-nrw-m103681',
      title: 'Unabhängig von Öl, Gas und Diktatoren',
      beschlossenAm: '2026-06-20',
      beschlussDurch: 'Landesdelegiertenkonferenz',
    },
  ];
  const post = (sourceUrl: string, title: string, head: string): WebsiteBeschluss => ({
    sourceUrl,
    title,
    head,
  });

  it('markiert die Website-Abschrift eines LDK-Beschlusses', () => {
    const { matches, ambiguous } = matchWebsiteDuplicates(beschluesse, [
      post(
        'https://gruene-nrw.de/2026/07/frauen/',
        'Bis es für alle Frauen gilt: Sicherheit, Freiheit und Gleichberechtigung',
        'Beschluss der Landesdelegiertenkonferenz am 21. Juni 2026. NRW ist stark'
      ),
    ]);
    expect([...matches]).toEqual([['https://gruene-nrw.de/2026/07/frauen/', 'ag-nrw-m103758']]);
    expect(ambiguous).toEqual([]);
  });

  it('lässt einen Beitrag mit anderem Datum oder Titel stehen', () => {
    const { matches } = matchWebsiteDuplicates(beschluesse, [
      post(
        'https://gruene-nrw.de/a/',
        'Unabhängig von Öl, Gas und Diktatoren',
        'Beschluss der Landesdelegiertenkonferenz am 21. Juni 2026.'
      ),
      post(
        'https://gruene-nrw.de/b/',
        'Unabhängig von Öl und Gas',
        'Beschluss der Landesdelegiertenkonferenz am 20. Juni 2026.'
      ),
    ]);
    expect(matches.size).toBe(0);
  });

  it('fasst Beschlüsse des Landesvorstands nie an, auch bei gleichem Titel und Datum', () => {
    const { matches } = matchWebsiteDuplicates(beschluesse, [
      post(
        'https://gruene-nrw.de/c/',
        'Unabhängig von Öl, Gas und Diktatoren',
        'Beschluss des Landesvorstands am 20. Juni 2026.'
      ),
    ]);
    expect(matches.size).toBe(0);
  });

  it('markiert nichts, was zu zwei Beschlüssen passt, und meldet es', () => {
    const doppelt = [...beschluesse, { ...beschluesse[1], documentId: 'ag-nrw-m999' }];
    const { matches, ambiguous } = matchWebsiteDuplicates(doppelt, [
      post(
        'https://gruene-nrw.de/d/',
        'Unabhängig von Öl, Gas und Diktatoren',
        'Beschluss der Landesdelegiertenkonferenz am 20. Juni 2026.'
      ),
    ]);
    expect(matches.size).toBe(0);
    expect(ambiguous).toEqual(['https://gruene-nrw.de/d/']);
  });
});

describe('normalizeTitle', () => {
  it('gleicht Satzzeichen und doppelte Leerzeichen aus', () => {
    expect(normalizeTitle('NRW-Ernährungspolitik 2030:  Nachhaltig, sicher, gerecht!')).toBe(
      normalizeTitle('NRW-Ernährungspolitik 2030: Nachhaltig, sicher, gerecht')
    );
  });
});
