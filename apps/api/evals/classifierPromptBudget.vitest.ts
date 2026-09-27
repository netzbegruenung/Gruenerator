import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/ai/execution/index.js', () => ({
  executeProvider: async (...args: unknown[]) => {
    const { censusExecuteProvider } = await import('./classifierCensusHarness.js');
    return censusExecuteProvider(...(args as Parameters<typeof censusExecuteProvider>));
  },
}));

import { runClassifierCensus } from './classifierCensusHarness.js';

/**
 * Was kostet eine Einordnung noch — und wie gross ist der grösste Prompt dabei?
 *
 * Der Vorgänger dieser Datei (`classifierTierCensus.vitest.ts`) zählte, wie oft
 * ein Turn den 27k-Zeichen-Klassifikator erreicht. Diese Zahl war die
 * Erfolgsmeldung des Umbaus „ein grosser Prompt → mehrere winzige Auflöser":
 *
 *   22,3 %  37/166  Stand vor dem Sharepic-Zweig in Tier 2.7
 *   19,9 %  33/166  danach (31.07.2026)
 *   18,1 %  30/166  nach dem Erreichbarkeits-Fix am Live-Quellen-Gitter
 *   15,1 %  25/166  nach der Aufteilung von `direct` (#2269)
 *   11,4 %  19/166  nach der Default-Inversion und den Tier-3.4-Direktrouten
 *    3,0 %   5/166  nach dem Generierungs-Auflöser vor Tier 4
 *    0    %   0/166  der Prompt ist gelöscht
 *
 * Bei null hört eine Quote auf, etwas zu messen: sie kann nur noch bestätigen,
 * dass ein Import fehlt. Die Frage, die BLEIBT, ist die dahinter — kehrt die
 * Bauform zurück? Ein Taxonomie-Prompt wächst nicht über Nacht, er wächst über
 * ein Jahr, Beispiel für Beispiel, und niemand merkt den Tag, an dem er wieder
 * gross ist. Deshalb misst diese Datei jetzt die LÄNGE statt der Identität: sie
 * hängt an keiner Konstante, die man umbenennen kann, und sie fällt auf, egal
 * unter welchem Namen der Prompt wiederkommt.
 *
 * Methode, Stub-Antworten und die Ehrlichkeitsgrenzen stehen bei der
 * gemeinsamen Vorrichtung: `classifierCensusHarness.ts`.
 */

/**
 * Obergrenze für den Systemprompt eines Klassifikator-Aufrufs.
 *
 * Die drei Auflöser liegen bei ~700–1100 Zeichen; die Grenze lässt Luft für
 * einen weiteren in derselben Grössenordnung und schlägt lange an, bevor
 * irgendetwas wieder wie ein Katalog aussieht. Sie ist bewusst nicht knapp: ein
 * Deckel, der bei jedem zusätzlichen Satz rot wird, wird angehoben statt
 * gelesen.
 */
const RESOLVER_PROMPT_CEILING = 2500;

describe('Klassifikator-Prompt-Budget über den Eval-Korpus', () => {
  it(`verschickt keinen Systemprompt über ${RESOLVER_PROMPT_CEILING} Zeichen`, async () => {
    const { turns, resolverCalls, maxPromptChars } = await runClassifierCensus();
    const withModel = turns.filter((t) => t.usedModel);

    console.log(
      `\n[Prompt-Budget] ${withModel.length}/${turns.length} Turns brauchen ein Modell ` +
        `(${((withModel.length / turns.length) * 100).toFixed(1)} %), ${resolverCalls} Aufrufe.\n` +
        `[Prompt-Budget] Grösster Systemprompt: ${maxPromptChars} Zeichen ` +
        `(Deckel ${RESOLVER_PROMPT_CEILING}).`
    );

    expect(turns.length).toBeGreaterThan(150);
    expect(maxPromptChars).toBeLessThanOrEqual(RESOLVER_PROMPT_CEILING);
  }, 120_000);

  it('entscheidet keinen Turn mehr an einer LLM-Taxonomie-Stufe', async () => {
    const { turns } = await runClassifierCensus();
    // Der Zweigname existiert nicht mehr im Register (`decisionJournal.ts`), das
    // ist die eigentliche Sperre. Diese Zusicherung ist die zweite Hälfte davon:
    // sie prüft nicht den Namen, sondern dass kein Turn ohne Tier-Eintrag endet
    // — eine Stufe, die niemand ins Journal schreibt, wäre genau der blinde
    // Fleck, in dem der grosse Prompt zurückkehren könnte.
    const untraced = turns.filter(
      (t) =>
        !t.intent.startsWith('ERR:') &&
        !t.journal.entries.some((e) => e.point === 'classifier.tier')
    );
    // Tier 1/2 (offene Flächen, @-Erwähnungen, Anhänge) schreiben bewusst nichts
    // ins Journal — sie sind rein deterministisch und haben keine Alternative.
    // Sie dürfen also vorkommen; was nicht vorkommen darf, ist ein Turn, der ein
    // MODELL gefragt hat, ohne dass die Stufe im Journal steht.
    expect(
      untraced.filter((t) => t.usedModel).map((t) => t.id),
      'Turn hat ein Modell gefragt, ohne dass die Stufe im Journal steht'
    ).toEqual([]);
  }, 120_000);
});
