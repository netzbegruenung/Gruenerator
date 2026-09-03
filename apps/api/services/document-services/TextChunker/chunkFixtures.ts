/**
 * Fixture-Dokumente für die Chunker-Tests.
 *
 * Eine Falle, die jeden Test hier lautlos wertlos macht: `sentenceSegments`
 * erkennt einen Satzschluss nur, wenn nach dem Punkt ein GROSSBUCHSTABE folgt
 * (siehe Kopfkommentar von `chunkPostProcessing.vitest.ts`). Kleingeschriebener
 * Fülltext verschmilzt sonst zu einem einzigen Riesensegment. Deshalb beginnt
 * hier jeder Satz mit einem Großbuchstaben.
 *
 * `PROSE_FIXTURE` trägt bewusst KEIN `#`, KEINE Pipe-Zeile und keine Zeile, die
 * mit einer Zahl beginnt — es ist das Dokument, dessen Chunk-Grenzen sich durch
 * diesen Umbau nicht um ein Byte verschieben dürfen.
 */

const ABSATZ_1 =
  'Die Wärmewende ist die größte Aufgabe der kommenden Jahre. ' +
  'Wir wollen den Umstieg auf klimaneutrale Heizungen sozial gerecht gestalten. ' +
  'Niemand soll durch die Umstellung überfordert werden. ' +
  'Deshalb koppeln wir die Förderung an das Einkommen der Haushalte. ' +
  'Kommunen brauchen dafür verlässliche Planungsgrundlagen und eine dauerhafte Finanzierung.';

const ABSATZ_2 =
  'Die kommunale Wärmeplanung ist der Schlüssel zu bezahlbarer Wärme. ' +
  'Sie zeigt jedem Haushalt, welche Lösung am eigenen Standort sinnvoll ist. ' +
  'Wärmenetze lohnen sich in dichter Bebauung, Wärmepumpen im Bestand der Randlagen. ' +
  'Wir wollen, dass jede Kommune ihre Planung bis zum Ende des Jahrzehnts vorlegt. ' +
  'Der Bund trägt die Kosten der Erstellung, damit auch finanzschwache Kommunen mitkommen.';

const ABSATZ_3 =
  'Handwerk und Ausbildung entscheiden über das Tempo der Umstellung. ' +
  'Ohne Fachkräfte bleibt jede Förderung ein Versprechen auf dem Papier. ' +
  'Wir stärken die überbetriebliche Ausbildung und die Anerkennung ausländischer Abschlüsse. ' +
  'Betriebe erhalten Zuschüsse für die Weiterbildung ihrer Beschäftigten. ' +
  'So entsteht die Kapazität, die der Umstieg tatsächlich braucht.';

const ABSATZ_4 =
  'Mieterinnen und Mieter dürfen die Kosten nicht allein tragen. ' +
  'Die Modernisierungsumlage begrenzen wir und koppeln sie an den erreichten Effizienzgewinn. ' +
  'Vermieterinnen und Vermieter erhalten im Gegenzug eine verlässliche Förderkulisse. ' +
  'Wer früh saniert, soll besser gestellt sein als wer wartet. ' +
  'Das Ziel ist ein Umstieg, der die Warmmiete stabil hält.';

const ABSATZ_5 =
  'Die Industrie braucht grünen Wasserstoff dort, wo Strom nicht reicht. ' +
  'Wir konzentrieren die knappen Mengen auf Stahl, Chemie und Zement. ' +
  'Für die Gebäudewärme ist Wasserstoff die teuerste aller Optionen. ' +
  'Diese Priorisierung schreiben wir in der Förderung verbindlich fest. ' +
  'Nur so entsteht Planungssicherheit für die Investitionen der nächsten Jahre.';

