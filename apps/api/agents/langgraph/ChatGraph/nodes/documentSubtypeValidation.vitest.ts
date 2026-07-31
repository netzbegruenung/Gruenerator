import { describe, it, expect } from 'vitest';

import { CLASSIFIER_DOC_SUBTYPES, detectDocumentSubtype } from './classifierSignals.js';

/**
 * Welchen Dokumenttyp der Nutzer GENANNT hat.
 *
 * Vorher beantwortete das die LLM-Stufe, und die Prüfung hier war eine
 * Validierung: das Modell erfand gelegentlich einen plausiblen Wert ausserhalb
 * der erlaubten Menge („brief"), der als `subtypeOverride` an jeder weiteren
 * Prüfung vorbei bis ins INSERT reiste, wo erst
 * `collaborative_documents_document_subtype_check` ihn abwies — der Turn schlug
 * fehl und der Chat sagte nichts.
 *
 * Deterministisch kann dieser Fehler nicht mehr auftreten (die Funktion gibt nur
 * Werte aus der Liste zurück, der Compiler erzwingt es). Was jetzt zu prüfen
 * ist, ist die andere Richtung: erkennt sie das Wort überhaupt, und schweigt sie
 * da, wo keins steht.
 *
 * Warum ein Wortmuster hier ausreicht und kein Verlust ist: das Feld war nie ein
 * Urteil, sondern ein Rücklesen. Auf dem Erzeugungspfad wählt der
 * Dokumentgenerator seinen Subtyp ohnehin selbst aus dem fertigen Inhalt und
 * validiert ihn; der Override ist nur ein Hinweis. Entschieden hat er an genau
 * einer Stelle etwas — in der Bestätigungs-Aktion (`buildPendingAction`), wo
 * ohne ihn jedes Dokument als `docs` in die Datenbank ging.
 */

describe('detectDocumentSubtype', () => {
  it.each([
    ['Speicher das als Pressemitteilung', 'pressemitteilung'],
    ['Mach eine PM daraus', 'pressemitteilung'],
    ['Schreib mir einen Antrag für mehr Straßenbäume', 'antrag'],
    ['Das als Protokoll ablegen', 'protokoll'],
    ['Leg einen Redaktionsplan an', 'redaktionsplan'],
    ['Als Checkliste speichern', 'checkliste'],
    ['Mach eine Einladung daraus', 'einladung'],
    ['Speicher das als Notizen', 'notizen'],
  ])('%s → %s', (text, expected) => {
    expect(detectDocumentSubtype(text)).toBe(expected);
  });

  it('schweigt, wo kein Typ genannt ist', () => {
    // Der wichtigste Fall: `null` heisst „der Generator entscheidet selbst".
    // Ein geratener Typ wäre schlechter als keiner — er GEWINNT stromabwärts
    // gegen das Urteil des Generators, der den fertigen Text gesehen hat.
    expect(detectDocumentSubtype('Speicher das als Dokument')).toBeNull();
    expect(detectDocumentSubtype('Kannst du das festhalten?')).toBeNull();
    expect(detectDocumentSubtype('')).toBeNull();
  });

  it('nimmt bei zwei Nennungen die letzte als Ziel', () => {
    // „Mach aus dem Protokoll eine Pressemitteilung" nennt erst die Quelle,
    // dann das Ziel. Die umgekehrte Formulierung ist ein bekannter Fehlgriff
    // und kostet den Hinweis, nicht den Typ — siehe Kommentar an der Funktion.
    expect(detectDocumentSubtype('Mach aus dem Protokoll eine Pressemitteilung')).toBe(
      'pressemitteilung'
    );
  });

  it('liefert ausschliesslich Werte, die die Datenbank akzeptiert', () => {
    // Die Zusicherung, die den ursprünglichen Produktionsfehler ersetzt: was
    // hier herauskommt, muss in der Menge liegen, gegen die die
    // Check-Constraint prüft.
    // Über die Konstante selbst iteriert, nicht über eine zweite Liste daneben:
    // ein neuer Subtyp ohne Muster fällt damit sofort auf, statt still zu fehlen.
    const found = CLASSIFIER_DOC_SUBTYPES.map((s) =>
      detectDocumentSubtype(`Speicher das als ${s}`)
    );

    expect(found).toEqual([...CLASSIFIER_DOC_SUBTYPES]);
  });
});
