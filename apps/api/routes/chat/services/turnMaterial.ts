/**
 * How much MATERIAL a turn carries — text the user brought for the model to
 * work ON, as opposed to the question asked about it.
 *
 * One number, two consumers, deliberately:
 *  - `resolveAutoSelection` routes a material-heavy turn to the precise lane
 *    (see MATERIAL_LANE_MIN_CHARS in autoPolicy.ts),
 *  - `materialDominatesTurn` takes the same number away from the unified loop.
 * Computed twice, the two decisions could disagree — the lane would call a turn
 * ordinary while the loop called it material, which is precisely the
 * configuration the 13.08.2026 degeneration ran in.
 *
 * Why a length and not a phrase: the routing signal it replaces guessed at
 * wordings ("gib nur", "ergänze exakt") and could only ever recognise the
 * formulations it was built against. A pasted article is 10.000 characters no
 * matter how its owner phrases the order — in any language, in any register.
 *
 * Text only. An image contributes a vision summary, not material to transform.
 *
 * The one invariant: count only what actually REACHES the prompt. A number
 * measuring text the model never sees does not describe the turn — and both
 * consumers spend it as if it did.
 */

export interface TurnMaterialState {
  /** THIS turn's uploads, already rendered into prompt text. */
  attachmentContext?: string | null | undefined;
  /** Documents carried over from earlier turns in the thread. */
  threadAttachments?:
    | readonly {
        isImage: boolean;
        /** Qdrant id, set once the attachment was chunked and embedded. */
        documentId?: string | null | undefined;
        extractedText?: string | null | undefined;
        summary?: string | null | undefined;
      }[]
    | undefined;
}

export function turnMaterialChars(state: TurnMaterialState): number {
  return (
    (state.attachmentContext?.length ?? 0) +
    (state.threadAttachments ?? [])
      // A vectorized attachment contributes NOTHING to the prompt —
      // `formatThreadAttachmentsContext` drops the whole row on the same
      // condition (`!a.documentId`), text and summary alike, because the
      // chunks come back per query via RAG instead. Counting its full length
      // here measured a 57.215-char .docx that was not in the prompt, five
      // times over (one row per turn), and the turn then lost the very tools
      // that could have fetched it: `materialDominatesTurn` reads this number
      // and takes the writer's tool catalog away on the grounds that the
      // material is already present. Live 13.08.2026 the model said so
      // itself — "wurden mir inhaltlich nicht übermittelt" — while the log
      // for the same turn read `material=286075c`.
      .filter((a) => !a.isImage && a.documentId == null)
      .reduce((sum, a) => sum + (a.extractedText?.length ?? a.summary?.length ?? 0), 0)
  );
}