const ABSATZ_6 =
  'Die Umstellung gelingt nur mit einer ehrlichen Debatte über die Kosten. ' +
  'Wir legen offen, was der Umstieg kostet und wer ihn trägt. ' +
  'Die Alternative ist nicht billiger, sie ist nur später fällig. ' +
  'Jedes Jahr Verzögerung erhöht den Preis der Anpassung. ' +
  'Deshalb beginnen wir jetzt und nicht in der nächsten Wahlperiode.';

/** Reiner Fließtext — der Regressionsriegel. Keine Überschrift, keine Tabelle. */
export const PROSE_FIXTURE = [ABSATZ_1, ABSATZ_2, ABSATZ_3, ABSATZ_4, ABSATZ_5, ABSATZ_6].join(
  '\n\n'
);

/** Überschriftenbaum H1/H2/H3, je ein Prosablock, plus eine sechszeilige Pipe-Tabelle. */
export const STRUCTURED_FIXTURE = [
  '# Kapitel 3: Wärmewende',
  '',
  ABSATZ_1,
  '',
  '## 3.1 Förderprogramme',
  '',
  ABSATZ_2,
  '',
  '| Programm | Zielgruppe | Satz |',
  '| --- | --- | --- |',
  '| Heizungstausch | Eigentum | 30 Prozent |',
  '| Einkommensbonus | bis 40.000 Euro | 30 Prozent |',
  '| Klimageschwindigkeit | Austausch vor 2028 | 20 Prozent |',
  '| Effizienzbonus | Wärmepumpe | 5 Prozent |',
  '',
  '### 3.1.1 Antragsweg',
  '',
  ABSATZ_3,
  '',
  '## 3.2 Wärmenetze',
  '',
  ABSATZ_4,
].join('\n');

/** Eine Tabelle jenseits von 2400 Zeichen — muss zeilenweise geteilt werden. */
export const LONG_TABLE_FIXTURE = [
  '# Förderübersicht',
  '',
  '| Kommune | Programm | Betrag | Laufzeit | Hinweis |',
  '| --- | --- | --- | --- | --- |',
  ...Array.from(
    { length: 40 },
    (_, i) =>
      `| Musterstadt ${i + 1} | Wärmenetzausbau Abschnitt ${i + 1} | ${(i + 1) * 125_000} Euro | ${2027 + (i % 5)} bis ${2030 + (i % 5)} | Bewilligung liegt vor, Mittelabruf quartalsweise |`
  ),
].join('\n');

/** Nur eine kleine Tabelle, ohne Überschrift ringsum. */
export const TABLE_ONLY_FIXTURE = [
  '| Jahr | Anteil |',
  '| --- | --- |',
  '| 2026 | 18 Prozent |',
  '| 2027 | 24 Prozent |',
].join('\n');

/**
 * Fünf kurze Abschnitte, jeder deutlich unter 800 Zeichen — die Form, an der
 * die Blockzerlegung ohne `mergeSiblingTextBlocks` fünf Kleinstchunks erzeugt.
 */
export const SHORT_SECTIONS_FIXTURE = [
  '# Kommunalwahlprogramm',
  '',
  'Wir treten mit fünf Schwerpunkten an. Jeder Schwerpunkt steht für sich.',
  '',
  '## 1 Verkehr',
  '',
  'Wir bauen das Radwegenetz aus. Der Busverkehr wird dichter getaktet.',
  '',
  '## 2 Wohnen',
  '',
  'Wir sichern bezahlbaren Wohnraum. Die Stadt kauft Belegungsrechte zurück.',
  '',
  '## 3 Bildung',
  '',
  'Jede Schule bekommt eine Sozialarbeitsstelle. Die Sanierung wird beschleunigt.',
  '',
  '## 4 Klima',
  '',
  'Die Wärmeplanung liegt bis zum Jahresende vor. Dächer werden für Photovoltaik geöffnet.',
  '',
  '## 5 Verwaltung',
  '',
  'Anträge laufen künftig digital. Die Bearbeitungszeit sinkt spürbar.',
].join('\n');
