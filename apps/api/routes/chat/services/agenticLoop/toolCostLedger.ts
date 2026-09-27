/**
 * Die Buchführung, die an der Werkzeug-Naht (`ToolHooks`) hängt: pro Turn
 * Aufrufzahl und summierte Wartezeit je Werkzeug, einmal am Turn-Ende
 * protokolliert.
 *
 * Bewusst NUR Buchführung — kein Limit, keine Durchsetzung. Ein Kostenbudget
 * wäre eine Verhaltensänderung und eine eigene Entscheidung; diese Zahlen sind
 * die Voraussetzung dafür, die es heute nicht gab (wir haben Zeit- und
 * Schrittbudgets, aber keines für Kosten).
 *
 * Gezählt wird, was AUSGEFÜHRT wurde: ein von einem Guard geblockter Aufruf
 * erreicht den Hook gar nicht und darf auch nicht gezählt werden — er hat keine
 * Kosten verursacht. Attrappen zählen als Aufruf, stehen aber getrennt, sonst
 * sähe ein Eval-Lauf mit Werkzeug-Attrappen aus wie ein echter.
 *
 * `waitMs` ist Wartezeit, nicht Rechenzeit: ein abgeschriebenes Werkzeug läuft
 * weiter (siehe `withTimeout` in wrapTools.ts), seine echten Kosten sind also
 * eher höher als die hier gebuchte Zeit.
 */
import { type ToolHooks } from './wrapTools.js';

export interface ToolCostEntry {
  toolName: string;
  calls: number;
  failures: number;
  mocked: number;
  waitMs: number;
}

export interface ToolCostLedger {
  hooks: ToolHooks;
  /** Absteigend nach Wartezeit — das teuerste Werkzeug zuerst. */
  entries: () => ToolCostEntry[];
  totals: () => { calls: number; failures: number; mocked: number; waitMs: number };
  /** Schreibt eine Zeile, wenn in diesem Turn überhaupt ein Werkzeug lief. */
  log: () => void;
}

export function createToolCostLedger(opts: { onInfo: (message: string) => void }): ToolCostLedger {
  const byTool = new Map<string, ToolCostEntry>();

  const entries = (): ToolCostEntry[] =>
    [...byTool.values()].sort(
      (a, b) => b.waitMs - a.waitMs || a.toolName.localeCompare(b.toolName)
    );

  const totals = (): { calls: number; failures: number; mocked: number; waitMs: number } =>
    [...byTool.values()].reduce(
      (acc, e) => ({
        calls: acc.calls + e.calls,
        failures: acc.failures + e.failures,
        mocked: acc.mocked + e.mocked,
        waitMs: acc.waitMs + e.waitMs,
      }),
      { calls: 0, failures: 0, mocked: 0, waitMs: 0 }
    );

  return {
    hooks: {
      afterToolCall: (event) => {
        const entry = byTool.get(event.toolName) ?? {
          toolName: event.toolName,
          calls: 0,
          failures: 0,
          mocked: 0,
          waitMs: 0,
        };
        entry.calls += 1;
        if (!event.ok) entry.failures += 1;
        if (event.mocked) entry.mocked += 1;
        entry.waitMs += event.durationMs;
        byTool.set(event.toolName, entry);
      },
    },
    entries,
    totals,
    log: () => {
      const sum = totals();
      if (sum.calls === 0) return;
      const perTool = entries()
        .map(
          (e) => `${e.toolName}=${e.calls}×/${e.waitMs}ms${e.failures > 0 ? `/${e.failures}✗` : ''}`
        )
        .join(', ');
      opts.onInfo(
        `[Agentic] toolCost calls=${sum.calls} failed=${sum.failures}${
          sum.mocked > 0 ? ` mocked=${sum.mocked}` : ''
        } waitMs=${sum.waitMs} [${perTool}]`
      );
    },
  };
}
