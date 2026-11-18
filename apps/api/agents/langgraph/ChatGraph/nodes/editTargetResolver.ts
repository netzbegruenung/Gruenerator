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
 * Shape follows `docsIntentTiebreak.ts`:
 *   - Closed answer space — one decision-model option per artifact in the list
 *     the caller supplies, plus "keines" (`aiDecide`: Clef Flash, Metis as hedge).
 *   - Hard timeout; this sits on the user's critical request path.
 *   - Fail-safe: any error, timeout or unusable output returns `null`, and the
 *     caller keeps today's behaviour (newest artifact / LLM tier).
 *
 * Measured in `evals/metis` (`editTarget`, 32 cases × 2 runs, final run
 * 2026-11-09): decision models 62/64, holdout 16/16, p90 197 ms; the former
 * Mistral Small prompt 23/32 in that run (9 × `null` at the 900 ms budget, p50
 * 746 ms) but 32/32 in the first run. Both models still send "Mach den Text
 * größer" to the document when a sharepic is the newest artifact.
 */

import { aiDecide, type ChoiceQuestion } from '../../../../services/ai/decide.js';
import { createLogger } from '../../../../utils/logger.js';

import { renderArtifactChoices } from './artifactInventory.js';

import type { ThreadToolContext } from '../types.js';

const log = createLogger('ChatGraph:EditTarget');

/** Kept from the LLM version. `aiDecide` asks Metis after 400 ms, so a slow
 *  Melious answer still fits. */
const RESOLVE_TIMEOUT_MS = 900;

// Die Nomen stehen in `artifactInventory` — dieselbe Ordnung, die das
// schreibende Modell im ARTEFAKTE-Block sieht: Option „2" meint denselben
// Gegenstand, den der Schreiber an zweiter Stelle gelesen hat.

/**
 * Woraus eine Artefaktart besteht. Ohne das verbanden beide Entscheidungsmodelle
 * „die Kachel" oder „das Hintergrundbild" nicht mit dem Sharepic (Eval: 88 % →
 * 97 %). Beschreibt die Option, entscheidet nichts.
 */
const ARTIFACT_PARTS: Record<ThreadToolContext['kind'], string> = {
  image: 'ein Bild oder Foto ohne Text',
  sharepic:
    'eine Social-Media-Grafik: Text, Zitat oder Zahl auf Kacheln über einem Hintergrundbild',
  document: 'ein Fließtext mit Überschrift, Einleitung, Absätzen und Begründung',
  presentation: 'Folien',
  sheet: 'eine Tabelle mit Zeilen, Spalten und Summen',
  pdf: 'eine fertige Druckdatei, etwa ein Flyer',
  explainable: 'eine Erklärseite in einfacher Sprache mit Erklärbildern',
  board: 'ein Aufgaben-Board mit Spalten und Karten',
  mcp: 'eine Abfrage bei einem Dienst',
  notebook: 'eine Recherche in Notebooks',
  bundestag: 'eine Bundestag-Recherche',
  abgeordnetenwatch: 'eine Abgeordnetenwatch-Recherche',
};

const NONE = 'keines';

/** Options "1".."n" carry the same lines as the numbered list in the state. */
function targetQuestion(artifacts: readonly ThreadToolContext[], list: string): ChoiceQuestion {
  return {
    type: 'choice',
    instructions: 'Auf welches Artefakt bezieht sich der FOLGEAUFTRAG? Im Zweifel: keines.',
    criteria: {
      ...Object.fromEntries(
        list
          .split('\n')
          .map((line, i) => [
            String(i + 1),
            `${line.replace(/^\d+\.\s*/, '')} – ${ARTIFACT_PARTS[artifacts[i]!.kind]}`,
          ])
      ),
      [NONE]:
        'keines: eine neue Frage, ein neues Thema, ein eigenständiger neuer Auftrag oder die Bitte, nichts zu ändern',
    },
  };
}

interface ResolveArgs {
  userContent: string;
  /** Newest first, as `listThreadArtifacts` returns them. */
  artifacts: ThreadToolContext[];
}

/**
 * Index into `artifacts` of the artifact the message targets, or `null` when the
 * model answered "none", failed, or timed out. Callers MUST treat `null` as
 * "keep the existing behaviour" — never as "there is no artifact".
 */
export async function resolveEditTarget({
  userContent,
  artifacts,
}: ResolveArgs): Promise<number | null> {
  if (artifacts.length < 2) return null;
  const startTime = Date.now();

  const list = renderArtifactChoices(artifacts);

  try {
    const { target } = await aiDecide({
      label: 'EditTarget',
      state: `ARTEFAKTE DIESES GESPRÄCHS (1 = zuletzt erzeugt):\n${list}\n\nFOLGEAUFTRAG:\n${userContent}`,
      questions: { target: targetQuestion(artifacts, list) },
      timeoutMs: RESOLVE_TIMEOUT_MS,
    });

    const index = parseIndex(target.choice, artifacts.length);
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
 * The chosen option key, 1-based, as a 0-based index. "keines" and anything
 * outside the list mean "none" — guessing on the model's behalf is how the
 * wrong artifact gets edited.
 */
function parseIndex(choice: string, count: number): number | null {
  if (!/^\d+$/.test(choice)) return null;
  const n = Number.parseInt(choice, 10);
  if (n < 1 || n > count) return null;
  return n - 1;
}
