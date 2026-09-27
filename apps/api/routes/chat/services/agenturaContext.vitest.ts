/**
 * Die Vokabular-Tore für `recurring_tasks`, `user_agents` und `recipes` — was sie montieren und was nicht.
 *
 * Die Negativfälle sind der Punkt: „Aufgabe" gehört auch den Board-Karten,
 * und jeder Treffer hier kostet das Schema im Katalog.
 */
import { describe, expect, it } from 'vitest';

import { mentionsRecipes, mentionsRecurringTasks, mentionsUserAgents } from './agenturaContext.js';

describe('mentionsRecurringTasks — trifft', () => {
  it.each([
    'Welche wiederkehrenden Aufgaben habe ich?',
    'Zeig mir meine Wiederkehrende Aufgabe',
    'Pausier die Erinnerung für den Wochenbericht',
    'Pausiere bitte meine regelmäßige Zusammenfassung',
    'Bitte die Aufgabe fortsetzen', // Verwaltungsverb hinter Aufgabe
    'Lösch den Zeitplan für den Newsletter',
    'Die Aufgabe jetzt ausführen, bitte',
    'Was läuft bei mir jede Woche?',
    'Leg eine tägliche Aufgabe an',
    'Gibt es einen Dauerauftrag für die Pressemappe?',
    // Umlaut-Grenze: `\b` scheiterte vor „wöchentliche"; Flexion hinten.
    'Ändere die wöchentliche Aufgabe auf Dienstag',
    'Die Erinnerungen sollen um 8 kommen',
  ])('%s', (text) => {
    expect(mentionsRecurringTasks(text)).toBe(true);
  });
});

describe('mentionsRecurringTasks — trifft NICHT', () => {
  it.each([
    // Board-Aufgaben sind `boards_tasks`.
    'Leg eine Aufgabe auf dem Board an',
    'Welche Aufgaben stehen auf meinem Board?',
    'Erstell mir eine Aufgabe für Lena',
    // Alltagsprosa ohne Verwaltungs- oder Taktbezug.
    'Wie war die Sitzung gestern?',
    'Erinnere dich an unseren Chat über den Newsletter', // Recall, nicht Erinnerung
    'Was ist die Position der Grünen zum Tempolimit?',
    '',
  ])('%s', (text) => {
    expect(mentionsRecurringTasks(text)).toBe(false);
  });

  it('ignores null and undefined', () => {
    expect(mentionsRecurringTasks(null)).toBe(false);
    expect(mentionsRecurringTasks(undefined)).toBe(false);
  });
});

describe('mentionsUserAgents — trifft', () => {
  it.each([
    'Leg mir einen Agenten an, der Pressemitteilungen für den KV schreibt',
    'Welche Grünerator-Agenten habe ich?',
    'Zeig mir meine Agenten',
    'Ändere die Systemrolle meines Agenten',
    'Bau einen KI-Agenten für den Newsletter',
    'Teil den Agenten mit dem Projekt Klima-AG',
    'Meine Agent*innen bitte',
    'Was steht in der Agentura?',
    'Gib der Persona einen lockereren Ton',
    'Den Agenten löschen, bitte',
  ])('%s', (text) => {
    expect(mentionsUserAgents(text)).toBe(true);
  });
});

describe('mentionsUserAgents — trifft NICHT', () => {
  it.each([
    'Schreib eine PM zur neuen Agentur für Arbeit',
    'Was steht auf der Agenda der Sitzung?',
    'Die Agenten des BND wurden enttarnt', // Nachricht, kein Produktwort
    'Was ist die Position der Grünen zum Tempolimit?',
    'Pausier meine Erinnerung für den Newsletter', // recurring_tasks
    '',
  ])('%s', (text) => {
    expect(mentionsUserAgents(text)).toBe(false);
  });

  it('ignores null and undefined', () => {
    expect(mentionsUserAgents(null)).toBe(false);
    expect(mentionsUserAgents(undefined)).toBe(false);
  });
});

describe('mentionsRecipes — trifft', () => {
  it.each([
    'Welche Rezepte gibt es?',
    'Zeig mir meine Textformen',
    'Lern meinen Schreibstil aus diesen Texten',
    'Lern dir bitte meinen Stil',
    'Kannst du meinen Stil speichern?',
    'Lies die Beispiele ein und merk dir den Stil',
    'Aus diesen Beispielen lernen, bitte',
    'So schreibe ich meine Newsletter — merk dir das',
    'Was habe ich unter Texte anlernen hinterlegt?',
    'Lösch die angelernte Textform für Instagram',
    'Welches Rezept nutzt du für Pressemitteilungen?',
  ])('%s', (text) => {
    expect(mentionsRecipes(text)).toBe(true);
  });
});

describe('mentionsRecipes — trifft NICHT', () => {
  it.each([
    // Wortgrenzen: kein Rezept.
    'Das Medikament ist rezeptfrei erhältlich',
    'An der Rezeption des Hotels nachfragen',
    'Mein Kochrezept für Kürbissuppe',
    // „Stil" als Schreibauftrag, nicht als Verwaltung.
    'Schreib eine PM im Stil der Grünen Hessen',
    'Formuliere das im Stil von Robert Habeck',
    'Gib mir drei Beispiele für gute Hooks',
    'Was ist die Position der Grünen zum Tempolimit?',
    'Bau mir einen Agenten für den Newsletter', // user_agents
    '',
  ])('%s', (text) => {
    expect(mentionsRecipes(text)).toBe(false);
  });

  it('ignores null and undefined', () => {
    expect(mentionsRecipes(null)).toBe(false);
    expect(mentionsRecipes(undefined)).toBe(false);
  });
});
