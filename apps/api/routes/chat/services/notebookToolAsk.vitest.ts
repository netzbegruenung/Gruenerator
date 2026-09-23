/**
 * Der Detektor, der einen Notebook-Turn in die Schleife lässt — und was er
 * NICHT beanspruchen darf.
 *
 * Ein Treffer pinnt `notebook_quellen` als ersten Werkzeugaufruf und nimmt den
 * Turn aus dem Einzeldurchlauf mit `searchNode`. Die Negativfälle sind deshalb
 * der Punkt: eine gewöhnliche Frage an das Notebook muss auf dem gemessenen
 * Suchpfad bleiben. Ein Nomen allein („Zahlen", „Reihe", „Belege", „Liste")
 * reicht nie — es braucht ein Verb oder einen ausdrücklichen Ort.
 */
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadCorpus } from '../../../evals/corpus.js';
import { looksLikeNotebookToolAsk, looksLikeNotebookWriteAsk } from './notebookToolAsk.js';

describe('looksLikeNotebookToolAsk — trifft (Verb)', () => {
  it.each([
    'Sortiere die Quellen nach Datum',
    'Ordne die Dokumente nach Relevanz',
    'Reihe die Quellen nach ihrer Länge',
    // Umlaut am Wortanfang: `\b` wäre hier tot.
    'Zähl die Quellen im Notebook',
    'Zähle, wie oft Wärmepumpe vorkommt',
    'Öffne die Quelle zur Satzung',
    'Liste mir alle Quellen auf',
    'Liste die Anträge aus dem Notebook',
    'Lies mir den Anfang vom Koalitionsvertrag vor',
    'Zeig mir die Gliederung des Wahlprogramms',
    'Zeig mir die Quellen',
    'Zeige die Stelle zum Mietendeckel',
    'Finde die Stelle, an der das Tempolimit steht',
    'Finde mir die Passage zur Kindergrundsicherung',
    'Zitiere die Passage zur Wärmepumpe',
    'Belege das mit einem Zitat aus dem Notebook',
    'Kannst du die Quelle umbenennen?',
    'Kannst du die Anträge nach Datum sortieren?',
    'Bitte alle Quellen auflisten',
    'Verschiebe die Quelle in ein anderes Notebook',
    'Entferne die alte Pressemitteilung aus dem Notebook',
    // Suchaufträge an ein Dokument (Nachfrage 23.09.2026): „such in X nach Y" —
    // nur mit einem Suchziel (Anführungszeichen, Begriff/Stelle/…) oder einem
    // Dokument als Ort.
    'Suche im Wahlprogramm nach „Mietendeckel“',
    'Suche im Wahlprogramm nach Mietendeckel',
    'Durchsuche das Wahlprogramm nach dem Begriff Mietendeckel',
    'Suche nach dem Satz „Berlin bleibt lebenswert“',
    'Suche nach „Mietendeckel“',
    'Such mir aus dem Koalitionsvertrag die Stelle zum Tempolimit raus',
    // #3627: zweiteiliger Auftrag, „dann" zwischen Verb und Menge.
    'Welche Kategorien gibt es? Zeig mir dann alle Quellen aus der Kategorie Wahlprogramm.',
  ])('%s', (text) => {
    expect(looksLikeNotebookToolAsk(text)).toBe(true);
  });
});

