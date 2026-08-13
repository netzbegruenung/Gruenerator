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
 */

export interface TurnMaterialState {
  /** THIS turn's uploads, already rendered into prompt text. */
  attachmentContext?: string | null | undefined;
  /** Documents carried over from earlier turns in the thread. */
  threadAttachments?:
    | readonly {
        isImage: boolean;
        extractedText?: string | null | undefined;
        summary?: string | null | undefined;
      }[]
    | undefined;
}

export function turnMaterialChars(state: TurnMaterialState): number {
  return (
    (state.attachmentContext?.length ?? 0) +
    (state.threadAttachments ?? [])
      .filter((a) => !a.isImage)
      .reduce((sum, a) => sum + (a.extractedText?.length ?? a.summary?.length ?? 0), 0)
  );
}
