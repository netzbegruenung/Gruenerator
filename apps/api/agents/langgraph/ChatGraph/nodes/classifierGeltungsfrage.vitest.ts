import { describe, it, expect } from 'vitest';

import { heuristicClassify } from './classifierHeuristics.js';
import { DEMOTABLE_HEURISTIC_INTENTS, looksLikeGeltungsfrage } from './classifierSignals.js';

/**
 * Die GELTUNGSFRAGE — der Detektor hinter der Heuristik-Regel `web.geltungsfrage`
 * und hinter der Stand-Regel in `respondNode`.
 *
 * Der Zuschnitt ist der ganze Befund aus #2949: nicht „Rechtsfrage" löst aus,
 * sondern die Frage nach einem JETZT-Zustand. Deshalb prüfen die Negativfälle
 * hier härter als die Positivfälle — eine Regel, die jede Gesetzesnennung in
 * eine erzwungene Suche schickt, wäre die naheliegende und falsche Reparatur.
 */
describe('looksLikeGeltungsfrage', () => {
  it('trifft den Prompt aus #2949', () => {
    expect(
      looksLikeGeltungsfrage(
        'Gilt das Verbrenner-Aus ab 2035 in der EU noch? Antworte in zwei getrennten ' +
          'Abschnitten: (a) was rechtlich in Kraft ist, (b) was politisch verhandelt wird ' +
          'und noch nicht gilt. Nenne für beides den Rechtsakt bzw. das Verfahrensstadium.'
      )
    ).toBe(true);
  });

  it.each([
    ['Ist das Lieferkettengesetz noch in Kraft?'],
    ['Ist das Heizungsgesetz schon beschlossen?'],
    ['Wurde das Verbrenner-Aus 2035 gekippt?'],
    ['Ist der Kohleausstieg 2030 noch gültig?'],
    ['Wie ist der Stand des Verfahrens zur EU-Verordnung?'],
    ['Gälte das Statut auch außer Kraft?'],
  ])('trifft %s', (q) => {
    expect(looksLikeGeltungsfrage(q)).toBe(true);
  });

  // Das Kompositum ist der Regelfall, nicht die Ausnahme: eine führende
  // Wortgrenze vor `gesetz` fand „das Gesetz" und verfehlte „Lieferkettengesetz"
  // — also gerade die Normen, nach denen gefragt wird.
  it.each([
    ['Lieferkettengesetz'],
    ['Klimaschutzgesetz'],
    ['Heizungsgesetz'],
    ['Bundesnaturschutzgesetz'],
  ])('sieht die Norm auch im Kompositum: %s', (norm) => {
    expect(looksLikeGeltungsfrage(`Ist das ${norm} noch in Kraft?`)).toBe(true);
  });

  // Eine Rechtsfrage ist keine Geltungsfrage: der Normtext ist stabil, seine
  // Geltung nicht. Genau diese Trennung verhindert „bei Rechtsfragen immer
  // suchen".
  it('trifft eine Frage nach dem Normtext NICHT', () => {
    expect(looksLikeGeltungsfrage('Was steht in § 184k StGB?')).toBe(false);
  });

  it.each([
    ['Gilt das auch für mein Dokument?'],
    ['Gilt das auch noch für mein Dokument?'],
    ['Warum haben die Grünen das Verbrenner-Aus ab 2035 abgelehnt?'],
    ['Wer ist aktuell Bundeskanzler in Österreich?'],
    ['Fasse das Gespräch zusammen'],
    [''],
  ])('trifft %s NICHT', (q) => {
    expect(looksLikeGeltungsfrage(q)).toBe(false);
  });

  // Die Regel steht im Heuristik-Tisch VOR den Erstellungsregeln und würde sie
  // sonst verdecken.
  it.each([
    ['Schreibe eine PM zum Gesetz, das 2026 in Kraft tritt'],
    ['Erstelle ein Sharepic zum Verbrenner-Aus 2035'],
    ['Formuliere einen Antrag zur Verordnung, die seit 2024 in Kraft ist'],
  ])('lässt den Erstellungsauftrag durch: %s', (q) => {
    expect(looksLikeGeltungsfrage(q)).toBe(false);
  });

  /**
   * Die Fälle aus dem Review von #2952 — jeder war ein echter Fehltreffer der
   * ersten Fassung.
   *
   * Die drei Klassen darin sind lehrreich, weil sie verschiedene Fehler sind:
   * ein Ausschluss-Wächter, der zu viel ausschliesst (und damit den ganzen
   * Detektor abschaltet), ein zu enges Zeichenfenster, und ein Stamm, der
   * mitten in ein fremdes Wort trifft.
   */
  describe('Rückfälle aus dem Review', () => {
    // Der gefährlichste: `verfass\w*` traf „Verfassung"/„verfasst",
    // `formulier\w*` traf „Formulierung" — und schaltete den Detektor ab,
    // BEVOR irgendetwas anderes geprüft wurde. Dieselbe Fehlerform wie #2949,
    // erzeugt durch die Reparatur.
    it.each([
      ['Ist die Verordnung, die 2019 verfasst wurde, noch gültig?'],
      ['Ist die Formulierung des Paragraphen noch gültig?'],
      ['Gilt die Verfassungsänderung von 2019 noch?'],
      ['Ist die Erstellung der Satzung 2024 noch in Kraft?'],
    ])('der Ausschluss-Wächter greift nicht mehr mitten im Wort: %s', (q) => {
      expect(looksLikeGeltungsfrage(q)).toBe(true);
    });

    // Ein Relativsatz zwischen Norm und Frage ist im Rechtsregister der
    // Normalfall. 60 Zeichen waren zu wenig.
    it('überbrückt einen Relativsatz zwischen Verb und „noch"', () => {
      expect(
        looksLikeGeltungsfrage(
          'Gilt das Klimaschutzgesetz, das im Sommer nach monatelangen zähen ' +
            'Verhandlungen im Bundestag und im Bundesrat schließlich verabschiedet ' +
            'wurde, eigentlich noch?'
        )
      ).toBe(true);
    });

    // Die Gegenrichtung: der Stamm mitten im fremden Wort.
    it.each([
      ['Bin ich raus, vorausgesetzt das gilt noch?'],
      ['Gilt der Vertrag noch, vorausgesetzt es gab keine Kündigung?'],
      ['Ist die Zusage noch gültig, oder ist sie befristet gewesen?'],
    ])('trifft den Normstamm in der Wortmitte NICHT: %s', (q) => {
      expect(looksLikeGeltungsfrage(q)).toBe(false);
    });

    // Das blosse Partizip beginnt mit einer echten Wortgrenze — die Naht-Regel
    // allein fängt es nicht, deshalb der Zusatz an `gesetz`. OHNE Jahreszahl
    // geprüft: eine Jahreszahl trägt Faktor B ohnehin allein, und dann sagt der
    // Fall nichts mehr über den Stamm aus.
    it('trifft das blosse Partizip „gesetzt" NICHT', () => {
      expect(looksLikeGeltungsfrage('Gilt das Ziel noch, das damals gesetzt wurde?')).toBe(false);
    });
  });

  // Ein Verbot trägt sein Objekt — siehe `forbidsNewResearch`. Hier ist das
  // unkritisch, weil `shouldForceFirstToolCall` unter `researchBanned` als
  // Erstes abbricht; der Fall steht trotzdem fest, damit eine spätere Änderung
  // ihn nicht stillschweigend zum Zwang macht.
  it('trifft auch die Frage, die das Nachschlagen ausschließt (Zwang vetoed woanders)', () => {
    expect(looksLikeGeltungsfrage('Ohne neue Recherche: Gilt die Verordnung von 2019 noch?')).toBe(
      true
    );
  });
});

