/**
 * Verdikte über die fertige Antwort — was der Loop noch EINMAL nachschreiben
 * lässt, und was er hinterher am Text korrigiert.
 *
 * Zwei Zeitpunkte, ein Belang:
 *  - `createAnswerValidator` läuft IM Loop (loopEngine ruft es auf der
 *    akzeptierten split-Antwort) und darf eine stille Wiederholung anordnen.
 *  - `finalizeAnswerText` läuft NACH dem Loop, wenn nichts mehr nachgeschrieben
 *    werden kann: dann bleibt nur, die Antwort zu beschneiden.
 *
 * `pdfProblemNote` steht dazwischen und bleibt eigenständig, weil sie ANHÄNGT
 * statt zu ersetzen — sie wird gestreamt, bevor die Beschneidung greift.
 */
import {
  containsBrokenJsonPayload,
  defersToSearchDespiteSources,
  deniesSearchAbilityDespiteSearching,
  looksCutOff,
  stripFabricatedArtifactDelivery,
  stripFabricatedSystemClaims,
} from '../outputSanity.js';

import { stripOutOfRangeCitations } from './citationStrip.js';
import { SYNTH_CUTOFF_RETRY_SUFFIX, SYNTH_INVALID_JSON_RETRY_SUFFIX } from './loopEngine.js';
import { type PersistedStep } from './types.js';

/**
 * Output-integrity check on the accepted split answer: broken JSON and
 * mid-sentence cut-offs earn ONE silent synth retry (loopEngine). Both shapes
 * shipped verbatim in the 2026-08 QA run.
 */
export function createAnswerValidator(): (text: string) => string | null {
  return (text) => {
    if (containsBrokenJsonPayload(text)) return SYNTH_INVALID_JSON_RETRY_SUFFIX;
    if (looksCutOff(text)) return SYNTH_CUTOFF_RETRY_SUFFIX;
    return null;
  };
}

/**
 * What the PDF self-check found, if the answer failed to mention it.
 *
 * `create_pdf` reopens the file it just wrote and reports real defects — a
 * missing text layer, an untagged structure, deleted characters. Both the tool
 * description and its result `note` order the model to pass them on. Live it
 * did not: characters had been dropped from the title and the chat said the PDF
 * was fine. An accessibility check the model may quietly skip is not a check,
 * so the finding is appended by the turn itself.
 *
 * Suppressed when the answer already says it, matched on the problem's own
 * first words rather than on keywords — a paraphrase counts as having said it,
 * and repeating ourselves reads as a second, unrelated defect.
 */
export function pdfProblemNote(steps: PersistedStep[], answer: string): string {
  const problems = steps
    .filter((s) => s.toolName === 'create_pdf')
    .flatMap((s): unknown[] => {
      const raw = s.result?.['probleme'];
      return Array.isArray(raw) ? (raw as unknown[]) : [];
    })
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  if (problems.length === 0) return '';
  const lower = answer.toLowerCase();
  const unmentioned = problems.filter((p) => {
    const opener = p.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
    return !lower.includes(opener);
  });
  if (unmentioned.length === 0) return '';
  return `\n\n_Hinweis aus der PDF-Selbstprüfung:_\n${unmentioned.map((p) => `- ${p}`).join('\n')}`;
}

export interface FinalizedAnswer {
  text: string;
  /** The text was rewritten — the caller must push it via `completion`, because
   *  the deltas already on the wire are the uncorrected version. */
  replaced: boolean;
  /** Lines to log verbatim. Returned rather than logged here so this stays a
   *  pure function over the answer. */
  warnings: string[];
}

/**
 * Everything that can still be done to an answer once no further generation is
 * possible. Pure: takes the text and what the turn legitimately saw, returns
 * the corrected text plus the verdicts worth logging.
 */
export function finalizeAnswerText(input: {
  text: string;
  /** Numbered registry size — the upper bound for a legal `[N]`. */
  sourceCount: number;
  stepCount: number;
  /** Rendered source block, the user's own words, attachments, open document —
   *  everything the model may legitimately name. */
  seenTexts: readonly string[];
  /** This turn's and the thread's real artifact ids. */
  knownArtifactRefs: readonly string[];
}): FinalizedAnswer {
  let text = input.text;
  const warnings: string[] = [];

  // Invented internal filenames ("SecureComms_Override.log") must not survive
  // into the answer — they read as a leak. Checked against everything the model
  // legitimately saw, so real attachment names pass through.
  const sanity = stripFabricatedSystemClaims(text, [...input.seenTexts]);
  if (sanity.fabricated.length > 0) {
    warnings.push(
      `[Agentic] Removed fabricated internal file claim(s): ${sanity.fabricated.join(', ')}`
    );
    text = sanity.text;
  }

  // Same guarantee as the single-pass funnel: no typed-out file, no invented
  // artefact path. The allowlist carries this turn's and the thread's real ids,
  // so the `/boards/<id>` the board note ASKS the model to print survives.
  const delivery = stripFabricatedArtifactDelivery(text, [...input.knownArtifactRefs]);
  if (delivery.removed.length > 0) {
    warnings.push(`[Agentic] Removed fabricated artefact delivery: ${delivery.removed.join(', ')}`);
    text = delivery.text;
  }

  if (
    defersToSearchDespiteSources(text, { sources: input.sourceCount, toolCalls: input.stepCount })
  ) {
    warnings.push(
      `[Agentic] Answer recommends a search although ${input.sourceCount} source(s) were gathered in ${input.stepCount} step(s) — synth ignored its source block`
    );
  }

  if (
    deniesSearchAbilityDespiteSearching(text, {
      sources: input.sourceCount,
      toolCalls: input.stepCount,
    })
  ) {
    warnings.push(
      `[Agentic] Answer denies being able to search although ${input.stepCount} step(s) gathered ${input.sourceCount} source(s) — synth prompt read as a capability limit`
    );
  }

  // The server half of the truncation cross-check (see looksCutOff). Logged
  // with the LAST 60 chars, because "where does it end" is the only question a
  // truncation report ever asks, and matching that tail against the screenshot
  // settles server-vs-client immediately.
  if (text.length > 0 && looksCutOff(text)) {
    warnings.push(
      `[Agentic] answer ends mid-sentence after ${text.length} chars — ` +
        `tail: ${JSON.stringify(text.slice(-60))}`
    );
  }

  // The synth model sometimes cites numbers the registry can't back ("[4]…[9]"
  // with 3 sources). Strip out-of-range markers and, if anything changed, the
  // caller pushes the corrected answer via `completion` — the frontend replaces
  // the streamed deltas with it (same channel the notebook flow uses).
  const clamp = stripOutOfRangeCitations(text, input.sourceCount);
  const replaced = clamp.changed || sanity.fabricated.length > 0;
  if (replaced) text = clamp.text;

  return { text, replaced, warnings };
}
