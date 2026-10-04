import { describe, expect, it } from 'vitest';

import { parseSpeeches } from './protokollParser.js';

// Aus `bundestag/services/analysis/tests/test_kanzler_parsing.py` (Protokoll 21/6),
// ergänzt um Zwischenrufe, eine Zwischenfrage und eine Staatssekretärin.
const PROTOCOL = `
Plenarprotokoll 21/6
Deutscher Bundestag
Stenografischer Bericht

Präsidentin Julia Klöckner:
Wir kommen nun zur Regierungserklärung des Bundeskanzlers.

Friedrich Merz, Bundeskanzler:
Frau Präsidentin! Meine sehr verehrten Damen und Herren!
Deutschland steht vor großen Herausforderungen. Wir müssen
gemeinsam handeln, um unsere Zukunft zu sichern.
(Beifall bei der CDU/CSU sowie bei Abgeordneten der SPD)
Die Bundeswehr wird gestärkt. Vielen Dank.

Präsidentin Julia Klöckner:
Vielen Dank, Herr Bundeskanzler. Das Wort hat Katharina Dröge für die Fraktion Bündnis 90/Die Grünen.

Katharina Dröge (BÜNDNIS 90/DIE GRÜNEN):
Frau Präsidentin! Liebe Kolleginnen und Kollegen! Der Bundeskanzler
hat viel versprochen, aber zum Klimaschutz kein Wort gesagt.
(Zuruf von der AfD: Gut so!)
Das werden wir nicht hinnehmen.

Präsidentin Julia Klöckner:
Gestatten Sie eine Zwischenfrage des Kollegen Chrupalla?

Tino Chrupalla (AfD):
Frau Kollegin, sind Sie nicht auch der Meinung, dass die Bürger andere Sorgen haben als das Klima?

Präsidentin Julia Klöckner:
Als Nächste hat das Wort Dr. Silke Launert.

Dr. Silke Launert, Parl. Staatssekretärin bei der Bundesministerin für Forschung, Technologie und Raumfahrt:
Frau Präsidentin! Meine Damen und Herren! Die Bundesregierung investiert in Forschung und Raumfahrt.
`;

describe('parseSpeeches', () => {
  const speeches = parseSpeeches(PROTOCOL);

  it('erkennt Kanzler, Abgeordnete und Staatssekretärin, aber nie das Präsidium', () => {
    expect(speeches.map((s) => s.speaker)).toEqual([
      'Friedrich Merz',
      'Katharina Dröge',
      'Tino Chrupalla',
      'Dr. Silke Launert',
    ]);
  });

  it('ordnet Regierungsmitgliedern ihre Fraktion zu, auch mit Doktortitel', () => {
    expect(speeches[0]).toMatchObject({ party: 'CDU/CSU', isGovernment: true });
    expect(speeches[3]).toMatchObject({ party: 'CDU/CSU', isGovernment: true });
  });

  it('kürzt Fraktionsnamen auf die Form der Bundestag-Wrapped-Sammlung', () => {
    expect(speeches[1].party).toBe('GRÜNE');
    expect(speeches[2].party).toBe('AfD');
  });

  it('entfernt Beifall und Zwischenrufe aus dem Redetext', () => {
    expect(speeches[0].text).not.toContain('Beifall');
    expect(speeches[1].text).not.toContain('Gut so');
    expect(speeches[1].text).toContain('Das werden wir nicht hinnehmen.');
  });

  it('liest die Redeform aus der Ankündigung des Präsidiums', () => {
    expect(speeches.map((s) => s.speechType)).toEqual(['rede', 'rede', 'zwischenfrage', 'rede']);
  });

  it('hält das Inhaltsverzeichnis nicht für eine Regierungsbefragung', () => {
    const withToc = `
Inhalt:
Tagesordnungspunkt 1: Befragung der Bundesregierung ... 101 A

Beginn: 9.00 Uhr

Präsidentin Julia Klöckner:
Wir beginnen mit der Regierungserklärung.

Friedrich Merz, Bundeskanzler:
Frau Präsidentin! Meine Damen und Herren! Deutschland steht vor großen Aufgaben.
`;
    expect(parseSpeeches(withToc).map((s) => s.speechType)).toEqual(['rede']);
  });

  it('verwirft Beiträge unter 50 Zeichen', () => {
    const short = parseSpeeches('\nAnna Muster (SPD):\nDanke.\n');
    expect(short).toEqual([]);
  });
});
