import { describe, expect, it } from 'vitest';

import { detectLandtagFromWording } from './wording.js';

describe('detectLandtagFromWording', () => {
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
