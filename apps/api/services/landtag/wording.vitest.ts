import { describe, expect, it, vi } from 'vitest';

import { detectLandtagFromWording, topicOf } from './wording.js';

describe('detectLandtagFromWording', () => {
  it('liest „dieses Jahr“ als das laufende Kalenderjahr (#5573)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    try {
      expect(
        detectLandtagFromWording(
          'wie viele Schriftliche Anfragen hat Frau Kapek dieses Jahr gestellt'
        )
      ).toMatchObject({ typ: ['Anfrage'], datumVon: '2026-01-01', datumBis: '2026-12-31' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('erkennt Art, Fraktion und ein bloßes Jahr', () => {
    expect(
      detectLandtagFromWording(
        'Welche Anträge haben die Grünen in Berlin 2026 zur Verkehrswende gestellt?'
      )
    ).toEqual({
      typ: ['Antrag'],
      fraktion: ['gruene'],
      datumVon: '2026-01-01',
      datumBis: '2026-12-31',
    });
  });

  it('bildet Kleine und Schriftliche Anfrage auf Anfrage ab', () => {
    expect(detectLandtagFromWording('Schriftliche Anfragen der SPD').typ).toEqual(['Anfrage']);
    expect(detectLandtagFromWording('Kleine Anfragen der CDU').fraktion).toEqual(['cdu']);
  });

  it('erkennt BSW, das der Bundestag-Erkenner nicht kennt', () => {
    expect(detectLandtagFromWording('Was fordert das BSW?').fraktion).toEqual(['bsw']);
  });

  it('lässt ausdrückliche Zeiträume vor dem bloßen Jahr gelten', () => {
    expect(detectLandtagFromWording('seit März 2025 Anträge')).toMatchObject({
      datumVon: '2025-03-01',
    });
    expect(detectLandtagFromWording('Anträge zur Verkehrswende')).toEqual({ typ: ['Antrag'] });
  });

  it('erkennt die Klubs und Arten des Nationalrats', () => {
    expect(
      detectLandtagFromWording('Welche Anträge haben ÖVP und die NEOS zur Pflege eingebracht?')
    ).toMatchObject({ fraktion: ['oevp', 'neos'], typ: ['Antrag'] });
    expect(
      detectLandtagFromWording('Regierungsvorlagen und Ausschussberichte zum Klima')
    ).toMatchObject({
      typ: ['Gesetzentwurf', 'Beschlussempfehlung'],
    });
    expect(detectLandtagFromWording('Was sagt die FPÖ dazu?').fraktion).toEqual(['fpoe']);
    expect(detectLandtagFromWording('Was sagt die SPD dazu?').fraktion).not.toContain('spoe');
  });
});

describe('topicOf', () => {
  it('lässt von reinen Filterwörtern nichts übrig (Zählfrage, live 04.11.2026)', () => {
    expect(topicOf('Anträge')).toBe('');
    expect(topicOf('Fraktion der Grünen')).toBe('');
    expect(topicOf('Anträge der AfD-Fraktion 2025')).toBe('');
    expect(topicOf('Landtag NRW Gesetzentwürfe')).toBe('');
  });

  it('behält das Thema', () => {
    expect(topicOf('Windkraft Anträge Grüne')).toBe('Windkraft');
    expect(topicOf('Sanierung Elsenbrücke')).toBe('Sanierung Elsenbrücke');
    expect(topicOf('Lehrkräftemangel Grundschulen')).toBe('Lehrkräftemangel Grundschulen');
    // Ein Wort, das nur mit einem Filterwort anfängt, bleibt.
    expect(topicOf('Grünflächen Anträge')).toBe('Grünflächen');
  });
});
