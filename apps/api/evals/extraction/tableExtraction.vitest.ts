/**
 * Festschreibung, was bei einer echten PDF mit Tabellen aus der Extraktion
 * herauskommt — dem Schritt VOR Chunking, Einbettung und Abruf. Was hier
 * verstümmelt ankommt, kann keine noch so gute Suche wiederherstellen.
 *
 * Deterministisch und ohne Netz: nur die PDF.js-Direktextraktion, also der Pfad,
 * den `OcrService` für text-native PDFs wählt. Seit #2828 umgeht der Chat-Anhang
 * ihn (der OCR-Text wird durchgereicht); der Dokument-Upload über
 * `processUploadedDocument` läuft weiter hier hindurch. Der Vergleich mit Mistral OCR braucht einen API-Schlüssel und
 * steht als Skript daneben (`compareExtractors.ts`).
 *
 * Die Zusicherungen unten bilden ZWEI Sachen ab, deutlich getrennt:
 *   1. den Stand seit #2830: die Items werden geometrie-basiert zusammengesetzt
 *      (`textItemJoin.ts`), alle 16 Zellen kommen wortgetreu an, jede
 *      Tabellenzeile steht auf einer eigenen Zeile; und
 *   2. den verbleibenden Mangel, absichtlich festgenagelt: gesperrt gesetzte
 *      Spaltenköpfe. pdfjs baut deren Leerzeichen bereits INNERHALB eines
 *      einzelnen Text-Items in `str` ein — zwischen den Items ist nichts mehr
 *      zu entscheiden, keine Join-Logik kann das reparieren. Wird DAS einmal
 *      behoben (anderer Extraktor, Glyphen-Ebene), schlägt genau dieser Block
 *      fehl — dann die Erwartung auf `EXPECTED_HEADERS` umstellen und den
 *      Block löschen.
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

  it('liefert alle 16 Zellen wortgetreu', () => {
    // Der Kern von #2830: pdfjs gibt Binde- und Gedankenstriche als eigene
    // Text-Items aus; das alte `join(' ')` machte daraus ` - ` und zerlegte
    // damit exakt die sechs Zellen mit Strich. Die geometrie-basierte
    // Zusammensetzung fügt Items nahtlos, wenn das nächste dort beginnt, wo
    // das vorige endet — seither überleben alle Zellen, mit wie ohne Strich.
    for (const zelle of EXPECTED_ROWS.flatMap((r) => [r.datenart, r.speicherdauer])) {
      expect(text, `Zelle beschädigt: ${zelle}`).toContain(zelle);
    }
  });

  it('stellt jede Tabellenzeile auf eine eigene Zeile', () => {
    // Zeilenwechsel kommen als `hasEOL`-Items und werden zu `\n` — vorher war
    // die ganze Seite EIN Einzeiler. Damit steht jede Zeile der Tabelle als
    // `Datenart Speicherdauer` beisammen, für Chunking wie für ein Modell lesbar.
    for (const r of EXPECTED_ROWS) {
      expect(text).toContain(`\n${r.datenart} ${r.speicherdauer}\n`);
    }
  });

  it("repariert die früheren Wort-Zerlegungen des join(' ')", () => {
    // Die Artefakte aus #2818, an denen der Befund hing — alle vom selben
    // Ursprung, alle mit der Zusammensetzung verschwunden.
    expect(text).not.toContain('KI - Anfragen');
    expect(text).not.toContain('Server - Logs');
    expect(text).not.toContain('Dat en');
    expect(text).not.toContain('Missbra uchserkennung');
    expect(text).toContain('Zwei-Faktor-Authentifizierung');
    expect(text).toContain('Missbrauchserkennung');
  });

  describe('verbleibender Mangel — festgenagelt, nicht gewünscht', () => {
    it('lässt gesperrt gesetzte Spaltenköpfe buchstabenweise zerlegt', () => {
      // Der Kopf ist im PDF gesperrt gesetzt; pdfjs liefert ihn als EIN Item
      // mit den Leerzeichen bereits in `str` („D a t e n a r t"). Das ist der
      // Ebene der Item-Zusammensetzung nicht zugänglich. Ergebnis: ein Kopf,
      // den weder eine Volltextsuche noch eine Einbettung als „Datenart"
      // wiedererkennt — die Tabelle hat im Index effektiv keine Überschrift.
      expect(text).toContain(EXPECTED_HEADERS.map((h) => h.split('').join(' ')).join(' '));

      // („Speicherdauer" kommt weiter unten im Fliesstext vor — deshalb
      // wird hier auf die Fundstelle geprüft, nicht auf das blosse Vorkommen.)
      const tabelle = text.slice(
        text.indexOf('Übersicht der wichtigsten Speicherfristen'),
        text.indexOf('Verarbeitungen im Einzelnen')
      );
      for (const header of EXPECTED_HEADERS) {
        expect(tabelle, `Spaltenkopf unerwartet intakt: ${header}`).not.toContain(header);
      }
    });
  });

  describe('was NICHT die Extraktion verschuldet', () => {
    it('trennt die beiden Tabellenspalten sehr wohl durch Leerraum', () => {
      // Gegenprobe zu den zusammengelaufenen Wörtern in einer Modellantwort
      // („Benutzerprofilebis zur Löschung"). Die stehen so NICHT im Chunk —
      // das Modell hat den Spaltenabstand beim Zitieren verschluckt.
      expect(text).toContain('Benutzerprofile bis zur Löschung durch die Nutzer*in');
      expect(text).not.toContain('Benutzerprofilebis');
      expect(text).not.toContain('anschließendgelöscht');
      expect(text).not.toContain('Dienstleisternmax');
    });
  });
});
