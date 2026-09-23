import { describe, expect, it } from 'vitest';

import { extractHeaderMeta } from './headerMeta.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const de = (text: string, filename: string | null = null) =>
  extractHeaderMeta(text, { filename, locale: 'de-DE', now: NOW });
const at = (text: string, filename: string | null = null) =>
  extractHeaderMeta(text, { filename, locale: 'de-AT', now: NOW });

describe('extractHeaderMeta — Datumsarten', () => {
  it('lässt „Stand" gegen das Datum im Dateinamen gewinnen und behält beide', () => {
    const meta = de(
      'Positionspapier Verkehrswende\nStand: 08. Januar 2024\n\nWir fordern …',
      'Positionspapier_08.01.2025.pdf'
    );
    expect(meta.date).toBe('2024-01-08');
    expect(meta.dateKind).toBe('stand');
    expect(meta.precision).toBe('day');
    expect(meta.evidence).toContain('Stand: 08. Januar 2024');
    expect(meta.dates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'stand', date: '2024-01-08' }),
        expect.objectContaining({ kind: 'filename', date: '2025-01-08', precision: 'day' }),
      ])
    );
    expect(meta.source).toBe('heuristic');
  });

  it('hält Inkrafttreten und Beschlussdatum als zwei Arten auseinander', () => {
    const meta = de(
      'Statut gegen sexuelle Belästigung\nBeschluss der Bundesdelegiertenkonferenz vom 28.06.2026\n\n' +
        '§ 1 Geltungsbereich …\n§ 14 Inkrafttreten\nDieses Statut tritt am 15. Oktober 2026 in Kraft.'
    );
    expect(meta.date).toBe('2026-06-28');
    expect(meta.dateKind).toBe('beschluss');
    expect(meta.gremium).toBe('Bundesdelegiertenkonferenz');
    const kinds = meta.dates.map((d) => `${d.kind}:${d.date}`);
    expect(kinds).toContain('beschluss:2026-06-28');
    expect(kinds).toContain('inkrafttreten:2026-10-15');
  });

  it('nimmt ein Inkrafttreten in der Zukunft, ein Beschlussdatum in der Zukunft nicht', () => {
    const meta = de(
      'Beschluss des Bundesvorstands vom 01.01.2030\nDiese Ordnung tritt am 01.01.2027 in Kraft.'
    );
    expect(meta.dates.map((d) => d.kind)).toEqual(['inkrafttreten']);
    expect(meta.date).toBeNull();
  });

  it('liest „Datum:" als Veröffentlichungsdatum', () => {
    const meta = de('Pressemitteilung\nDatum: 14.02.2025\nDie Grünen fordern …');
    expect(meta.dateKind).toBe('published');
    expect(meta.date).toBe('2025-02-14');
  });

  it('liest einen Monat ohne Tag mit Monatsgenauigkeit', () => {
    const meta = de('Leitfaden Kommunalwahl\nStand: März 2024');
    expect(meta.date).toBe('2024-03-01');
    expect(meta.precision).toBe('month');
  });

  it('übersieht ein Datum im Fließtext ohne Signalwort', () => {
    const meta = de('Am 12.03.2024 haben wir im Stadtrat über den Radverkehr gesprochen.');
    expect(meta.dates).toEqual([]);
    expect(meta.date).toBeNull();
  });

  it('ordnet ein Datum hinter einem anderen nicht dem ersten Signalwort zu', () => {
    const meta = de('Beschluss des Bundesvorstands vom 12.03.2024, geändert am 01.04.2024.');
    expect(meta.dates.map((d) => d.date)).toEqual(['2024-03-12']);
  });

  it('meldet widersprüchliche Beschlussdaten', () => {
    const meta = de(
      'Beschluss des Länderrats vom 05.10.2024\n…\nBeschluss des Bundesvorstands vom 12.03.2024'
    );
    expect(meta.conflict).toBe(true);
    expect(meta.date).toBe('2024-10-05');
  });

  it('liest nur den Kopf des Dokuments', () => {
    const meta = de(`${'Lorem ipsum dolor sit amet. '.repeat(250)}Stand: 08.01.2024`);
    expect(meta.dates).toEqual([]);
  });

  it('liest eine Versionsangabe', () => {
    expect(de('Satzung\nFassung 3.2\nStand: 08.01.2024').docVersion).toBe('3.2');
  });
});

describe('extractHeaderMeta — Gremium', () => {
  it('unterscheidet gleichen Titel und gleiches Datum aus zwei Gremien', () => {
    const a = de('Klimaschutz jetzt\nBeschluss des Bundesvorstands vom 12.03.2024');
    const b = de('Klimaschutz jetzt\nBeschluss des Parteirats vom 12.03.2024');
    expect(a.gremium).toBe('Bundesvorstand');
    expect(a.gremiumRaw).toBe('Bundesvorstands');
    expect(b.gremium).toBe('Parteirat');
    expect(a.date).toBe(b.date);
  });

  it('liest die Kopfzeile „Gremium, Ort, Datum"', () => {
    const meta = de('Bundesdelegiertenkonferenz, Wiesbaden, 28. Juni 2026\n\nV-01 Klimaschutz');
    expect(meta.dateKind).toBe('beschluss');
    expect(meta.date).toBe('2026-06-28');
    expect(meta.gremium).toBe('Bundesdelegiertenkonferenz');
  });

  it('liest „beschlossen am … vom Gremium" und Abkürzungen', () => {
    expect(de('Antrag Radverkehr\nbeschlossen am 3. Mai 2025 vom Landesvorstand').gremium).toBe(
      'Landesvorstand'
    );
    const ldk = de('LDK, Potsdam, 26.03.2022');
    expect(ldk.gremium).toBe('Landesdelegiertenkonferenz');
    expect(ldk.gremiumRaw).toBe('LDK');
  });

  it('findet das Gremium auch ohne Datum in der Beschlusszeile', () => {
    const meta = de('Beschluss des Bundesfrauenrats\nGleichstellung in der Partei');
    expect(meta.gremium).toBe('Bundesfrauenrat');
    expect(meta.date).toBeNull();
  });

  it('kennt österreichische Gremien nur mit österreichischer Locale', () => {
    const text = 'Beschluss des Erweiterten Bundesvorstands vom 12. Jänner 2025';
    const meta = at(text);
    expect(meta.gremium).toBe('Erweiterter Bundesvorstand');
    expect(meta.date).toBe('2025-01-12');

    expect(at('Bundeskongress, Linz, 23. Juni 2024').gremium).toBe('Bundeskongress');
    expect(de('Bundeskongress, Linz, 23. Juni 2024').gremium).toBeNull();
    expect(at('Beschluss der Bundesdelegiertenkonferenz vom 28.06.2026').gremium).toBeNull();
  });
});

describe('extractHeaderMeta — OCR-Rauschen', () => {
  it('verträgt Leerzeichen in Datum und Doppelpunkt', () => {
    expect(de('Stand : 08 . 01 . 2024').date).toBe('2024-01-08');
    expect(de('Stand:08.01.2024').date).toBe('2024-01-08');
  });

  it('verträgt getrennte Wörter über den Zeilenumbruch und geschützte Leerzeichen', () => {
    const meta = de('Vom Länder-\nrat beschlos-\nsen am\u00a005.10.2024');
    expect(meta.dateKind).toBe('beschluss');
    expect(meta.gremium).toBe('Länderrat');
  });

  it('erfindet kein Datum aus einem unmöglichen Tag', () => {
    expect(de('Stand: 31.02.2024').dates).toEqual([]);
  });
});
