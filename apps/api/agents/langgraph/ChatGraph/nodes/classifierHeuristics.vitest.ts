import { describe, it, expect } from 'vitest';

import { extractDomainScope, heuristicClassify } from './classifierHeuristics.js';

/**
 * extractDomainScope turns "such auf zeit.de und spiegel.de nach X" into
 * `includeDomains`/`excludeDomains` for Linkup. The load-bearing rule (4) is
 * that an unmarked or ambiguous mention returns nothing rather than guessing
 * — a scope that silently narrows every later search in the turn is worse
 * than no scope, so these tests lean on cases that could plausibly be
 * misread rather than only the clean positive cases.
 */
describe('extractDomainScope', () => {
  it('scopes a single domain named with an include preposition', () => {
    expect(
      extractDomainScope('Suche bitte auf zeit.de nach Neuigkeiten zur Klimapolitik.')
    ).toEqual({ include: ['zeit.de'], exclude: [] });
  });

  it('scopes both domains in an "und"-joined enumeration to the same polarity', () => {
    expect(extractDomainScope('Suche auf zeit.de und spiegel.de nach Klimapolitik.')).toEqual({
      include: ['zeit.de', 'spiegel.de'],
      exclude: [],
    });
  });

  it('scopes a comma-joined enumeration (no "und") to the same polarity', () => {
    expect(extractDomainScope('Suche auf zeit.de, spiegel.de nach Klimapolitik.')).toEqual({
      include: ['zeit.de', 'spiegel.de'],
      exclude: [],
    });
  });

  it('excludes a domain introduced with "nicht von"', () => {
    expect(extractDomainScope('Suche nach Klimapolitik, aber nicht von spiegel.de.')).toEqual({
      include: [],
      exclude: ['spiegel.de'],
    });
  });

  it('excludes a domain introduced with "ohne"', () => {
    expect(extractDomainScope('Suche nach Klimapolitik, ohne focus.de.')).toEqual({
      include: [],
      exclude: ['focus.de'],
    });
  });

  it('splits a mixed include/exclude sentence into both lists', () => {
    expect(
      extractDomainScope('Suche auf zeit.de, aber nicht von spiegel.de nach dem Artikel.')
    ).toEqual({ include: ['zeit.de'], exclude: ['spiegel.de'] });
  });

  it('returns nothing when the same domain is mentioned as both include and exclude (exclude wins)', () => {
    expect(extractDomainScope('Suche auf zeit.de, aber nicht von zeit.de zu Sportthemen.')).toEqual(
      { include: [], exclude: ['zeit.de'] }
    );
  });

  it('returns an empty scope when no search verb is present at all', () => {
    // The literal motivating example: "auf zeit.de" sits right next to the
    // domain, but the sentence reports on zeit.de rather than asking to
    // search it — there is no search verb anywhere to license the marker.
    expect(extractDomainScope('Die Zeit hat auf zeit.de berichtet, was hältst du davon?')).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('returns an empty scope when a domain is mentioned with no marker in front of it', () => {
    expect(extractDomainScope('Suche Infos zur Klimapolitik. zeit.de wird oft zitiert.')).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('drops a domain that also appears as a full URL in the same message', () => {
    // Full URL == "read this page" (scrape_url); bare domain == "scope the
    // search to this site". zeit.de stays scoped, spiegel.de is a scrape target.
    expect(
      extractDomainScope(
        'Suche auf zeit.de und lies auch https://spiegel.de/politik/artikel-123 durch.'
      )
    ).toEqual({ include: ['zeit.de'], exclude: [] });
  });

  it('strips a leading "www." prefix from the domain', () => {
    expect(extractDomainScope('Suche bei www.taz.de nach der Landtagswahl.')).toEqual({
      include: ['taz.de'],
      exclude: [],
    });
  });

  it('does not treat a file extension as a domain', () => {
    expect(extractDomainScope('Suche auf bericht.pdf nach dem Inhalt.')).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('does not treat a version number or IP-shaped token as a domain', () => {
    expect(
      extractDomainScope('Suche auf 3.14 und 192.168.1.1 nach passenden Ergebnissen.')
    ).toEqual({ include: [], exclude: [] });
  });

  it('returns an empty scope for an empty string', () => {
    expect(extractDomainScope('')).toEqual({ include: [], exclude: [] });
  });

  it('returns an empty scope for a null-ish input without throwing', () => {
    expect(extractDomainScope(null as unknown as string)).toEqual({ include: [], exclude: [] });
    expect(extractDomainScope(undefined as unknown as string)).toEqual({
      include: [],
      exclude: [],
    });
  });

  it('recognises Austrian domains (orf.at, derstandard.at)', () => {
    expect(
      extractDomainScope('Suche ausschliesslich auf orf.at und derstandard.at nach der Wahl.')
    ).toEqual({ include: ['orf.at', 'derstandard.at'], exclude: [] });
  });
});

// Beta 30.09.2026: ein 386-Zeichen-Newsletter mit „Sharepics" darin machte aus
// jeder Korrektur ein Sharepic — die 500-Zeichen-Grenze fängt kurzen Stoff nicht.
describe('heuristicClassify — Sharepic-Wort im mitgebrachten Stoff', () => {
  const NEWSLETTER =
    'Im September hat der Kreisverband zwei neue Werkzeuge vorgestellt: Der Untertitler versieht Reels automatish mit Untertiteln, und die neue Suche findet Beschlüsse aus den letzten zehn Jahren. Beim Sommerfest kamen über 80 Menschen, und unsere Sharepics zur Kommunalwahl wurden mehr als 2.000 Mal geteilt. Schreibt uns eure Rückmeldungne bis zum 15. Oktober!';

  it.each(['rechtschreibung korrigieren', 'übersetze das ins Englische', 'kürzer bitte'])(
    'macht aus Newsletter + „%s" kein Sharepic',
    (order) => {
      expect(heuristicClassify(`${NEWSLETTER}\n\n${order}`).intent).not.toBe('sharepic');
      expect(heuristicClassify(`${order}:\n\n${NEWSLETTER}`).intent).not.toBe('sharepic');
    }
  );

  it('nimmt ein Sharepic, wenn der Auftrag es nennt', () => {
    expect(heuristicClassify(`${NEWSLETTER}\n\nmach daraus ein Sharepic`).intent).toBe('sharepic');
    expect(heuristicClassify('erstelle ein Sharepic zur Wärmepumpe').intent).toBe('sharepic');
  });
});

// Beta-Audit 30.09.2026: die Regel feuerte auf das Nomen allein, mit 0.93.
describe('heuristicClassify — Sharepic nur auf Bestellung', () => {
  it.each([
    'Erstelle ein Sharepic zur Wärmepumpe',
    'mach daraus ein Sharepic',
    'Sharepic zum Klimageld',
    'ein Zitatbild mit Robert Habeck',
    'Kannst du mir ein Sharepic zum Tempolimit machen?',
    'Ich hätte gern ein Sharepic zu Solar',
    'Dreizeiler zur Mietpreisbremse',
  ])('bleibt Sharepic: %s', (text) => {
    expect(heuristicClassify(text).intent).toBe('sharepic');
  });

  it.each([
    'Schreib eine Pressemitteilung. Dazu passt später ein Sharepic.',
    "Ich brauche Infos zur Kampagne 'Grün wirkt' – Plakat, Sharepic, Flyer",
    'Letzten Monat haben wir 12 Sharepics gemacht – ist das viel?',
    'Was macht ein gutes Sharepic aus?',
    'Post ohne Sharepic',
  ])('kein Sharepic: %s', (text) => {
    expect(heuristicClassify(text).intent).not.toBe('sharepic');
  });
});

// 04.10.2026: „Instagram-Karussell mit 3 Folien" lief in die Präsentationsregel.
describe('heuristicClassify — Karussell ist ein Sharepic, Präsentation bleibt Präsentation', () => {
  it.each([
    'Mach ein Instagram-Karussell mit 3 Folien: Mehr Kita-Plätze, damit Eltern Familie und Beruf vereinbaren können.',
    'Mach ein Sharepic als Karussell mit 3 Folien: Mehr Kita-Plätze',
    'Erstell ein Insta-Karussell zum Klimageld',
    'Bau ein Karussell für Instagram zu Tempo 30',
    'Mach einen Karussell-Post zur Verkehrswende',
    'Erstelle ein Carousel zur Mietpreisbremse',
    'Insta-Karussell zum Klimaschutz',
    'Instagram-Karussell zu Mieten',
    // Bewusst: ein Karussell ist hier immer ein Slide-Sharepic für Instagram.
    'Mach eine Präsentation als Karussell',
  ])('Sharepic: %s', (text) => {
    expect(heuristicClassify(text).intent).toBe('sharepic');
  });

  it.each([
    'Mach eine Präsentation mit 5 Folien zur Verkehrswende',
    'Erstell einen Foliensatz für den Vortrag zur Verkehrswende',
  ])('Präsentation: %s', (text) => {
    expect(heuristicClassify(text).intent).toBe('create_presentation');
  });

  it('eine Frage nach dem Karussell-Post bestellt nichts', () => {
    expect(heuristicClassify('Was ist ein Karussell-Post?').intent).not.toBe('sharepic');
  });
});

// Beta-Audit 30.09.2026: die PDF-Regel lief ohne Wächter über die ganze
// Nachricht samt Zitaten, und „Fragebogen" mit `schreib` war schon ein PDF.
describe('heuristicClassify — PDF nur auf Bestellung', () => {
  it.each([
    'erstelle mir das als PDF',
    'mach ein PDF mit Briefkopf',
    'erstelle einen Fragebogen als PDF',
    'schreib das als PDF',
    'Mach einen Fragebogen für die Mitgliederbefragung',
  ])('bleibt create_pdf: %s', (text) => {
    expect(heuristicClassify(text).intent).toBe('create_pdf');
  });

  it.each([
    'Schreib einen Fragebogen-Text für die Umfrage',
    'was steht im PDF?',
    'kein PDF, nur Text bitte',
    'Erstell die Antwort, aber kein PDF daraus machen',
    'Wie erstelle ich ein PDF mit Briefkopf?',
    'Mein Kollege schrieb: "mach ein PDF mit Briefkopf" – was hältst du davon?',
  ])('kein create_pdf: %s', (text) => {
    expect(heuristicClassify(text).intent).not.toBe('create_pdf');
  });
});

// Beta-Audit 30.09.2026: im 40-Zeichen-Fenster war das Nomen hinter „für"/„zur"
// das bestellte Artefakt.
describe('heuristicClassify — Zweck-Nomen ist nicht das Bestellte', () => {
  it.each([
    'Mach mir Stichpunkte für meine Präsentation morgen',
    'Schreib mir eine Rede für die Präsentation',
    'Stichpunkte für meine Präsentation erstellen',
  ])('keine Präsentation: %s', (text) => {
    expect(heuristicClassify(text).intent).not.toBe('create_presentation');
  });

  it.each([
    'Erstell eine Zusammenfassung zur Tabelle',
    'Erstell mir eine Gliederung für die Tabelle',
  ])('keine Tabelle: %s', (text) => {
    expect(heuristicClassify(text).intent).not.toBe('create_sheet');
  });

  it.each([
    ['mach daraus eine Präsentation', 'create_presentation'],
    ['erstelle eine Präsentation zum Klimaschutz', 'create_presentation'],
    ['mach aus der Tabelle eine Präsentation', 'create_presentation'],
    ['mach eine Tabelle mit den Zahlen', 'create_sheet'],
    ['mach das zu einer Tabelle', 'create_sheet'],
    ['erstelle die Übersicht in einer Tabelle', 'create_sheet'],
    ['Mach mir eine Tabelle für die Präsentation', 'create_sheet'],
  ])('bleibt Auftrag: %s', (text, intent) => {
    expect(heuristicClassify(text).intent).toBe(intent);
  });
});

// Beta-Audit 30.09.2026: der Tippfehler-Fänger machte aus dem Nomen allein, über
// die ganze Nachricht, ein Bild.
describe('heuristicClassify — Bild-Stichwort nur als Auftrag', () => {
  it.each([
    'zeichne eine Windkraftanlage',
    'erstelle eine Illustration einer Solaranlage',
    'visualisiere den Kohleausstieg',
    'Bitte eine Windkraftanlage zeichnen',
  ])('bleibt Bild: %s', (text) => {
    expect(heuristicClassify(text).intent).toBe('image');
  });

  it.each([
    'Die Grafik im Bericht zeigt einen Anstieg – was bedeutet das?',
    'Welche Illustration passt zu meinem Artikel?',
    'keine Grafik bitte',
    'Das illustriert das Problem ganz gut, oder?',
  ])('kein Bild: %s', (text) => {
    expect(heuristicClassify(text).intent).not.toBe('image');
  });
});

// Beta-Audit 30.09.2026: Diagramm und HTML/SVG verlangten Nomen und Verb nur
// irgendwo, und „zeigt" zählte als Befehl.
describe('heuristicClassify — Diagramm und HTML nur auf Bestellung', () => {
  it.each([
    ['Erstelle ein Diagramm über die Wahlergebnisse', 'chart'],
    ['Zeige mir ein Balkendiagramm der Umfragewerte', 'chart'],
    ['stell die Zahlen als Diagramm dar', 'chart'],
    ['Bau mir eine Landingpage für die Kampagne', 'artifact'],
    ['Schreib mir ein HTML-Snippet mit einem Countdown', 'artifact'],
  ])('bleibt Auftrag: %s', (text, intent) => {
    expect(heuristicClassify(text).intent).toBe(intent);
  });

  it.each([
    ['Erkläre mir, was das Diagramm zeigt', 'chart'],
    ['Das Diagramm zeigt, dass die Emissionen sinken. Schreib mir dazu einen Absatz.', 'chart'],
    ['Schreib mir einen Text über unsere Website', 'artifact'],
  ])('kein Artefakt: %s', (text, intent) => {
    expect(heuristicClassify(text).intent).not.toBe(intent);
  });
});

// #3941: die Lücke zwischen Verb und Nomen lief über Relativsätze, und das
// Zweck-Nomen sah nur ein Wort hinter der Präposition.
describe('heuristicClassify — Relativsatz und Genitiv-Kette', () => {
  it.each([
    ['Erstelle eine Rede, die das Chart von gestern erwähnt', 'chart'],
    ['Mach mir Vorschläge für den Aufbau unserer Website', 'artifact'],
    ['Erstell eine Gliederung, die die Tabelle erklärt', 'create_sheet'],
    ['Mach mir Stichpunkte für die geplante morgige Präsentation', 'create_presentation'],
    ['Mach Stichpunkte für die geplante morgige Präsentation', 'create_presentation'],
  ])('kein Artefakt: %s', (text, intent) => {
    expect(heuristicClassify(text).intent).not.toBe(intent);
  });

  it.each([
    ['Erstelle ein Chart, das die Emissionen seit 1990 zeigt', 'chart'],
    ['mach mir eine Website für unseren Ortsverband', 'artifact'],
    ['Erstelle ein Sharepic zur Wärmepumpe', 'sharepic'],
    ['mach daraus eine Präsentation', 'create_presentation'],
    ['mach eine Tabelle mit den Zahlen', 'create_sheet'],
    ['Erstelle für die Kampagne neue Sharepics', 'sharepic'],
  ])('bleibt Auftrag: %s', (text, intent) => {
    expect(heuristicClassify(text).intent).toBe(intent);
  });
});
