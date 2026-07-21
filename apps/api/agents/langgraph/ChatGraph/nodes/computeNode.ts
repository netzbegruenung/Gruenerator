/**
 * Compute Node
 *
 * Handles the `compute` intent. The division of labour is deliberate:
 *   - the LLM parses the request into a structured plan (which operation, what
 *     the target text / expression / operands are) — a task it is good at;
 *   - computeEngine.ts does the actual arithmetic in plain JS — because the LLM
 *     is NOT good at counting characters or doing exact math.
 *
 * The number the user sees is therefore always computed deterministically. If
 * the plan can't be executed (bad expression, unknown units, no target text),
 * the node returns `computedResult: null` and respondNode answers conversationally
 * instead of surfacing a fabricated figure.
 */

import { createLogger } from '../../../../utils/logger.js';
import { INTERMEDIATE_MODEL } from '../llmConfig.js';

import { extractMessageText, formatConversationHistory } from './classifierHeuristics.js';
import {
  computeTextMetrics,
  computeArithmetic,
  computeUnitConvert,
  computeDateDiff,
  computeDateAdd,
  type ComputeResult,
} from './computeEngine.js';

import type { ChatGraphState } from '../types.js';

const log = createLogger('ChatGraph:Compute');

type ComputeOperation =
  | 'text_metrics'
  | 'arithmetic'
  | 'unit_convert'
  | 'date_diff'
  | 'date_add'
  | 'unsupported';

interface ComputePlan {
  operation: ComputeOperation;
  label: string | null;
  text: string | null;
  expression: string | null;
  value: number | null;
  fromUnit: string | null;
  toUnit: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  dateAmount: number | null;
  dateUnit: 'days' | 'weeks' | 'months' | 'years' | null;
}

function buildExtractionPrompt(todayISO: string): string {
  return `Du zerlegst eine Rechen-/Zähl-Anfrage in einen strukturierten Plan. Du RECHNEST NICHT selbst — ein Programm führt die Berechnung anschließend deterministisch aus. Deine einzige Aufgabe ist, die Operation und die Operanden zu erkennen.

Heutiges Datum (ISO): ${todayISO}

Wähle GENAU EINE operation:
- "text_metrics": Zeichen/Wörter/Zeilen/Vokale eines Textes zählen. Gib in "text" den EXAKTEN, unveränderten Zieltext an (kopiere ihn wörtlich inkl. Zeilenumbrüche; lasse die Aufforderung wie "zähl die Zeichen von" weg). Der Text kann in der aktuellen Nachricht oder weiter oben im Verlauf stehen.
- "arithmetic": Rechenausdruck. Gib in "expression" einen NORMALISIERTEN Ausdruck mit '.' als Dezimaltrennzeichen und nur den Operatoren + - * / % ^ und Klammern an. Wandle Prozente um: "20% von 340" → "0.2 * 340". KEINE Einheiten, keine Wörter.
- "unit_convert": Einheitenumrechnung. Gib "value" (Zahl), "fromUnit" und "toUnit" an (z.B. km, mi, kg, lb, °C, °F, m, ft, h, min, GB, MB).
- "date_diff": Tage zwischen zwei Daten. Gib "dateFrom" und "dateTo" als "YYYY-MM-DD" an (relative Angaben wie "heute" mit dem heutigen Datum auflösen).
- "date_add": Datum plus/minus Zeitspanne. Gib "dateFrom" (Basisdatum "YYYY-MM-DD"), "dateAmount" (ganze Zahl, negativ = abziehen) und "dateUnit" ("days"|"weeks"|"months"|"years") an.
- "unsupported": Wenn keine deterministische Berechnung möglich ist.

Setze "label" auf eine kurze deutsche Beschreibung (z.B. "Zeichen zählen", "20% von 340").
Alle nicht zutreffenden Felder auf null.

Antworte NUR mit JSON:
{"operation":"...","label":"...","text":null,"expression":null,"value":null,"fromUnit":null,"toUnit":null,"dateFrom":null,"dateTo":null,"dateAmount":null,"dateUnit":null}`;
}

