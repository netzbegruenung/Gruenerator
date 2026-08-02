import { describe, expect, it } from 'vitest';

import { detectManagedSources } from './managedSourceTrigger.js';

/**
 * Der Nachfolger von `classifierSourceScopeReach.vitest.ts`.
 *
 * Die Tabellen sind dieselben — sie waren die Spezifikation des alten
 * Zwei-Stufen-Pfads (Regex hält zurück → LLM entscheidet) und sind jetzt die
 * Spezifikation der einen Stufe, die davon übrig ist. Was sich ändert, ist die
 * geprüfte Eigenschaft: vorher „erreicht den Auflöser", jetzt „liefert die
 * Quelle". Der alte Test konnte die Zuordnung nicht prüfen, weil sie ein
 * gestubbtes Modell traf.
 *
 * ZUM GEWICHT DER NEGATIVFÄLLE: ein Fehltreffer war früher ein Modellaufruf und
 * danach folgenlos. Heute mountet er Werkzeuge und öffnet den Loop. Immer noch
 * keine falsche Antwort — das Modell muss die Werkzeuge nicht rufen —, aber
 * nicht mehr gratis. Deshalb stehen die Politikfälle hier nicht mehr als
 * "wird nicht zurückgehalten", sondern als "liefert keine Quelle".
 */

const MUST_DETECT: ReadonlyArray<readonly [string, string]> = [
  ['bahn', 'Wann fährt der nächste Zug nach Köln?'],
  ['bahn', 'Wie komme ich morgen früh von Freiburg nach Berlin?'],
  ['bahn', 'Hat der ICE 599 Verspätung?'],
  ['hotel', 'Wo kann ich in Nürnberg übernachten?'],
  ['hotel', 'Finde mir eine günstige Unterkunft in Leipzig'],
  ['wetter', 'Wie wird das Wetter morgen in Freiburg?'],
  ['wetter', 'Regnet es heute Nachmittag in Kiel?'],
  ['wetter', 'Wie hoch ist die Pollenbelastung in Nürnberg gerade?'],
  ['wetter', 'Wie ist die Luftqualität heute in Stuttgart?'],
  ['news', 'Was gibt es Neues zum Heizungsgesetz?'],
  ['news', 'Aktuelle Nachrichten aus Sachsen bitte'],
  ['news', 'Was steht heute in der tagesschau?'],
  ['news', 'Welche Schlagzeilen gibt es zur Rentenreform?'],
];

/**
 * Politische Fragen, die dasselbe Vokabular streifen. Sie matchen nicht, weil
 * die nachlaufende `(?!\p{L})`-Grenze Komposita ausschliesst — nicht, weil es
 * eine Verbotsliste gäbe. Genau das hält dieser Block fest.
 */
const MUST_STAY_EMPTY: ReadonlyArray<string> = [
  'Was fordern die Grünen zur Bahnreform?',
  'Wie steht die Partei zur Tourismuspolitik?',
  'Erklär mir die Wetterextreme der letzten Jahre',
  'Welche Position hat die Fraktion zur Verkehrspolitik?',
  'Debatte über Wetterextreme',
];

