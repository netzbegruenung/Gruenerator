import { describe, it, expect } from 'vitest';

import { runClassifierCensus } from './classifierCensusHarness.js';

/**
 * Wie oft erreicht ein Prompt noch den 27k-Zeichen-Klassifikator?
 *
 * Das ist die Erfolgsmeldung des Umbaus „ein grosser Prompt → mehrere winzige
 * Auflöser". „Der Prompt ist kleiner" ist keine Aussage über das Produkt; „von
 * X % auf Y % der Prompts" ist eine. Die Zahl lag bis hierher nur in einem
 * Wegwerf-Skript und war nach einer Sitzung weg — deshalb steht sie jetzt als
 * Sollwert im Repo und fällt auf, wenn sie wieder steigt.
 *
 * Methode, Stub-Antworten und die beiden Ehrlichkeitsgrenzen (adversarialer
 * Korpus, `blind` als Fehlerschranke nach oben) stehen bei der gemeinsamen
 * Vorrichtung: `classifierCensusHarness.ts`.
 *
 * Diese Datei zählt nur die ERREICHBARKEIT der Stufen. Was der Klassifikator
 * dabei entscheidet, zählt `dispositionCensus.vitest.ts` — dieselbe
 * Vorrichtung, andere Frage.
 */

/**
 * Anteil der Prompts, die den grossen Klassifikator-Prompt erreichen dürfen.
 *
 *   22,3 %  37/166  Stand vor dem Sharepic-Zweig in Tier 2.7
 *   19,9 %  33/166  danach (31.07.2026)
 *   18,1 %  30/166  nach dem Erreichbarkeits-Fix am Live-Quellen-Gitter,
 *                   davon 6 blind (siehe Harness) → wahrer Wert 14,5–18,1 %
 *   15,1 %  25/166  nach der Aufteilung von `direct` in greeting/produktion/
 *                   agentic (#2269), davon 3 blind → wahrer Wert 13,3–15,1 %.
 *                   Nicht gesondert gemessen, sondern beim Aufsetzen der
 *                   Dispositionszählung mitgefallen: die Aufteilung nahm dem
 *                   grossen Prompt fünf Turns ab, ohne dass der Deckel folgte.
 *
 * Nicht vergleichbar mit den 19,3 % der ersten Ad-hoc-Sonde: die mass jeden
 * Turn einzeln, also einen Chat ohne Gedächtnis. Mit Verlauf und simuliertem
 * Artefakt-Gedächtnis fallen mehr Folgeaufträge unter die Konfidenzschwelle —
 * die Zahl ist höher, weil sie ehrlicher ist. Vergleiche gelten ab hier nur
 * noch innerhalb dieser Methode.
 *
 * Der Deckel liegt knapp über dem gemessenen Wert: er soll einen Rückschritt
 * melden, nicht bei jeder Nachkommastelle rot werden. Sinkt die Quote, wird er
 * mitgesenkt — ein Deckel, der über dem Ist-Zustand stehen bleibt, misst nichts.
 */
const TIER4_SHARE_CEILING = 0.16;

describe('Klassifikator-Tier-Zählung über den Eval-Korpus', () => {
  it(`erreicht den grossen Prompt bei höchstens ${(TIER4_SHARE_CEILING * 100).toFixed(0)} % der Prompts`, async () => {
    const { turns, smallResolverCalls } = await runClassifierCensus();
    const reached = turns.filter((t) => t.reachedBigPrompt);
    const blindFollowUps = reached.filter((t) => t.blind).length;
    const share = reached.length / turns.length;

    // Der Bericht ist der halbe Zweck: der nackte Prozentsatz sagt nicht, WELCHE
    // Prompts noch durchgehen, und genau das ist die Arbeitsliste für die
    // nächste Stufe.
    console.log(
      `\n[Tier-Zählung] ${reached.length}/${turns.length} Prompts erreichen den 27k-Prompt ` +
        `(${(share * 100).toFixed(1)} %), Deckel ${(TIER4_SHARE_CEILING * 100).toFixed(0)} %.\n` +
        `[Tier-Zählung] Kleine Auflöser: ${smallResolverCalls} Aufrufe.\n` +
        `[Tier-Zählung] Davon in einer Kette ohne Artefakt-Gedächtnis: ${blindFollowUps} ` +
        `— Fehlerschranke nach oben, nicht bewiesene Tier-4-Fälle.\n` +
        reached.map((r) => `  [${r.intent}]${r.blind ? ' (blind)' : ''} ${r.id}`).join('\n')
    );

    expect(turns.length).toBeGreaterThan(150);
    expect(share).toBeLessThanOrEqual(TIER4_SHARE_CEILING);
  }, 120_000);
});