/** Parse the LLM plan JSON tolerantly (direct parse, then first JSON object). */
function parsePlan(content: string): ComputePlan | null {
  const tryParse = (s: string): ComputePlan | null => {
    try {
      return JSON.parse(s) as ComputePlan;
    } catch {
      return null;
    }
  };
  return tryParse(content) ?? tryParse(content.match(/\{[\s\S]*\}/)?.[0] ?? '');
}

/**
 * When the model echoes the target text it may normalise whitespace, which
 * would change the counts. Re-locate the echoed text inside the raw source and
 * count the ORIGINAL substring so the numbers describe what the user actually
 * typed. Falls back to the echo when no confident match exists.
 */
function relocateOriginal(echo: string, raw: string): string {
  const trimmed = echo.trim();
  if (!trimmed) return echo;
  const idx = raw.indexOf(trimmed);
  if (idx !== -1) return trimmed;
  // Tolerate leading/trailing whitespace drift by matching first/last line.
  const lines = trimmed.split(/\r?\n/);
  const first = lines[0];
  const last = lines[lines.length - 1];
  const start = raw.indexOf(first);
  const end = last ? raw.indexOf(last, start >= 0 ? start : 0) : -1;
  if (start !== -1 && end !== -1 && end >= start) {
    return raw.slice(start, end + last.length);
  }
  return echo;
}

function executePlan(plan: ComputePlan, rawUserText: string): ComputeResult | null {
  switch (plan.operation) {
    case 'text_metrics': {
      const target = plan.text ? relocateOriginal(plan.text, rawUserText) : rawUserText;
      const result = computeTextMetrics(target);
      return plan.label ? { ...result, operation: plan.label } : result;
    }
    case 'arithmetic':
      return plan.expression ? computeArithmetic(plan.expression, plan.label ?? undefined) : null;
    case 'unit_convert':
      return plan.value !== null && plan.fromUnit && plan.toUnit
        ? computeUnitConvert(plan.value, plan.fromUnit, plan.toUnit)
        : null;
    case 'date_diff':
      return plan.dateFrom && plan.dateTo ? computeDateDiff(plan.dateFrom, plan.dateTo) : null;
    case 'date_add':
      return plan.dateFrom && plan.dateAmount !== null && plan.dateUnit
        ? computeDateAdd(plan.dateFrom, plan.dateAmount, plan.dateUnit)
        : null;
    default:
      return null;
  }
}

export async function computeNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  const { messages, aiWorkerPool } = state;

  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
  const rawUserText = extractMessageText(lastUserMessage?.content);
  const conversationContext = formatConversationHistory(messages);
  const todayISO = new Date().toISOString().slice(0, 10);

  try {
    const userContent = conversationContext
      ? `${conversationContext}\n\nAktuelle Anfrage: "${rawUserText}"`
      : `Anfrage: "${rawUserText}"`;

    const response = await aiWorkerPool.processRequest(
      {
        type: 'chat_intent_classification',
        provider: INTERMEDIATE_MODEL.provider,
        systemPrompt: buildExtractionPrompt(todayISO),
        messages: [{ role: 'user', content: userContent }],
        options: {
          model: INTERMEDIATE_MODEL.model,
          max_tokens: 600,
          temperature: 0,
          response_format: { type: 'json_object' },
        },
      },
      null
    );

    const plan = parsePlan(response.content || '');
    if (!plan) {
      log.warn('[Compute] Could not parse plan — returning null result');
      return { computedResult: null, computedResultTimeMs: Date.now() - startTime };
    }

    const result = executePlan(plan, rawUserText);
    const timeMs = Date.now() - startTime;
    if (!result) {
      log.info(`[Compute] operation=${plan.operation} produced no result in ${timeMs}ms`);
      return { computedResult: null, computedResultTimeMs: timeMs };
    }

    log.info(`[Compute] ${plan.operation} → "${result.summary}" in ${timeMs}ms`);
    return { computedResult: result, computedResultTimeMs: timeMs };
  } catch (error) {
    log.error(
      `[Compute] Error: ${error instanceof Error ? error.message : String(error)} — falling back to text metrics`
    );
    // A pure text-metric fallback still beats a hallucinated number when the
    // user clearly pasted a block of text.
    const fallback = rawUserText.trim() ? computeTextMetrics(rawUserText) : null;
    return { computedResult: fallback, computedResultTimeMs: Date.now() - startTime };
  }
}
