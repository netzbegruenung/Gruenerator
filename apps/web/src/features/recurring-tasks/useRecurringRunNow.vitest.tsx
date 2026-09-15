/**
 * `pickFreshRun` trägt die einzige echte Entscheidung von „Jetzt ausführen":
 * Gehört dieser Lauf zu meinem Klick? Verglichen wird gegen die vorher
 * bekannten IDs statt gegen Zeitstempel, weil `createdAt` vom Server kommt und
 * der Startzeitpunkt aus dem Browser — bei auseinanderlaufenden Uhren gilt
 * sonst ein alter Lauf als frisch (Meldung zeigt das Ergebnis von gestern) oder
 * der frische als alt (der Knopf hängt bis zum Zeitablauf).
 *
 * Liegt in der jsdom-Lane (`.vitest.tsx`), obwohl die Funktion pur ist: der
 * Import zieht über `./api` die Auth-Kette herein, die beim Laden
 * `window.location.origin` liest und in der node-Lane schon am Import stirbt.
 */
import { type RecurringTaskRun } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { pickFreshRun } from './useRecurringRunNow';

function run(
  id: string,
  createdAt = '2026-09-01T07:00:00.000Z',
  status: RecurringTaskRun['status'] = 'completed'
): RecurringTaskRun {
  return {
    id,
    taskId: 't1',
    status,
    resultsSummary: null,
    resultUrl: '/office/d1',
    error: null,
    durationMs: 1000,
    verdict: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
  };
}

describe('pickFreshRun', () => {
  it('findet den Lauf, den es vor dem Start noch nicht gab', () => {
    const fresh = pickFreshRun([run('r2'), run('r1')], new Set(['r1']));
    expect(fresh?.id).toBe('r2');
  });

  it('meldet nichts, solange nur bekannte Läufe da sind', () => {
    expect(pickFreshRun([run('r1')], new Set(['r1']))).toBeNull();
  });

  it('hält einen älteren Zeitstempel nicht für alt', () => {
    // Server-Uhr geht nach: der neue Lauf trägt ein FRÜHERES createdAt als der
    // bekannte. Über IDs ist er trotzdem eindeutig der neue.
    const fresh = pickFreshRun(
      [run('r1', '2026-09-01T09:00:00.000Z'), run('r2', '2026-09-01T08:00:00.000Z')],
      new Set(['r1'])
    );
    expect(fresh?.id).toBe('r2');
  });

  it('hält den eigenen, gerade gestarteten Lauf nicht für das Ergebnis', () => {
    // Die Zeile entsteht beim Claim: der Klick legt selbst eine 'running'-Zeile
    // an, die der Grundmenge fehlt. Ohne die Endzustands-Prüfung meldete der
    // Knopf Sekunden nach dem Klick „Ergebnis fertig".
    expect(pickFreshRun([run('r2', undefined, 'running')], new Set(['r1']))).toBeNull();
  });

  it('nimmt denselben Lauf, sobald er einen Endzustand hat', () => {
    expect(pickFreshRun([run('r2', undefined, 'empty')], new Set(['r1']))?.id).toBe('r2');
  });

  it('verträgt eine noch nicht geladene Liste', () => {
    expect(pickFreshRun(undefined, new Set(['r1']))).toBeNull();
  });

  it('nimmt ohne Grundmenge den ersten Lauf, statt ewig zu warten', () => {
    expect(pickFreshRun([run('r1')], new Set())?.id).toBe('r1');
  });
});
