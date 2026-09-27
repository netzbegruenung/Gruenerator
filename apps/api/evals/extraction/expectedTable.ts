/**
 * Der SOLL-Stand für die Tabelle „Übersicht der wichtigsten Speicherfristen"
 * aus `__fixtures__/tabellen-pdf.pdf` (Datenschutzerklärung, Stand 09.07.2026,
 * 8 Seiten).
 *
 * Von Hand am gerenderten PDF abgelesen und gegen Mistral OCR gegengeprüft
 * (`compareExtractors.ts` ohne `tableFormat` liefert exakt diese acht Zeilen).
 * Die Tabelle hat **acht** Zeilen — nicht mehr. Wer eine Antwort auf „was steht
 * unter Speicherfristen" bewertet, zählt gegen diese Liste.
 */
export const EXPECTED_ROWS: ReadonlyArray<{ datenart: string; speicherdauer: string }> = [
  { datenart: 'Sitzungsdaten (Redis)', speicherdauer: 'bis Sitzungsende, max. 24 Stunden' },
  { datenart: 'Benutzerprofile', speicherdauer: 'bis zur Löschung durch die Nutzer*in' },
  {
    datenart: 'KI-Anfragen bei KI-Dienstleistern',
    speicherdauer: 'max. 30 Tage (Missbrauchserkennung)',
  },
  {
    datenart: 'Audio-/Videotranskription (Regolo)',
    speicherdauer: 'Zero Data Retention – Löschung am Ende der Session',
  },
  {
    datenart: 'Echtzeit-Sprachdialog (Mikrofon-/TTS-Stream)',
    speicherdauer: 'Live-Stream ohne Persistierung',
  },
  { datenart: 'Fehlerberichte (GlitchTip)', speicherdauer: '90 Tage' },
  { datenart: 'Reichweitenmessung (Umami)', speicherdauer: '13 Monate' },
  { datenart: 'Server-Logs', speicherdauer: '7 Tage' },
];

/** Die Spaltenköpfe derselben Tabelle. */
export const EXPECTED_HEADERS = ['Datenart', 'Speicherdauer'] as const;

/** Gemessene Zeichenzahl der PDF.js-Direktextraktion — dieselbe Zahl, die das
 *  Backend-Log meldet (`PDF.js extraction completed: 8/8 pages, … characters`).
 *  Weicht sie ab, hat sich pdfjs-dist oder die Zusammensetzung geändert.
 *  Gemessen 26.08.2026 mit der geometrie-basierten Zusammensetzung aus #2830
 *  (vorher, mit `join(' ')`: 18 601). */
export const PDFJS_CHARS = 17_500;
