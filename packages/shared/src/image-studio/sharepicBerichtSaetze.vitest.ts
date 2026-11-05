import { type SharepicBerichtEintrag } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { berichtSaetze } from './sharepicBerichtSaetze.js';

const TERMIN =
  'Den Termin habe ich weggelassen, weil er im Auftrag fehlt. Nenn mir Datum und Ort, dann setze ich ihn ein.';

describe('berichtSaetze', () => {
  it('puts the missing date first, then the scene sentence and the repair', () => {
    const bericht: SharepicBerichtEintrag[] = [
      { art: 'repariert', feld: 'datum.time', wert: '18 Uhr' },
      { art: 'gestaltung', text: 'Den Hintergrund konnte ich nicht malen lassen.' },
      { art: 'fehlt', fakt: 'termin' },
    ];
    const saetze = berichtSaetze(bericht);
    expect(saetze[0]).toBe(TERMIN);
    expect(saetze).toHaveLength(3);
    expect(saetze[1]).toBe('Den Hintergrund konnte ich nicht malen lassen.');
  });

  it('never cuts photo or scene sentences, and merges photos of one status', () => {
    const saetze = berichtSaetze([
      { art: 'fehlt', fakt: 'termin' },
      { art: 'foto', id: 'upload:1', status: 'nicht_verwendet', grund: 'zu klein' },
      { art: 'foto', id: 'upload:2', status: 'collage' },
      { art: 'foto', id: 'upload:3', status: 'nicht_verwendet', grund: 'unscharf' },
      { art: 'gestaltung', text: 'Die Szene konnte ich nicht malen lassen.' },
      { art: 'form', form: 'einzelbild', von: 'creator', statt: 'diagramm' },
      { art: 'repariert', feld: 'datum', wert: 'x' },
    ]);
    expect(saetze).toContain('Deine Fotos habe ich nicht verwendet: zu klein; unscharf.');
    expect(saetze.some((s) => s.includes('dein Foto freigestellt davorgestellt'))).toBe(true);
    expect(saetze).toContain('Die Szene konnte ich nicht malen lassen.');
    expect(saetze.filter((s) => s.startsWith('Dein') || s.startsWith('Deine'))).toHaveLength(1);
  });

  it('caps only form and repair sentences at two', () => {
    const saetze = berichtSaetze([
      { art: 'form', form: 'einzelbild', von: 'creator', statt: 'diagramm' },
      { art: 'form', form: 'vorstellung', von: 'creator', statt: 'veranstaltung' },
      { art: 'repariert', feld: 'datum', wert: 'x' },
    ]);
    expect(saetze).toHaveLength(2);
  });

  it('says repairs once, and names the form swap', () => {
    const saetze = berichtSaetze([
      { art: 'repariert', feld: 'datum.time', wert: '18 Uhr' },
      { art: 'repariert', feld: 'datum.date', wert: '3. Mai' },
    ]);
    expect(saetze).toEqual([
      'Ein Datum oder eine Uhrzeit, die nicht in deinem Auftrag standen, habe ich weggelassen.',
    ]);
    expect(
      berichtSaetze([{ art: 'form', form: 'einzelbild', von: 'creator', statt: 'diagramm' }])[0]
    ).toMatch(/^Als .+ fehlte mir der Stoff, darum ist es ein .+ geworden\.$/);
    expect(berichtSaetze([{ art: 'form', form: 'einzelbild', von: 'person' }])).toEqual([]);
  });

  it('describes photo outcomes', () => {
    expect(berichtSaetze([{ art: 'foto', id: 'upload:1', status: 'freigestellt' }])).toEqual([
      'Dein Foto ist freigestellt auf dem Sharepic.',
    ]);
    expect(
      berichtSaetze([{ art: 'foto', id: 'upload:1', status: 'nicht_verwendet', grund: 'zu klein' }])
    ).toEqual(['Dein Foto habe ich nicht verwendet: zu klein.']);
  });
});
