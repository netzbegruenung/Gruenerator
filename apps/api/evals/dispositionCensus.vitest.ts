import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/ai/execution/index.js', () => ({
  executeProvider: async (...args: unknown[]) => {
    const { censusExecuteProvider } = await import('./classifierCensusHarness.js');
    return censusExecuteProvider(...(args as Parameters<typeof censusExecuteProvider>));
  },
}));

import { runClassifierCensus } from './classifierCensusHarness.js';
import { ALL_CHAT_INTENTS, dispositionOf } from '@gruenerator/shared/chat-intents';
import { renderClassifierCensus } from './renderClassifierCensus.js';

/**
 * Die Baseline des Klassifikator-Umbaus.
 *
 * Der Tier-Zähler daneben misst, wie oft der 27k-Prompt noch gebraucht wird.
 * Diese Datei misst, WAS der Klassifikator entscheidet — und beides zusammen
 * ist die einzige Grundlage, auf der die nächsten Schritte behaupten können,
 * etwas verbessert statt nur verschoben zu haben.
 *
 * Zwei verschiedene Zusicherungen, absichtlich getrennt:
 *
 *  1. **Die committete Tabelle** ist ein Diff-Artefakt, keine Schwelle. Sie
 *     darf sich ändern — sie MUSS sich bei den Verhaltens-PRs ändern. Was sie
 *     verhindert, ist die stille Änderung: eine Umstrukturierung, die
 *     versehentlich Routing verschiebt, wird hier sichtbar, statt erst in
 *     Produktion. Beim reinen Refactoring (Regel-Tabelle) ist ein leerer Diff
 *     der Beweis; bei den Verhaltens-PRs ist der Diff die Beschreibung.
 *  2. **Die Invarianten** unten sind das, was in KEINEM Schritt kaputtgehen
 *     darf — sie gelten weiter, wenn die Tabelle sich längst verschoben hat.
 *
 * Regenerieren mit `CENSUS_UPDATE=1`, dann den Diff lesen, bevor er committet
 * wird. Kein `-u`, kein Automatismus: die Tabelle ist der Review-Gegenstand.
 */

const BASELINE_PATH = join(import.meta.dirname, 'classifierCensus.baseline.txt');
const UPDATE = process.env.CENSUS_UPDATE === '1';

describe('Klassifikator-Dispositionszählung über den Eval-Korpus', () => {
  it('entspricht der committeten Baseline', async () => {
    const run = await runClassifierCensus();
    const rendered = renderClassifierCensus(run);

    // Rendern und unter CENSUS_UPDATE SCHREIBEN, bevor zugesichert wird: liefen
    // die Invarianten zuerst, würde eine von ihnen werfen und die Tabelle nie
    // neu entstehen — der Reviewer bekäme einen nackten Fehlschlag statt der
    // Zahlen, die ihn erklären. Dieselbe Reihenfolge wie in simulatedRun.
    if (UPDATE) writeFileSync(BASELINE_PATH, rendered, 'utf8');

    console.log(`\n${rendered}`);

    // ── Invarianten ──────────────────────────────────────────────────────
    // Jedes Verdikt muss eingeordnet sein. Ein unbekannter Wert heisst
    // entweder, dass der Klassifikator geworfen hat (`ERR:…`), oder dass ein
    // neuer Intent existiert, den niemand einer Frage zugeordnet hat.
    const unknown = run.turns.filter((t) => dispositionOf(t.intent) == null);
    expect(
      unknown.map((t) => `${t.id}: ${t.intent}`),
      'Verdikte ohne Disposition — Klassifikator-Fehler oder uneingeordneter Intent'
    ).toEqual([]);

    // Ein stillgelegter Intent hat keinen Erzeuger mehr — das ist die Aussage
    // der Stilllegung, und ohne diese Zeile ist sie nur einmal gemessen statt
    // bewacht. Der Enum-Wert BLEIBT (Wire-Vertrag, persistierte Threads); was
    // hier fällt, ist die Emission. Wer einen Tier-Zweig so ändert, dass er
    // wieder ein retiredes Verdikt liefert, sieht es hier und nicht in
    // Produktion.
    // `Set<string>`, nicht `Set<ChatIntentId>`: `CensusTurn.intent` traegt auch
    // `ERR:…`, wenn der Klassifikator geworfen hat.
    const retiredIds = new Set<string>(
      ALL_CHAT_INTENTS.filter((i) => i.availability === 'retired').map((i) => i.id)
    );
    const retired = run.turns.filter((t) => retiredIds.has(t.intent));
    expect(
      retired.map((t) => `${t.id}: ${t.intent}`),
      'stillgelegte Intents werden wieder erzeugt — die Fähigkeit lebt im Loop, ' +
        'das Verdikt soll es nicht mehr geben'
    ).toEqual([]);

    // Der Korpus muss vollständig gelaufen sein; eine halbe Messung ist keine.
    expect(run.turns.length).toBeGreaterThan(150);

    if (UPDATE) return;
    if (!existsSync(BASELINE_PATH)) {
      throw new Error(
        'keine committete Baseline. Mit CENSUS_UPDATE=1 erzeugen und den Diff ' +
          `vor dem Commit lesen.\n\n${rendered}`
      );
    }
    const baseline = readFileSync(BASELINE_PATH, 'utf8');

    // Erst die Korpusgröße, dann die Tabelle. Wächst der Korpus in einem PR und
    // hebt ein zweiter die Baseline, dann fällt JEDER Branch, der vor dem
    // zweiten abgezweigt ist — mit einem vierzigzeiligen Zahlendiff, der wie
    // eine Routing-Regression aussieht und keine ist (so geschehen bei #2737).
    // Die Ursache steht in einer einzigen Zahl; sie zuerst zu prüfen macht aus
    // dem Rätsel eine Anweisung.
    const baselineTotal = Number(/über (\d+) Turns/.exec(baseline)?.[1] ?? NaN);
    expect(
      run.turns.length,
      `Die Baseline wurde über ${baselineTotal} Turns erzeugt, der Korpus hat ` +
        `jetzt ${run.turns.length}. Das ist fast immer ein veralteter Branch: ` +
        'erst `git merge origin/master`, dann erneut messen. Bleibt der ' +
        'Unterschied, hat dieser PR den Korpus geändert — dann CENSUS_UPDATE=1.'
    ).toBe(baselineTotal);

    expect(
      rendered,
      'Die Klassifikator-Zählung hat sich verschoben. Ist das beabsichtigt? ' +
        'Dann CENSUS_UPDATE=1 — und die Änderung im PR beschreiben.'
    ).toBe(baseline);
  }, 120_000);
});
