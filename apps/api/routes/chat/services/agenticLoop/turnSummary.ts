/**
 * Die eine Zeile, die einen agentischen Turn im Log beschreibt.
 *
 * Eigenes Modul, weil sie zweimal am selben Fehler vorbeigelaufen ist: sie ist
 * die einzige Stelle, an der ein still fehlgeschlagenes Werkzeug überhaupt
 * sichtbar werden KANN, und beide Male hatte sie es weggefiltert (siehe die
 * Kommentare unten). Was sie zeigt, ist eine Aussage, keine Formatierung.
 */
import { readMcpResult, type PersistedStep } from './types.js';

import type { SearchIntent } from '../../../../agents/langgraph/ChatGraph/types.js';

export function logTurnSummary(input: {
  modelName: string;
  mode: string;
  /** Split mode only — null in unified. */
  plannerName: string | null;
  synthName: string;
  intent: SearchIntent;
  steps: PersistedStep[];
  sourceCount: number;
  carriedCount: number;
  answerChars: number;
  mcpMountMs: number;
  /**
   * Wie viele Werkzeuge am Turn-ENDE noch zurückgestellt waren (toolScope.ts).
   * `0` heisst: die Gruppe stand offen oder das Modell hat sie geladen. Das ist
   * die eine Zahl, an der sich im Betrieb ablesen lässt, ob das Tor zu oft oder
   * zu selten schliesst — ohne sie ist das Zurückstellen unbeobachtbar.
   */
  deferredTools: number;
  onInfo: (message: string) => void;
}): void {
  // Per-turn tool-outcome breakdown so a silent connector failure is visible in
  // the summary line, not only in the per-tool [Tool] logs above.
  const mcpSteps = input.steps.filter((s) => s.serverName);
  // ALL steps, not just connectors: this line used to filter on `serverName`
  // first, so a turn in which `documents` and `scrape_url` both failed logged
  // `steps=6 sources=26` and nothing else. The one place that could have shown
  // the failure showed the same as a clean run.
  const failedSteps = input.steps.filter((s) => !readMcpResult(s.result).ok);
  const failedTools =
    failedSteps.length > 0
      ? ` failedTools=[${failedSteps
          .map((s) => `${s.serverName ? `${s.serverName}:` : ''}${s.toolName}`)
          .join(', ')}]`
      : '';
  // The relay-visibility line: for every connector step, how many chars its
  // result actually carried into the synth. `=0ch` next to a synth that claims
  // "no data / no access" pinpoints an empty service result vs a relay/synth bug
  // WITHOUT re-running — the gap that hid the Tally/Sally "kein Zugriff" issue.
  const mcpContent =
    mcpSteps.length > 0
      ? ` mcpContent=[${mcpSteps
          .map((s) => {
            const v = readMcpResult(s.result);
            const tag = s.serverName ? `${s.serverName}:${s.toolName}` : s.toolName;
            return v.ok ? `${tag}=${v.content.length}ch` : `${tag}=ERR`;
          })
          .join(', ')}]`
      : '';
  input.onInfo(
    `[Agentic] model=${input.modelName} mode=${input.mode}${
      input.plannerName ? ` planner=${input.plannerName} synth=${input.synthName}` : ''
    } intent=${input.intent} steps=${input.steps.length} sources=${input.sourceCount}${
      input.carriedCount > 0 ? `(carried=${input.carriedCount})` : ''
    } chars=${input.answerChars}${
      input.mcpMountMs > 0 ? ` mcpMountMs=${input.mcpMountMs}` : ''
    }${input.deferredTools > 0 ? ` deferred=${input.deferredTools}` : ''}${failedTools}${mcpContent}`
  );
}
