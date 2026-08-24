/**
 * Festschreibung, was bei einer echten PDF mit Tabellen aus der Extraktion
 * herauskommt — dem Schritt VOR Chunking, Einbettung und Abruf. Was hier
 * verstümmelt ankommt, kann keine noch so gute Suche wiederherstellen.
 *
 * Deterministisch und ohne Netz: nur die PDF.js-Direktextraktion, also der Pfad,
 * den `OcrService` für text-native PDFs wählt und dessen Ergebnis als Vektoren
 * in Qdrant landet. Der Vergleich mit Mistral OCR braucht einen API-Schlüssel und
 * steht als Skript daneben (`compareExtractors.ts`).
 *
 * Die Zusicherungen unten bilden ZWEI Sachen ab, deutlich getrennt:
 *   1. was schon gut ist (die Werte-Spalte kommt unbeschädigt an), und
 *   2. den Mangel aus #2818, absichtlich festgenagelt. Wird die Extraktion
 *      repariert, schlagen genau diese Zusicherungen fehl — das ist ihr Zweck.
 *      Dann die Erwartung auf `EXPECTED_ROWS` umstellen und den Block löschen.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, beforeAll } from 'vitest';

import { EXPECTED_HEADERS, EXPECTED_ROWS, PDFJS_CHARS } from './expectedTable.js';
import { extractWithPdfJs } from './extractWithPdfJs.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'tabellen-pdf.pdf');

describe('Tabellen-Extraktion aus einer echten PDF', () => {
  let text = '';

  beforeAll(async () => {
    text = await extractWithPdfJs(new Uint8Array(readFileSync(FIXTURE)));
  }, 30_000);

  it('liefert dieselbe Zeichenzahl wie das Backend im Betrieb meldet', () => {
    expect(
      text.length,
      'Weicht das ab, hat sich pdfjs-dist oder die Zusammensetzung geändert — dann sind ' +
        'auch die Zusicherungen unten neu zu messen, nicht anzupassen.'
    ).toBe(PDFJS_CHARS);
  });

  it('trennt heil von zerlegt exakt entlang der Striche', () => {
    // Die Regel, die der ganze Befund ist: pdfjs gibt jeden Binde- und
    // Gedankenstrich als eigenes Text-Item aus, `join(' ')` macht daraus ` - `.
    // Also gilt zellenweise — für Beschriftungen wie für Werte gleichermassen:
    // Zelle MIT Strich → zerlegt, Zelle OHNE Strich → wortgetreu.
    const zellen = EXPECTED_ROWS.flatMap((r) => [r.datenart, r.speicherdauer]);
    const [mitStrich, ohneStrich] = [
      zellen.filter((z) => /[-–]/.test(z)),
      zellen.filter((z) => !/[-–]/.test(z)),
    ];

    expect(mitStrich).toHaveLength(6);
    expect(ohneStrich).toHaveLength(10);

    for (const zelle of ohneStrich) {
      expect(text, `unerwartet beschädigt: ${zelle}`).toContain(zelle);
    }
    for (const zelle of mitStrich) {
      expect(text, `unerwartet heil: ${zelle}`).not.toContain(zelle);
    }
  });

  describe('Mangel #2818 — festgenagelt, nicht gewünscht', () => {
    it('padded jeden Bindestrich in der Beschriftungs-Spalte mit Leerzeichen', () => {
      // `join(' ')` über die Text-Items: pdfjs gibt den Bindestrich als eigenes
      // Item aus, das Zusammensetzen macht daraus ` - `.
      expect(text).toContain('KI - Anfragen bei KI - Dienstleistern');
      expect(text).toContain('Audio - /Videotranskription (Regolo)');
      expect(text).toContain('Echtzeit - Sprachdialog (Mikrofon - /TTS - Stream)');
      expect(text).toContain('Server - Logs');

      // …und damit steht KEINE der vier korrekten Beschriftungen im Text.
      const zerlegt = EXPECTED_ROWS.filter((r) => !text.includes(r.datenart));
      expect(zerlegt.map((r) => r.datenart)).toEqual([
        'KI-Anfragen bei KI-Dienstleistern',
        'Audio-/Videotranskription (Regolo)',
        'Echtzeit-Sprachdialog (Mikrofon-/TTS-Stream)',
        'Server-Logs',
      ]);
    });

    it('zerlegt die Spaltenköpfe buchstabenweise', () => {
      // Der Kopf ist im PDF gesperrt gesetzt; pdfjs gibt jede Glyphe einzeln aus.
      // Ergebnis: ein Kopf, den weder eine Volltextsuche noch eine Einbettung
      // als „Datenart" wiedererkennt.
      expect(text).toContain(EXPECTED_HEADERS.map((h) => h.split('').join(' ')).join('   '));

      // Der Kopf steht damit nirgends als zusammenhängendes Wort ÜBER der
      // Tabelle. („Speicherdauer" kommt weiter unten im Fliesstext vor — deshalb
      // wird hier auf die Fundstelle geprüft, nicht auf das blosse Vorkommen.)
      const tabelle = text.slice(
        text.indexOf('Übersicht der wichtigsten Speicherfristen'),
        text.indexOf('Verarbeitungen im Einzelnen')
      );
      for (const header of EXPECTED_HEADERS) {
        expect(tabelle, `Spaltenkopf unerwartet intakt: ${header}`).not.toContain(header);
      }
    });

    it('trennt Wörter innerhalb von Fließtext an Zeilenumbrüchen des Layouts', () => {
      expect(text).toContain('Dat en');
      expect(text).toContain('Missbra uchserkennung');
    });
  });

  describe('was NICHT die Extraktion verschuldet', () => {
    it('trennt die beiden Tabellenspalten sehr wohl durch Leerraum', () => {
      // Gegenprobe zu den zusammengelaufenen Wörtern in einer Modellantwort
      // („Benutzerprofilebis zur Löschung"). Die stehen so NICHT im Chunk —
      // das Modell hat den Spaltenabstand beim Zitieren verschluckt.
      expect(text).toContain('Benutzerprofile   bis zur Löschung durch die Nutzer*in');
      expect(text).not.toContain('Benutzerprofilebis');
      expect(text).not.toContain('anschließendgelöscht');
      expect(text).not.toContain('Dienstleisternmax');
    });
  });
});
