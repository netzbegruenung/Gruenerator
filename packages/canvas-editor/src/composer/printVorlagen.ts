/**
 * The Grünerator's print Vorlagen (gallery category „Print"): one business
 * card per orientation and one typo poster, per country. Placeholder texts
 * only — the person fills in their own in the editor.
 *
 * The ids are persisted (F0): links, likes and bookmarks point at them.
 */
import { type PrintLocale, type PrintSpec } from '@gruenerator/contracts';

export interface PrintVorlage {
  id: string;
  titel: string;
  beschreibung: string;
  locale: PrintLocale;
  spec: PrintSpec;
  /** Static preview image; may not exist yet, the card must cope without it. */
  thumb: string;
}

const KARTE_DE = {
  name: 'Vorname Nachname',
  funktion: 'Funktion',
  organisation: 'BÜNDNIS 90/DIE GRÜNEN Ortsverband',
  adresse: 'Straße Nr., PLZ Ort',
  telefon: '0123 456789',
  mail: 'ov@beispiel.de',
  web: 'beispiel.de',
};

const KARTE_AT = {
  name: 'Vorname Nachname',
  funktion: 'Funktion',
  organisation: 'Die Grünen Bezirksgruppe',
  adresse: 'Straße Nr., PLZ Ort',
  telefon: '+43 1 234567',
  mail: 'bezirk@beispiel.at',
  web: 'beispiel.at',
};

const thumb = (id: string) => `/vorlagen/print/${id}.webp`;

export const PRINT_VORLAGEN = [
  {
    id: 'de-visitenkarte-quer',
    titel: 'Visitenkarte quer',
    beschreibung: 'Visitenkarte 85 × 55 mm mit Vorder- und Rückseite.',
    locale: 'de-DE',
    thumb: thumb('de-visitenkarte-quer'),
    spec: {
      locale: 'de-DE',
      produkt: 'visitenkarte',
      variante: 'visitenkarte',
      format: 'print-visitenkarte-quer',
      impressum: null,
      slots: KARTE_DE,
    },
  },
  {
    id: 'de-visitenkarte-hoch',
    titel: 'Visitenkarte hoch',
    beschreibung: 'Visitenkarte 55 × 85 mm mit Vorder- und Rückseite.',
    locale: 'de-DE',
    thumb: thumb('de-visitenkarte-hoch'),
    spec: {
      locale: 'de-DE',
      produkt: 'visitenkarte',
      variante: 'visitenkarte',
      format: 'print-visitenkarte-hoch',
      impressum: null,
      slots: KARTE_DE,
    },
  },
  {
    id: 'de-plakat-typo-a3',
    titel: 'Typo-Plakat A3',
    beschreibung: 'Textplakat in A3 hoch für Veranstaltungen und Botschaften.',
    locale: 'de-DE',
    thumb: thumb('de-plakat-typo-a3'),
    spec: {
      locale: 'de-DE',
      produkt: 'plakat',
      variante: 'typo',
      format: 'print-a3-hoch',
      impressum: { art: 'visdp', name: 'Vorname Nachname', anschrift: 'Straße Nr., PLZ Ort' },
      slots: {
        dachzeile: 'Einladung zum Gespräch:',
        headline: 'Hier steht deine Botschaft',
        akzent: 'Botschaft',
        subline: 'Datum, Uhrzeit und Ort',
        web: 'beispiel.de',
        absender: 'BÜNDNIS 90/DIE GRÜNEN Ortsverband',
      },
    },
  },
  {
    id: 'at-visitenkarte-quer',
    titel: 'Visitenkarte quer',
    beschreibung: 'Visitenkarte 85 × 55 mm mit Vorder- und Rückseite.',
    locale: 'de-AT',
    thumb: thumb('at-visitenkarte-quer'),
    spec: {
      locale: 'de-AT',
      produkt: 'visitenkarte',
      variante: 'visitenkarte',
      format: 'print-visitenkarte-quer',
      impressum: null,
      slots: KARTE_AT,
    },
  },
  {
    id: 'at-visitenkarte-hoch',
    titel: 'Visitenkarte hoch',
    beschreibung: 'Visitenkarte 55 × 85 mm mit Vorder- und Rückseite.',
    locale: 'de-AT',
    thumb: thumb('at-visitenkarte-hoch'),
    spec: {
      locale: 'de-AT',
      produkt: 'visitenkarte',
      variante: 'visitenkarte',
      format: 'print-visitenkarte-hoch',
      impressum: null,
      slots: KARTE_AT,
    },
  },
  {
    id: 'at-plakat-typo-a3',
    titel: 'Typo-Plakat A3',
    beschreibung: 'Textplakat in A3 hoch für Veranstaltungen und Botschaften.',
    locale: 'de-AT',
    thumb: thumb('at-plakat-typo-a3'),
    spec: {
      locale: 'de-AT',
      produkt: 'plakat',
      variante: 'typo',
      format: 'print-a3-hoch',
      impressum: {
        art: 'impressum',
        medieninhaber: 'Name/Organisation',
        anschrift: 'Straße Nr., PLZ Ort',
      },
      slots: {
        dachzeile: 'Einladung zum Gespräch:',
        headline: 'Hier steht deine Botschaft',
        akzent: 'Botschaft',
        subline: 'Datum, Uhrzeit und Ort',
        web: 'beispiel.at',
        absender: 'Die Grünen Bezirksgruppe',
      },
    },
  },
] as const satisfies ReadonlyArray<PrintVorlage>;

export type PrintVorlageId = (typeof PRINT_VORLAGEN)[number]['id'];

/** The print Vorlagen of one country, in gallery order. */
export function printVorlagenFor(locale: PrintLocale): PrintVorlage[] {
  return PRINT_VORLAGEN.filter((v) => v.locale === locale);
}
