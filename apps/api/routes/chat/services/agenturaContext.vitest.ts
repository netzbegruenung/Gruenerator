/**
 * Das Vokabular-Tor für `recurring_tasks` — was es montiert und was nicht.
 *
 * Die Negativfälle sind der Punkt: „Aufgabe" gehört auch den Board-Karten,
 * und jeder Treffer hier kostet das Schema im Katalog.
 */
import { describe, expect, it } from 'vitest';

import { mentionsRecurringTasks } from './agenturaContext.js';

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
