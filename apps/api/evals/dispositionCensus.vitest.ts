import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { runClassifierCensus } from './classifierCensusHarness.js';
import { dispositionOf } from '@gruenerator/shared/chat-intents';
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

    // Der Korpus muss vollständig gelaufen sein; eine halbe Messung ist keine.
    expect(run.turns.length).toBeGreaterThan(150);

    if (UPDATE) return;
    if (!existsSync(BASELINE_PATH)) {
      throw new Error(
        'keine committete Baseline. Mit CENSUS_UPDATE=1 erzeugen und den Diff ' +
          `vor dem Commit lesen.\n\n${rendered}`
      );
    }
    expect(
      rendered,
      'Die Klassifikator-Zählung hat sich verschoben. Ist das beabsichtigt? ' +
        'Dann CENSUS_UPDATE=1 — und die Änderung im PR beschreiben.'
    ).toBe(readFileSync(BASELINE_PATH, 'utf8'));
  }, 120_000);
});