describe('looksLikeNotebookToolAsk — trifft (Ort oder Menge)', () => {
  it.each([
    'Was steht auf Seite 12?',
    'Fasse Abschnitt 3 zusammen',
    'Was regelt Kapitel 2 der Satzung?',
    'Welche Position vertreten wir zu Seite 3 des Koalitionsvertrags?',
    'Wie oft kommt das Wort Klimaneutralität vor?',
    'Wie oft wird Wasserstoff erwähnt?',
    // Testserver 23.09.2026: „vor" vor einem Komma, nicht am Satzende.
    'Wie oft kommt das Wort „Klimaschutz“ im Berlin-Notebook vor, und in welchen Quellen am häufigsten?',
    'Wie viele Seiten hat der Antrag?',
    'Wie viele Quellen liegen im Notebook?',
    'Wörtlich bitte: was steht zum Ehrenamt?',
    'Gib mir die Anträge sortiert nach Datum',
    'Welche Quelle ist die längste?',
    // Live-Test Berlin-Notebook 23.09.2026: Filter nach Titel, Stellen mit
    // Zahl und Relevanz-Rangfolge sind Werkzeugaufträge, keine Inhaltsfragen.
    'Welche Quellen im Berlin-Notebook haben „Wahlprogramm" im Titel?',
    'Finde im Berlin-Notebook die fünf Stellen, an denen es am konkretesten um die Verkehrswende geht.',
    'Welche 10 Quellen aus 2025 im Berlin-Notebook sind am relevantesten für Klimaneutralität?',
    // Testserver 24.09.2026: Menge oder Superlativ vor dem Nomen, und „nenne".
    'Zeig mir fünf Stellen zur Verkehrswende.',
    'Zeige mir die 10 neuesten Quellen',
    'Zeig alle Stellen zum Radverkehr',
    'Nenne mir die 10 relevantesten Quellen aus 2025 zum Thema Klimaneutralität.',
    'Nenn mir die wichtigsten drei Quellen zum Radverkehr',
    // Fundort-Fragen: die Seite eines Treffers kommt aus grep/cite.
    'Auf welcher Seite steht „Klimaneutralität 2035"?',
    'Auf welcher Seite im Wahlprogramm steht das Tempolimit?',
    'Auf welcher Seite des Antrags findet sich die Forderung nach mehr Radwegen?',
    'Auf welcher Seite wird die Wärmepumpe erwähnt?',
    'Auf welchen Seiten geht es um Mobilität?',
    'Auf welcher Seite kommt der Begriff Verkehrswende vor?',
    'Auf welcher Seite steht, dass die Kita-Gebühren fallen sollen?',
    'Welche Seiten im Koalitionsvertrag behandeln die Schuldenbremse?',
    'Welche Seite ist das Zitat zum Ehrenamt?',
    'Gib mir die Seitenzahl zu diesem Zitat',
    'Nenne die Seitenzahlen für die Stellen zum Radverkehr',
  ])('%s', (text) => {
    expect(looksLikeNotebookToolAsk(text)).toBe(true);
  });
});