/**
 * Die Kette, die den Befund aus #2949 auflöst — an ihrem ERSTEN Glied geprüft.
 *
 * `web` ist hier kein Geschmacksurteil, sondern der Träger des Zwangs: nur ein
 * Verdikt aus `DEMOTABLE_HEURISTIC_INTENTS` lässt Tier 3.5
 * `loopDemotedFromRetrieval` setzen, und erst diese Flagge lässt
 * `shouldForceFirstToolCall` (Weg 4) einen Abruf abverlangen. Fällt dieser Test,
 * fällt der ganze Fix still — der Turn liefe wieder als gewöhnlicher
 * agentischer Turn und der Planer dürfte nichts rufen.
 */
describe('heuristicClassify — web.geltungsfrage', () => {
  it('gibt für den Prompt aus #2949 ein Abruf-Verdikt statt des Residuums', () => {
    const r = heuristicClassify(
      'Gilt das Verbrenner-Aus ab 2035 in der EU noch? Antworte in zwei getrennten ' +
        'Abschnitten: (a) was rechtlich in Kraft ist, (b) was politisch verhandelt wird ' +
        'und noch nicht gilt. Nenne für beides den Rechtsakt bzw. das Verfahrensstadium.'
    );
    expect(r.intent).toBe('web');
    expect(DEMOTABLE_HEURISTIC_INTENTS.has(r.intent)).toBe(true);
    expect(r.searchQuery).toBeTruthy();
  });

  it('lässt die Nachbarfrage nach dem Grund unberührt', () => {
    // Steht schon als gepinnter Fall in `forceFirstToolCall.vitest.ts`: dieser
    // Turn soll weiterhin NICHT zwingen.
    expect(
      heuristicClassify('Warum haben die Grünen das Verbrenner-Aus ab 2035 abgelehnt?').intent
    ).not.toBe('web');
  });
});
