import { searchIntentSchema } from '@gruenerator/contracts';
import {
  dispositionOf,
  DISPOSITION_ORDER,
  type Disposition,
} from '@gruenerator/shared/chat-intents';

import { DECISION_POINTS, type DecisionPointId } from '../utils/decisionJournal.js';

import { type CensusRun } from './classifierCensusHarness.js';

/**
 * Rendert einen Klassifikator-Lauf als feste, registry-geordnete Tabelle.
 *
 * Handgeschrieben statt Snapshot, aus denselben zwei Gründen wie
 * `renderDecisionMap.ts`: das Repo kennt keine Snapshots, und `-u` wäre ein
 * Tastendruck, der eine Regression segnet — die Kultur hier ist die
 * entgegengesetzte. Und verlangt ist DIFF-LESBARKEIT: feste Zeilen in fester
 * Reihenfolge heissen, dass sich nichts bewegt ausser dem, was sich wirklich
 * geändert hat. Deshalb steht JEDE Zeile immer da, auch mit dem Wert 0 — eine
 * Tabelle, die leere Zeilen weglässt, verschiebt bei jeder Änderung den halben
 * Diff und versteckt zugleich das Verschwinden eines Wertes.
 *
 * Drei Abschnitte, drei verschiedene Fragen:
 *
 *  1. **Dispositionen** — WAS entschieden wurde. Die Messlatte des Umbaus:
 *     `loop` soll wachsen, `artifact`/`gated`/`anchor` sollen stehen bleiben.
 *  2. **Entscheidungspunkte** — WIE es entschieden wurde. Muss über ein reines
 *     Refactoring hinweg Zeile für Zeile identisch bleiben; das ist der Beweis,
 *     dass die Umstrukturierung nichts verschoben hat.
 *  3. **Intents** — die feinste Körnung, in Enum-Reihenfolge. Hier wird
 *     sichtbar, wie die Feinunterscheidung selbst verschwindet.
 *
 * Die Spalte `davon Tier 4` in Abschnitt 1 ist die Arbeitsliste: eine
 * `artifact`-Zeile mit Tier-4-Bedarf gehört dem Generierungs-Auflöser, eine
 * `loop`-Zeile dem deterministischen Auffangwert.
 */

const LABEL_COLUMN = 30;

/**
 * Die Entscheidungspunkte, die dieser Lauf überhaupt SEHEN kann.
 *
 * Die Zählung ruft `classifierNode` direkt auf, nicht den Router und nicht den
 * Loop. Deren Punkte (`router.*`, `loop.*`, `respond.*`) stünden also dauerhaft
 * auf null — und eine Null, die „nie gemessen" heisst, aber wie „nie passiert"
 * aussieht, ist schlimmer als eine fehlende Zeile. Wer sie hier aufnimmt, muss
 * die Zählung vorher durch den Router führen.
 */
const OBSERVED_POINTS: readonly DecisionPointId[] = ['classifier.tier'];

function pct(n: number, total: number): string {
  return total === 0 ? '  0,0 %' : `${((n / total) * 100).toFixed(1).padStart(5)} %`;
}

function row(label: string, count: number, total: number, extra = ''): string {
  const left = `${label.padEnd(LABEL_COLUMN)} ${String(count).padStart(4)}  ${pct(count, total)}`;
  return extra ? `${left}  ${extra}` : left;
}

export function renderClassifierCensus(run: CensusRun): string {
  const { turns } = run;
  const total = turns.length;
  const out: string[] = [
    `# Klassifikator-Zählung über ${total} Turns aus apps/api/evals/corpus/`,
    '# Regenerieren mit CENSUS_UPDATE=1 — und den Diff lesen, bevor er committet wird.',
    '#',
    '# Der Korpus ist adversarial gebaut. Jede Quote hier ist eine Aussage über',
    '# SCHWIERIGE Prompts, nicht über den Alltagsverkehr — sie taugt zum Vergleich',
    '# mit sich selbst, nicht als Produktionskennzahl.',
    '#',
    '# `anchor` und Teile von `gated` sind hier strukturell UNTERGEMESSEN: der',
    '# Lauf baut einen Zustand ohne offenes Dokument, ohne Board, ohne Anhang und',
    '# ohne @-Erwähnung, also fehlen genau die Auslöser der Tier-1/2-Zweige. Eine',
    '# 0 in diesen Zeilen heisst „vom Korpus nicht ausgelöst", nicht „kommt nicht',
    '# vor". Für sie sind die Forced-Intent-Lanes zuständig, nicht diese Tabelle.',
  ];

  // ── 1. Dispositionen ────────────────────────────────────────────────────
  out.push('', '## Dispositionen — was der Klassifikator entschieden hat');
  out.push(
    `${'disposition'.padEnd(LABEL_COLUMN)} ${'n'.padStart(4)}  ${'anteil'.padStart(7)}  davon mit Modell`
  );
  const unknown = turns.filter((t) => dispositionOf(t.intent) == null);
  for (const disposition of DISPOSITION_ORDER) {
    const mine = turns.filter((t) => dispositionOf(t.intent) === disposition);
    const viaModel = mine.filter((t) => t.usedModel).length;
    out.push(row(disposition, mine.length, total, String(viaModel).padStart(4)));
  }
  // Nie leer weglassen: ein unbekanntes Verdikt ist ein Befund (Fehlerwert aus
  // dem Klassifikator, oder ein Intent, den niemand eingeordnet hat).
  out.push(
    row(
      '(unbekannt)',
      unknown.length,
      total,
      String(unknown.filter((t) => t.usedModel).length).padStart(4)
    )
  );
  for (const t of unknown) out.push(`    · ${t.intent}  ${t.id}`);

  // ── 2. Entscheidungspunkte ──────────────────────────────────────────────
  out.push('', '## Entscheidungspunkte — wie entschieden wurde (Zweighäufigkeit)');
  const entries = turns.flatMap((t) => t.journal.entries);
  // Turns ohne Eintrag sind kein Messfehler, sondern die Tier-1/2-Zweige: sie
  // kehren zurück, ohne zu journalisieren. Ausgewiesen, damit die Summe unter
  // dem Punkt nicht wie ein Verlust aussieht.
  const withoutTier = turns.filter(
    (t) => !t.journal.entries.some((e) => e.point === 'classifier.tier')
  ).length;
  out.push(`(ohne Tier-Eintrag: ${withoutTier} — Tier-1/2-Zweige journalisieren nicht)`);
  for (const point of OBSERVED_POINTS) {
    const mine = entries.filter((e) => e.point === point);
    out.push(`${point}  (${mine.length})`);
    for (const branch of DECISION_POINTS[point].branches) {
      const n = mine.filter((e) => e.chose === branch).length;
      out.push(`    ${branch.padEnd(LABEL_COLUMN - 4)} ${String(n).padStart(4)}`);
    }
  }

  // ── 3. Intents ──────────────────────────────────────────────────────────
  out.push('', '## Intents — feinste Körnung, in Enum-Reihenfolge');
  for (const intent of searchIntentSchema.options) {
    const n = turns.filter((t) => t.intent === intent).length;
    const disposition = dispositionOf(intent) as Disposition;
    out.push(`${intent.padEnd(LABEL_COLUMN)} ${String(n).padStart(4)}  ${disposition}`);
  }

  return `${out.join('\n')}\n`;
}
