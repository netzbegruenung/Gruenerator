/**
 * Die Tests, die vier Formfehler verhindert hätten.
 *
 * `mapTextResponse` las jahrelang an drei Stellen die falsche Ebene — `header`
 * statt `mainInfo.header`, `headline` statt `mainSimple.headline`, und für
 * Zitate `alt.quote` über einem Array aus nackten Strings. Alles drei
 * kompilierte, lief durch und lieferte leere Felder. Die Fixtures unten sind
 * deshalb bewusst gegen die Vertragsschemata geprüft: was hier hineingeht,
 * kann die API auch wirklich senden.
 */
import {
  infoTextResponseSchema,
  simpleTextResponseSchema,
  sliderTextResponseSchema,
  zitatTextResponseSchema,
  veranstaltungTextResponseSchema,
  dreizeilenTextResponseSchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { mapTextResponse } from './constants.js';

describe('mapTextResponse', () => {
  it('dreizeilen: Zeilen aus mainSlogan', () => {
    const wire = dreizeilenTextResponseSchema.parse({
      success: true,
      mainSlogan: { line1: 'Wir', line2: 'machen', line3: 'weiter' },
      alternatives: [{ line1: 'Ganz', line2: 'anders', line3: 'jetzt' }],
      searchTerms: ['klima'],
    });

    const r = mapTextResponse('dreizeilen', wire);
    expect(r.fields).toEqual({ line1: 'Wir', line2: 'machen', line3: 'weiter' });
    expect(r.alternatives).toHaveLength(1);
    expect(r.searchTerms).toEqual(['klima']);
  });

  it('info: liest mainInfo, nicht die oberste Ebene', () => {
    const wire = infoTextResponseSchema.parse({
      success: true,
      mainInfo: { header: 'Kopf', subheader: 'Unterkopf', body: 'Fliesstext.' },
      alternatives: [{ header: 'Kopf 2', subheader: 'Sub 2', body: 'Text 2.' }],
      searchTerms: [],
    });

    const r = mapTextResponse('info', wire);
    expect(r.fields).toEqual({ header: 'Kopf', subheader: 'Unterkopf', body: 'Fliesstext.' });
    expect(r.alternatives[0]).toEqual({ header: 'Kopf 2', subheader: 'Sub 2', body: 'Text 2.' });
  });

  it('simple: liest mainSimple und reicht Alternativen durch', () => {
    const wire = simpleTextResponseSchema.parse({
      success: true,
      mainSimple: { headline: 'Schlagzeile', subtext: 'Untertext' },
      alternatives: [{ headline: 'Zweite', subtext: 'Auch da' }],
      searchTerms: [],
    });

    const r = mapTextResponse('simple', wire);
    expect(r.fields).toEqual({ headline: 'Schlagzeile', subtext: 'Untertext' });
    // Vorher fest `alternatives: []` — die zweite Variante fiel still weg.
    expect(r.alternatives).toEqual([{ headline: 'Zweite', subtext: 'Auch da' }]);
  });

  it.each(['zitat', 'zitat-pure'] as const)('%s: alternatives sind Strings', (type) => {
    const wire = zitatTextResponseSchema.parse({
      success: true,
      quote: 'Ein Zitat.',
      name: 'Annalena Beispiel',
      alternatives: ['Noch eins.', 'Und noch eins.'],
      searchTerms: [],
    });

    const r = mapTextResponse(type, wire);
    expect(r.fields).toEqual({ quote: 'Ein Zitat.', name: 'Annalena Beispiel' });
    // Der alte Code las `alt.quote` auf einem String — jeder Eintrag war leer.
    expect(r.alternatives).toEqual([{ quote: 'Noch eins.' }, { quote: 'Und noch eins.' }]);
  });

  it('veranstaltung: alle Eventfelder aus mainEvent', () => {
    const event = {
      eventTitle: 'Mitgliederversammlung',
      weekday: 'Mittwoch',
      date: '25. Januar',
      time: '19:00 Uhr',
      locationName: 'Bürgerhaus',
      address: 'Hauptstr. 1',
      beschreibung: 'Alle sind eingeladen.',
    };
    const wire = veranstaltungTextResponseSchema.parse({
      success: true,
      mainEvent: event,
      alternatives: [],
      searchTerms: [],
    });

    const r = mapTextResponse('veranstaltung', wire);
    expect(r.fields.eventTitle).toBe('Mitgliederversammlung');
    expect(r.fields.address).toBe('Hauptstr. 1');
    expect(r.fields.beschreibung).toBe('Alle sind eingeladen.');
  });

  it('slider: mainSlider plus Folgefolien', () => {
    const slide = { label: 'Wusstest du?', headline: 'Kopf', subtext: 'Text', subtext2: '' };
    const wire = sliderTextResponseSchema.parse({
      success: true,
      mainSlider: slide,
      alternatives: [slide, slide],
      searchTerms: [],
    });

    const r = mapTextResponse('slider', wire);
    expect(r.fields.headline).toBe('Kopf');
    // Beim Slider sind das die Seiten 2 und 3, keine Auswahl.
    expect(r.alternatives).toHaveLength(2);
  });
});
