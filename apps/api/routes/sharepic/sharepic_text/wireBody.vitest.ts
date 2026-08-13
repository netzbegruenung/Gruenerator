/**
 * Verzahnt die Implementierung mit dem Vertrag.
 *
 * `toSharepicTextWireBody` ist die einzige Stelle, die die Drahtform kennt —
 * der ts-rest-Router, der Express-Fallback und die deprecated `*_claude`-
 * Aliasse serialisieren alle durch sie. Der Router castet ihr Ergebnis auf den
 * Vertragstyp; dieser Test ist die Deckung, die der Cast schuldet: er parst
 * jede Ausgabe gegen genau das Schema, das der Vertrag als 200 deklariert.
 *
 * Läuft ohne Express und ohne Modell — reine Funktion, feste Eingaben.
 */
import {
  dreizeilenAtTextResponseSchema,
  dreizeilenTextResponseSchema,
  infoAtTextResponseSchema,
  infoTextResponseSchema,
  simpleTextResponseSchema,
  sliderTextResponseSchema,
  veranstaltungTextResponseSchema,
  zitatTextResponseSchema,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { toSharepicTextWireBody, type UnifiedTextResult } from './unifiedHandler.js';

type Success = Extract<UnifiedTextResult, { success: true }>;

function ok(
  mainKey: string,
  main: Success['main'],
  alternatives: Success['alternatives']
): Success {
  return { success: true, mainKey, main, alternatives, searchTerms: ['klimaschutz'] };
}

const SLOGAN = { line1: 'Wir', line2: 'machen', line3: 'weiter' };
const INFO = { header: 'Kopf', subheader: 'Unterkopf', body: 'Fliesstext.' };
const EVENT = {
  eventTitle: 'Mitgliederversammlung',
  weekday: 'Mittwoch',
  date: '25. Januar',
  time: '19:00 Uhr',
  locationName: 'Bürgerhaus',
  address: 'Hauptstr. 1',
  beschreibung: 'Alle sind eingeladen.',
};
const SIMPLE = { headline: 'Schlagzeile', subtext: 'Untertext' };
const SLIDE = { label: 'Wusstest du?', headline: 'Kopf', subtext: 'Text', subtext2: '' };

describe('toSharepicTextWireBody', () => {
  it('dreizeilen: mainSlogan + gleichgeformte Alternativen', () => {
    const body = toSharepicTextWireBody(ok('mainSlogan', SLOGAN, [SLOGAN]), 'dreizeilen', '');
    expect(dreizeilenTextResponseSchema.safeParse(body).success).toBe(true);
    expect(body.mainSlogan).toEqual(SLOGAN);
  });

  it('info: nestet unter mainInfo, NICHT auf oberster Ebene', () => {
    const body = toSharepicTextWireBody(ok('mainInfo', INFO, [INFO]), 'info', '');
    expect(infoTextResponseSchema.safeParse(body).success).toBe(true);
    expect(body.mainInfo).toEqual(INFO);
    // Der Fehler, der jede Info-Generierung im Web abbrechen liess: die
    // Konsumenten lasen `body.header`. Das gab es nie.
    expect(body).not.toHaveProperty('header');
  });

  it('veranstaltung: mainEvent', () => {
    const body = toSharepicTextWireBody(ok('mainEvent', EVENT, [EVENT]), 'veranstaltung', '');
    expect(veranstaltungTextResponseSchema.safeParse(body).success).toBe(true);
  });

  it('simple: mainSimple', () => {
    const body = toSharepicTextWireBody(ok('mainSimple', SIMPLE, [SIMPLE]), 'simple', '');
    expect(simpleTextResponseSchema.safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty('headline');
  });

  it('slider: mainSlider, Folgefolien in alternatives', () => {
    const body = toSharepicTextWireBody(ok('mainSlider', SLIDE, [SLIDE, SLIDE]), 'slider', '');
    expect(sliderTextResponseSchema.safeParse(body).success).toBe(true);
    expect(body.alternatives).toHaveLength(2);
  });

  it.each(['zitat', 'zitat_pure'])('%s: quote ist ein String, alternatives string[]', (type) => {
    const body = toSharepicTextWireBody(
      ok('quote', 'Ein Zitat.', ['Noch eins.', 'Und noch eins.']),
      type,
      'Annalena Beispiel'
    );
    expect(zitatTextResponseSchema.safeParse(body).success).toBe(true);
    expect(body.quote).toBe('Ein Zitat.');
    expect(body.name).toBe('Annalena Beispiel');
    expect(body.alternatives).toEqual(['Noch eins.', 'Und noch eins.']);
  });

  it('nur die Zitat-Typen bekommen quote und name', () => {
    const body = toSharepicTextWireBody(ok('mainInfo', INFO, []), 'info', 'Wird ignoriert');
    expect(body).not.toHaveProperty('quote');
    expect(body).not.toHaveProperty('name');
  });

  /**
   * Die AT-Sujets haben eigene Routen (`…/text/info_at`, `…/text/dreizeilen_at`)
   * und eigene 200-Schemata, weil ihre Felder andere sind. Erreichbar sind sie
   * über zwei Wege — den Typ (HTTP) und `userLocale` (In-Process-Chat) —, aber
   * beide serialisieren durch diese eine Funktion.
   */
  describe('AT-Varianten', () => {
    const INFO_AT = { introline: 'Vorspann', text: 'Haupttext', accent: 'Akzent.' };
    const SLOGAN_AT = { ...SLOGAN, subline: 'Ergänzung' };

    it('info_at: introline/text/accent unter mainInfo', () => {
      const body = toSharepicTextWireBody(ok('mainInfo', INFO_AT, [INFO_AT]), 'info_at', '');
      expect(infoAtTextResponseSchema.safeParse(body).success).toBe(true);
      expect(body.mainInfo).toEqual(INFO_AT);
    });

    it('dreizeilen_at: subline neben den drei Zeilen', () => {
      const body = toSharepicTextWireBody(
        ok('mainSlogan', SLOGAN_AT, [SLOGAN_AT]),
        'dreizeilen_at',
        ''
      );
      expect(dreizeilenAtTextResponseSchema.safeParse(body).success).toBe(true);
      expect(body.mainSlogan).toEqual(SLOGAN_AT);
    });

    /**
     * Der Punkt der Trennung: die beiden Info-Formen sind wechselseitig
     * ungültig. Fiele eine AT-Antwort je auf die deutsche Route (oder
     * umgekehrt), fällt das hier auf und nicht erst als leeres Sujet.
     */
    it('AT- und DE-Info sind gegeneinander keine gültigen Antworten', () => {
      const atBody = toSharepicTextWireBody(ok('mainInfo', INFO_AT, []), 'info_at', '');
      const deBody = toSharepicTextWireBody(ok('mainInfo', INFO, []), 'info', '');

      expect(infoTextResponseSchema.safeParse(atBody).success).toBe(false);
      expect(infoAtTextResponseSchema.safeParse(deBody).success).toBe(false);
    });

    /**
     * Der AT-Prompt darf die Subline weglassen; der Handler normalisiert sie zu
     * `''`. Das Schema sagt sie deshalb als Pflichtfeld zu — fehlt sie roh,
     * ist das ein Vertragsbruch und kein „halt leer".
     */
    it('dreizeilen_at ohne subline verletzt das Schema', () => {
      const body = toSharepicTextWireBody(ok('mainSlogan', SLOGAN, []), 'dreizeilen_at', '');
      expect(dreizeilenAtTextResponseSchema.safeParse(body).success).toBe(false);
    });
  });
});
