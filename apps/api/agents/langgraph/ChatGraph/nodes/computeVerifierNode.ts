/**
 * Compute Verifier Node
 *
 * Cheap plausibility check for a SUCCESSFUL run_python result (OpenWebUI lets
 * the model iterate on every output; this is our bounded equivalent). The
 * ground-truth beta run showed the failure class: code executes fine but
 * answers the wrong question (doubled totals, wrong column, wrong grouping).
 * One small LLM call judges question + code + result; an implausible verdict
 * feeds the existing correction round.
 *
 * Fail-open by design: any parse/transport problem returns plausible=true —
 * the verifier must never block a working answer.
 */

import { createLogger } from '../../../../utils/logger.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import { lastUserText } from './pandasComputeNode.js';

import type { ChatGraphState, ComputeData } from '../types.js';

const log = createLogger('ChatGraph:ComputeVerifier');

const VERIFIER_PROMPT = `Du prüfst das Ergebnis einer pandas-Berechnung auf Plausibilität. Du bekommst die Frage der*des Nutzer*in, den ausgeführten Code und das Ergebnis.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{"plausible": true} oder {"plausible": false, "hint": "<kurzer Hinweis, was am Code falsch ist>"}

Als NICHT plausibel gilt nur, was klar erkennbar falsch ist:
- Das Ergebnis beantwortet eine andere Frage als gestellt (falsche Spalte, falsche Gruppierung).
- Der Code leitet eine vorhandene Spalte doppelt her oder addiert Unzusammenhängendes.
- Werte sind offensichtlich unmöglich (negative Anzahl, leeres Ergebnis trotz Daten).
Im Zweifel: {"plausible": true}. Du kennst die Rohdaten nicht — beurteile nur Code-Logik vs. Frage.`;

export interface VerifierVerdict {
  plausible: boolean;
  hint?: string;
}

export function parseVerifierResponse(raw: string): VerifierVerdict {
  try {
    const stripped = raw
      .replace(/^\s*```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/, '')
      .trim();
    const parsed = JSON.parse(stripped) as { plausible?: unknown; hint?: unknown };
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.plausible === 'boolean') {
      return {
        plausible: parsed.plausible,
        ...(typeof parsed.hint === 'string' && parsed.hint.length > 0 && { hint: parsed.hint }),
      };
    }
  } catch {
    /* fail open below */
  }
  return { plausible: true };
}

export async function computeVerifierNode(
  state: ChatGraphState,
  result: ComputeData
): Promise<VerifierVerdict> {
  // RAW question, not searchQuery: the retrieval rewrite (or null on
  // direct/summary/chart intents) would make the verifier judge against the
  // wrong question — or silently no-op on exactly the gate-widened paths.
  const question = lastUserText(state) || state.searchQuery || '';
  const code = state.pandasLastCode || '';
  if (!question || !code) return { plausible: true };

  try {
    // Bounded: a bare df print can put the whole table into one entry value —
    // the plausibility judgement doesn't need megabytes of context.
    const entriesText = result.entries
      .map((e) => `- ${e.label}: ${e.value}`)
      .join('\n')
      .slice(0, 1500);
    const userMessage = `Frage: ${question}

Ausgeführter Code:
${code}

Ergebnis:
${entriesText}

Ist das plausibel?`;

    const response = await state.aiWorkerPool.processRequest(
      {
        type: 'chat_compute_verify',
        provider: INTERMEDIATE_MODEL.provider,
        systemPrompt: VERIFIER_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        options: {
          model: INTERMEDIATE_MODEL.model,
          max_tokens: 200,
          temperature: 0,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    const verdict = parseVerifierResponse(response.content || '');
    if (!verdict.plausible) {
      log.info(`[ComputeVerifier] Implausible result: ${verdict.hint ?? '(no hint)'}`);
    }
    return verdict;
  } catch (error: unknown) {
    log.warn(
      `[ComputeVerifier] Error (failing open): ${error instanceof Error ? error.message : String(error)}`
    );
    return { plausible: true };
  }
}