describe('looksLikeNotebookToolAsk — trifft NICHT', () => {
  it.each([
    // Die gewöhnliche Notebook-Frage: bleibt beim Suchpfad.
    'Was steht im Notebook zur Wärmewende?',
    'Fasse das Notebook zusammen',
    'Erkläre mir die Grundsätze',
    'Was sagt die Quelle zur Mietpreisbremse?',
    // Wortgrenze: „Seite" steckt im Ortsnamen.
    'Wie ist die Lage in Seitenstetten?',
    'Auf welcher Seite stehen wir beim Tempolimit?',
    // „Seite" als Position in einem Streit, nicht als Blatt.
    'Auf welcher Seite stehen die Grünen in der Debatte?',
    'Auf welcher Seite steht die SPD beim Heizungsgesetz?',
    'Welche Seite hat recht, wenn der Antrag abgelehnt wird?',
    'Auf welcher Seite der Straße soll der Radweg entstehen?',
    'Welche Seiten der Stadt profitieren vom Ausbau?',
    'Die Seitenzahl ist mir egal, was fordern wir zum Klimaschutz?',
    // Nomen, die wie Verben anfangen.
    'Welche Zahlen nennt das Notebook zum Haushalt?',
    'Gibt es eine Reihe von Maßnahmen zur Verkehrswende?',
    'Welche Belege gibt es für die These?',
    'Was steht auf der Liste der Forderungen?',
    'Wo liegt der Ordner mit den Anträgen?',
    'Wie groß ist die Entfernung zwischen den Standorten?',
    'Ist eine Verschiebung der Wahl geplant?',
    // „wie oft" als Inhaltsfrage, nicht als Zählauftrag.
    'Wie oft tagt der Kreisvorstand laut Satzung?',
    // Flektierte Verbformen in Inhaltsfragen (Review-Befund, Runde 1): alle
    // trafen, solange die Liste `-t`/`-en` zuliess.
    'Welche Maßnahmen zählen zum Klimapaket?',
    'Was zählt laut Programm als erneuerbare Energie?',
    'Wie weit sind wir vom 1,5-Grad-Ziel entfernt?',
    'Wie ordnet das Programm die Atomkraft ein?',
    'Wie verschiebt sich der Kohleausstieg?',
    'Was sagt das Notebook zum Entfernen von Schottergärten?',
    'Wer wird im Dokument zitiert?',
    'Wie oft wird der Vorstand gewählt?',
    // „vorkommen" als Redewendung mit Nebensatz (PR-Review #3620).
    'Wie oft kommt es vor, dass Anträge abgelehnt werden?',
    // „suchen" als gewöhnliches Verb — kein Suchziel, kein Dokument.
    'Ich suche nach einer Idee für den Wahlkampf',
    'Wir suchen nach Lösungen für bezahlbare Mieten',
    'Suche nach Lösungen für bezahlbares Wohnen',
    'Suche in Berlin nach einer Wohnung – was tun die Grünen dagegen?',
    'Such mir ein gutes Rezept für Kürbissuppe raus',
    'Suche eine Formulierung für meinen Antrag',
    'Zeig mir dann, wie das geht',
    'Wie oft kommt das vor, wenn der Vorstand tagt?',
    'Ich finde die Stelle gut, was meinst du?',
    'Was zeigt die Quelle zur Mietpreisbremse?',
    'Kannst du mir sagen, welche Maßnahmen zum Klimapaket zählen?',
    // Präpositionen, keine trennbaren Verben (PR-Review-Befund): „vor"/„auf"
    // zählen nur am Satzende, „nach Datum" nur hinter einem Sortier-Partizip.
    'Wie oft steht der Vorstand vor Gericht?',
    'Wie oft steht die Partei vor der Frage, ob sie koaliert?',
    'Gibt es Unterschiede in der Förderung, je nach Datum des Antrags?',
    'Welche Fristen gelten nach Name des Verfahrens?',
    // „finde" als Meinung, auch mit Wörtern dazwischen.
    'Die Formulierung finde ich an vielen Stellen zu weich.',
    'Ich finde, an mehreren Stellen fehlt der Bezug.',
    // „am relevantesten" ohne Quellen-Bezug ist eine Inhaltsfrage.
    'Welche Maßnahme ist am relevantesten für den Klimaschutz?',
    'Welche Quellen belegen, welche Maßnahmen am relevantesten sind?',
    // „im Titel" ohne Quellen als Gegenstand (Review-Befund PR #3568).
    'Was bedeutet das Wort im Titel des Wahlprogramms?',
    'Warum steht im Titel des Antrags Klimagerechtigkeit?',
    'Was meint die Partei mit dem Begriff im Titel?',
    // „nenne"/„zeig" ohne Quellen oder Stellen als Gegenstand (24.09.2026).
    'Nenne mir die wichtigsten Forderungen zur Verkehrswende',
    'Nenne mir drei Gründe für die Verkehrswende',
    'Zeig mir, wie die Verkehrswende funktionieren soll',
    'Zeig mir die wichtigsten Unterschiede zwischen den Programmen',
    '',
  ])('%s', (text) => {
    expect(looksLikeNotebookToolAsk(text)).toBe(false);
  });

  it('nimmt null und undefined', () => {
    expect(looksLikeNotebookToolAsk(null)).toBe(false);
    expect(looksLikeNotebookToolAsk(undefined)).toBe(false);
  });
});

