import { type SharepicBerichtEintrag } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { berichtFuerKi, berichtSaetze } from './sharepicBericht.js';

const TERMIN =
  'Den Termin habe ich weggelassen, weil er im Auftrag fehlt. Nenn mir Datum und Ort, dann setze ich ihn ein.';

describe('berichtSaetze', () => {
  it('puts the missing date first and keeps at most two sentences', () => {
    const bericht: SharepicBerichtEintrag[] = [
      { art: 'repariert', feld: 'datum.time', wert: '18 Uhr' },
      { art: 'gestaltung', text: 'Den Hintergrund konnte ich nicht malen lassen.' },
      { art: 'fehlt', fakt: 'termin' },
    ];
    const saetze = berichtSaetze(bericht);
    expect(saetze[0]).toBe(TERMIN);
    expect(saetze).toHaveLength(2);
    expect(saetze[1]).toBe('Den Hintergrund konnte ich nicht malen lassen.');
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

describe('berichtFuerKi', () => {
  it('writes one prefixed line per entry', () => {
    const text = berichtFuerKi([
      { art: 'fehlt', fakt: 'termin' },
      { art: 'repariert', feld: 'datum.time', wert: '18 Uhr' },
      { art: 'foto', id: 'upload:1', status: 'freigestellt' },
    ]);
    expect(text.split('\n')).toEqual([
      'Beim Erstellen: Termin fehlte im Auftrag und wurde weggelassen.',
      'Beim Erstellen: datum.time "18 Uhr" entfernt (stand nicht im Auftrag).',
      'Beim Erstellen: eigenes Foto upload:1 – freigestellt.',
    ]);
  });

  it('is empty for an empty report', () => {
    expect(berichtFuerKi([])).toBe('');
  });
});