describe('detectManagedSources — Telegramm & Frage', () => {
  for (const [key, message] of MUST_DETECT) {
    it(`erkennt [${key}] in „${message}"`, () => {
      expect(detectManagedSources(message)).toContain(key);
    });
  }

  for (const message of MUST_STAY_EMPTY) {
    it(`liefert keine Quelle für „${message}"`, () => {
      expect(detectManagedSources(message)).toEqual([]);
    });
  }

  it('greift auch ohne Fragezeichen und ohne Fragewort', () => {
    // Der eigentliche Grund für diesen Trigger: `looksLikeToolableQuestion`
    // verlangt Fragezeichen, Fragewort, führendes Hilfsverb oder Possessiv.
    // Telegramm-Anfragen erfüllen nichts davon und verloren ohne den früheren
    // Intent ihre Quelle.
    expect(detectManagedSources('Wetter Köln morgen')).toEqual(['wetter']);
    expect(detectManagedSources('Zug nach Nürnberg 14 Uhr')).toEqual(['bahn']);
    expect(detectManagedSources('§ 823 BGB')).toEqual(['gesetze']);
  });

  it('liefert mehrere Quellen für einen Reise-Turn', () => {
    // Der Fall, für den es früher die Umbrella-Kategorie `reise` brauchte: ein
    // Intent ist einwertig, eine Connector-Liste nicht.
    expect(detectManagedSources('Zug nach Hamburg und ein Hotel für zwei Nächte')).toEqual([
      'bahn',
      'hotel',
    ]);
  });

  it('lässt Umlaut-Anfänge überhaupt matchen', () => {
    // Regressionsanker: mit `\b` und ohne `u`-Flag konnte keine Alternative
    // feuern, die mit einem Umlaut beginnt.
    expect(detectManagedSources('Wo kann ich übernachten?')).toEqual(['hotel']);
    expect(detectManagedSources('Ich suche eine Übernachtung')).toEqual(['hotel']);
    expect(detectManagedSources('Gibt es Übernachtungsmöglichkeiten?')).toEqual(['hotel']);
  });

  it('ignoriert Vokabular, das nur in einer URL steht', () => {
    expect(detectManagedSources('Fass das zusammen: https://www.bahn.de/angebote')).toEqual([]);
    expect(detectManagedSources('https://wetter.com/koeln ansehen')).toEqual([]);
  });

  it('nimmt leere und triviale Eingaben ohne Treffer', () => {
    expect(detectManagedSources('')).toEqual([]);
    expect(detectManagedSources('   ')).toEqual([]);
    expect(detectManagedSources('Hallo!')).toEqual([]);
  });
});

/**
 * Recht ist der einzige neue Eintrag und der einzige, dessen Vokabular sich mit
 * politischer Rede überschneidet, ohne dass die Kompositum-Grenze hilft:
 * "Heizungsgesetz" IST ein Wort auf `gesetz`. Deshalb triggert kein blosses
 * `gesetz\p{L}*`, sondern nur, was ohne Kontext einen Normtext meint.
 */
describe('detectManagedSources — Recht', () => {
  const LEGAL: ReadonlyArray<string> = [
    'Was steht in § 823 BGB?',
    'Zitiere mir Art. 14 GG',
    'Gilt § 573 BGB noch?',
    'Was sagt das BDSG zur Auftragsverarbeitung?',
    'Ist das gesetzlich vorgeschrieben?',
    'Welches Gesetz regelt die Aufbewahrungsfrist?',
    'Nenne mir die Rechtsgrundlage dafür',
  ];
  for (const message of LEGAL) {
    it(`erkennt Recht in „${message}"`, () => {
      expect(detectManagedSources(message)).toContain('gesetze');
    });
  }

  const NOT_LEGAL: ReadonlyArray<string> = [
    // Politische Rede ÜBER Gesetze — Vokabular von bundestag/news/Programmsuche.
    'Was fordern die Grünen beim Heizungsgesetz?',
    'Der Gesetzentwurf kommt nächste Woche in den Bundestag',
    'Wie läuft das Gesetzgebungsverfahren ab?',
    'Unsere Position zur Gesetzesreform',
  ];
  for (const message of NOT_LEGAL) {
    it(`erkennt KEIN Recht in „${message}"`, () => {
      expect(detectManagedSources(message)).not.toContain('gesetze');
    });
  }

  it('trennt die Nachrichtenfrage zum Gesetz von der Frage nach dem Normtext', () => {
    // Beide enthalten "gesetz". Nur eine will einen Paragrafen.
    expect(detectManagedSources('Was gibt es Neues zum Heizungsgesetz?')).toEqual(['news']);
    expect(detectManagedSources('Was steht in § 19 GEG?')).toEqual(['gesetze']);
  });
});