// Der Eval-Korpus als Wächter: jede Frage, deren Erwartung `notebook_quellen`
// verlangt, muss treffen; jede, die es verbietet oder den Suchpfad verlangt,
// darf nicht. So bleibt die Messlatte „0 Fehlalarme auf echten
// Notebook-Fragen" ein Test statt einer Einmal-Prüfung.
describe('looksLikeNotebookToolAsk — gegen den Eval-Korpus', () => {
  const all = {
    filter: '',
    slow: true,
    mcp: true,
    notebook: true,
    systemMcp: true,
    deepResearch: true,
    bgstKorpus: true,
    userNotebook: true,
  };
  // Fälle, die notebook_quellen NICHT über dieses Tor erreichen sollen: eine
  // Inhaltsfrage im Thread eines Notebooks geht über den Hinweis im
  // Planer-Prompt (`buildToolUsageBlock`, #3630) — pinnte das Tor sie, wäre
  // der Hinweis ein Scope.
  const REACHED_BY_PLANNER_HINT = new Set(['nbtool-berlin-thread-followup-content']);
  // Notebook-Seite: dort entscheidet das Tor nur im Auto-Modus und nur als
  // Vorfilter. Was erst der LLM-Wächter erreicht, oder was vor dem Tor schon
  // entschieden ist (nicht lesbare Sammlung), prüft der Korpus, nicht das Tor.
  const REACHED_BY_ANSWER_MODE_GUARD = new Set([
    'nbmode-auto-guard-quote-check',
    'nbmode-auto-guard-full-list',
    'nbmode-auto-followup-praezision',
    'nbmode-auto-ineligible',
  ]);
  const turns = loadCorpus(fileURLToPath(new URL('../../../evals', import.meta.url)), all)
    .filter((s) => !REACHED_BY_PLANNER_HINT.has(s.id))
    .filter((s) => !REACHED_BY_ANSWER_MODE_GUARD.has(s.id))
    // Ohne `auto` fragt die Notebook-Seite das Tor gar nicht (explizit oder Default).
    .filter((s) => s.surface !== 'notebook' || s.notebookAnswerMode === 'auto')
    .flatMap((s) => s.turns);
  const wants = (t: (typeof turns)[number]) =>
    t.expect.toolsMustInclude?.includes('notebook_quellen') ?? false;
  const forbids = (t: (typeof turns)[number]) =>
    t.expect.toolsMustNotInclude?.includes('notebook_quellen') ?? false;

  it('trifft jede Frage, die notebook_quellen verlangt', () => {
    expect(turns.filter(wants).length).toBeGreaterThanOrEqual(19);
    const missed = turns.filter(wants).filter((t) => !looksLikeNotebookToolAsk(t.prompt));
    expect(missed.map((t) => t.prompt)).toEqual([]);
  });

  it('trifft keine Frage, die notebook_quellen verbietet', () => {
    expect(turns.filter(forbids).length).toBeGreaterThanOrEqual(9);
    const hit = turns.filter(forbids).filter((t) => looksLikeNotebookToolAsk(t.prompt));
    expect(hit.map((t) => t.prompt)).toEqual([]);
  });
});

// Re-Review PR #3568: „notiere" fehlte in der Schreibliste. Jeder
// Schreibauftrag, den das Werkzeug-Tor erkennt, muss auch als Schreibauftrag
// gelten — sonst pinnt ein System-Notebook ein Werkzeug, das nur ablehnt.
describe('looksLikeNotebookWriteAsk — deckt jedes Schreibverb des Werkzeug-Tors', () => {
  it.each([
    'Entferne die Quelle aus dem Berlin-Notebook',
    'Verschiebe die Quelle ins andere Notebook',
    'Kopiere die Quelle ins andere Notebook',
    'Notiere im Berlin-Notebook, dass die Frist verlängert ist',
    'Tagge die Quelle mit Verkehr',
    'Kannst du die Quelle umbenennen?',
    'Kannst du die Quelle entfernen?',
    'Kannst du die Quelle verschieben?',
    'Kannst du die Quelle kopieren?',
    'Kannst du das im Notebook notieren?',
    'Kannst du die Quelle taggen?',
  ])('%s', (text) => {
    expect(looksLikeNotebookToolAsk(text)).toBe(true);
    expect(looksLikeNotebookWriteAsk(text)).toBe(true);
  });
});

describe('looksLikeNotebookWriteAsk — Schreibaufträge (System-Notebooks sind schreibgeschützt)', () => {
  it.each([
    'Entferne die alte Pressemitteilung aus dem Notebook',
    'Verschiebe die Quelle in ein anderes Notebook',
    'Kannst du die Quelle umbenennen?',
    'Kopiere die Quelle in mein Notebook',
    'Tagge die Quelle mit Verkehr',
  ])('%s', (text) => {
    expect(looksLikeNotebookWriteAsk(text)).toBe(true);
  });

  it.each([
    'Sortiere die Quellen nach Datum',
    'Liste die 20 neuesten Quellen im Berlin-Notebook aus 2026.',
    'Wie weit sind wir vom 1,5-Grad-Ziel entfernt?',
    'Was sagt das Notebook zum Entfernen von Schottergärten?',
  ])('kein Schreibauftrag: %s', (text) => {
    expect(looksLikeNotebookWriteAsk(text)).toBe(false);
  });
});
