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
import { describe, expect, it } from 'vitest';

import { looksLikeNotebookToolAsk } from './notebookToolAsk.js';

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
    '',
  ])('%s', (text) => {
    expect(looksLikeNotebookToolAsk(text)).toBe(false);
  });

  it('nimmt null und undefined', () => {
    expect(looksLikeNotebookToolAsk(null)).toBe(false);
    expect(looksLikeNotebookToolAsk(undefined)).toBe(false);
  });
});
