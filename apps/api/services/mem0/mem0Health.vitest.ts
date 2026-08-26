import { beforeEach, describe, expect, it } from 'vitest';

import {
  _resetMem0HealthForTests,
  mem0HealthSnapshot,
  recordMem0Failure,
  recordMem0Success,
} from './mem0Health.js';

/**
 * Der Befund hinter diesen Zusicherungen (#2807): `Mem0Service` faengt Lesen und
 * Schreiben breit ab und liefert `[]`. Fuenf Tage lang war beides tot
 * (`client.search is not a function`), ohne dass ein Turn fehlschlug — im Log
 * sah der Totalausfall aus wie „nichts Merkbares gefunden".
 *
 * Behauptet wird deshalb nicht, dass gezaehlt wird, sondern dass die beiden
 * Faelle UNTERSCHEIDBAR bleiben: gelungen-und-leer gegen ausgefallen.
 */

beforeEach(() => {
  _resetMem0HealthForTests();
});

describe('mem0HealthSnapshot', () => {
  it('meldet nichts, solange nichts lief', () => {
    expect(mem0HealthSnapshot()).toEqual([]);
  });

  it('unterscheidet einen leeren Treffer von einem Ausfall', () => {
    // Der Fall, der #2807 verdeckt hat: beide liefern nach aussen `[]`.
    recordMem0Success('search');
    recordMem0Failure('search');

    const row = mem0HealthSnapshot().find((r) => r.operation === 'search');
    expect(row).toMatchObject({ ok: 1, failed: 1 });
    expect(row?.lastErrorAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  it('traegt keine Fehlermeldung nach draussen', () => {
    // `/health` ist unauthentifiziert (server.ts, kein requireAuth). Eine rohe
    // error.message dort auszugeben, waere ein Leck — das redis.error-Feld
    // direkt daneben laeuft aus genau dem Grund durch toUserFacingMessage().
    // Hier ist die Antwort nicht Filtern, sondern Nichterheben: das WAS steht
    // im log.error, das OB und WANN hier.
    recordMem0Failure('search');

    const row = mem0HealthSnapshot()[0];
    expect(Object.keys(row ?? {}).sort()).toEqual(['failed', 'lastErrorAt', 'ok', 'operation']);
  });

  it('haelt Lesen und Schreiben auseinander', () => {
    // Beide Pfade starben an derselben Zeile, aber sie koennen auch einzeln
    // ausfallen — ein gemeinsamer Zaehler wuerde das verwischen.
    recordMem0Failure('add');
    recordMem0Success('search');

    expect(mem0HealthSnapshot().map((r) => [r.operation, r.ok, r.failed])).toEqual(
      expect.arrayContaining([
        ['add', 0, 1],
        ['search', 1, 0],
      ])
    );
  });

  it('leert die Zaehler nur auf ausdrueckliches drain', () => {
    recordMem0Success('search');

    // /health liest ohne drain — sonst verschluckt der erste Abfrager den
    // Befund fuer jeden weiteren.
    expect(mem0HealthSnapshot()[0]?.ok).toBe(1);
    expect(mem0HealthSnapshot()[0]?.ok).toBe(1);

    expect(mem0HealthSnapshot({ drain: true })[0]?.ok).toBe(1);
    expect(mem0HealthSnapshot()[0]?.ok).toBe(0);
  });

  it('behaelt den Zeitpunkt des letzten Ausfalls ueber ein drain hinweg', () => {
    // Ein geleerter Zaehler heisst „seitdem nichts passiert", nicht „nie etwas
    // passiert" — die Spur des letzten Ausfalls muss das Fenster ueberdauern.
    recordMem0Failure('add');
    const at = mem0HealthSnapshot({ drain: true })[0]?.lastErrorAt;

    expect(at).toEqual(expect.stringMatching(/^\d{4}/));
    expect(mem0HealthSnapshot()[0]).toMatchObject({ failed: 0, lastErrorAt: at });
  });
});
