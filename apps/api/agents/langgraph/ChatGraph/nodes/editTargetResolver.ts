/**
 * "Worauf bezieht sich dieser Folgeauftrag?" — resolved against the thread's
 * artifacts, and nothing else.
 *
 * This is the single biggest reason the 27k-character CLASSIFIER_PROMPT still
 * runs: 11 of the 32 LLM-tier prompts in the eval corpus are a short referential
 * message ("Mach den Text größer", "Kürze die Begründung auf die Hälfte",
 * "Nochmal, aber abends mit warmem Licht"). None of them needs a tool taxonomy.
 * They need one fact: which of the things this thread already made is meant.
 *
 * The deterministic Tier-2.7 branches in `classifierNode` answer that whenever
 * the thread holds exactly ONE artifact — `lastToolContext` names it, a regex
 * confirms the edit shape, done, no model involved. This resolver exists for the
 * case that slot cannot represent: several artifacts of different kinds, where
 * "kürze das" is genuinely ambiguous between the document and the sharepic.
 * `last_tool_context` keeps only the newest, so without a list the older
 * artifact has no door at all.
 *
 * Shape follows `docsIntentTiebreak.ts` (and `queryRefineResolver.ts`):
 *   - Closed answer space — an index into a list the caller supplies.
 *   - Hard timeout; this sits on the user's critical request path.
 *   - Fail-safe: any error, timeout or unusable output returns `null`, and the
 *     caller keeps today's behaviour (newest artifact / LLM tier).
 *   - `standard` intermediate stage + the existing generic `chat_intent_classification`
 *     task type, so it inherits the worker pool's provider fallback.
 */

import { createLogger } from '../../../../utils/logger.js';
import { intermediateLane } from '../llmConfig.js';

import { renderArtifactChoices } from './artifactInventory.js';

import type { AiClient } from '../../../../services/ai/types.js';
import type { ThreadToolContext } from '../types.js';

/** @see services/ai/intermediateLanes.ts */
const LANE = intermediateLane('standard');

const log = createLogger('ChatGraph:EditTarget');

/** One word plus punctuation. The tiebreak's 800ms is the right order here. */
const RESOLVE_TIMEOUT_MS = 900;

// Die Liste und ihre Nomen stehen in `artifactInventory` — dieselbe Ordnung,
// die das schreibende Modell im ARTEFAKTE-Block sieht. Das ist der Punkt: „2."
// in der Antwort dieses Auflösers meint denselben Gegenstand, den der Schreiber
// an zweiter Stelle gelesen hat. Solange beide ihre Liste selbst bauten, war
// diese Übereinstimmung Zufall.

const RESOLVE_PROMPT = `Ein Gespräch hat mehrere Artefakte erzeugt. Der/die Nutzer*in schreibt jetzt einen kurzen Folgeauftrag. Entscheide, auf WELCHES Artefakt er sich bezieht.

Antworte NUR mit der Nummer aus der Liste.

Antworte 0, wenn der Auftrag sich auf keines der Artefakte bezieht — eine neue Frage, ein neues Thema, ein eigenständiger Auftrag oder eine Bitte, nichts zu verändern.

Im Zweifel 0.`;

interface ResolveArgs {
  userContent: string;
  /** Newest first, as `listThreadArtifacts` returns them. */
  artifacts: ThreadToolContext[];
  aiClient: AiClient;
}

/**
 * Index into `artifacts` of the artifact the message targets, or `null` when the
 * model answered "none", failed, or timed out. Callers MUST treat `null` as
 * "keep the existing behaviour" — never as "there is no artifact".
 */
export async function resolveEditTarget({
  userContent,
  artifacts,
  aiClient,
}: ResolveArgs): Promise<number | null> {
  if (artifacts.length < 2) return null;
  const startTime = Date.now();

  const list = renderArtifactChoices(artifacts);

  try {
    const response = await withTimeout(
      aiClient.processRequest(
        {
          type: 'chat_intent_classification',
          provider: LANE.provider,
          systemPrompt: RESOLVE_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Artefakte (1 = zuletzt erzeugt):\n${list}\n\nFolgeauftrag: "${userContent}"`,
            },
          ],
          options: { model: LANE.model, max_tokens: 8, temperature: 0 },
        },
        null
      ),
      RESOLVE_TIMEOUT_MS
    );

    const index = parseIndex(response.content, artifacts.length);
    const elapsedMs = Date.now() - startTime;
    // Resolve the artifact before logging it. Reading `artifacts[index].kind`
    // straight out of the log template made the range check unfalsifiable: with
    // the check removed, an out-of-range index threw a TypeError HERE, the catch
    // below turned it into `null`, and the outcome was identical — so a mutation
    // probe on the check came back green and proved nothing about it.
    const picked = index == null ? null : (artifacts[index] ?? null);
    if (index == null || !picked) {
      log.info(`[EditTarget] "${userContent.slice(0, 40)}" → keines (${elapsedMs}ms)`);
      return null;
    }
    log.info(
      `[EditTarget] "${userContent.slice(0, 40)}" → ${index + 1}. ${picked.kind} (${elapsedMs}ms)`
    );
    return index;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(`[EditTarget] Failed after ${Date.now() - startTime}ms: ${reason}. Keeping default.`);
    return null;
  }
}

/**
 * First integer in the answer, 1-based, converted to a 0-based index. `0` and
 * anything out of range mean "none" — a model that answers "3" for a two-item
 * list has not picked an artifact, and guessing on its behalf is how the wrong
 * one gets edited.
 */
function parseIndex(raw: string | undefined | null, count: number): number | null {
  if (!raw) return null;
  const match = /\d+/.exec(raw);
  if (!match) return null;
  const n = Number.parseInt(match[0], 10);
  if (!Number.isFinite(n) || n < 1 || n > count) return null;
  return n - 1;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Edit target timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
