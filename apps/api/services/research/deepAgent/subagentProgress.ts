/**
 * The sidebar step for one delegated sub-question.
 *
 * Progress comes from two places: `write_todos` (the lead's plan) and
 * `ctx.onStep` inside the tools. Since several sub-questions run at once, and
 * since they are two different kinds of researcher, the tool steps arrive
 * interleaved with nothing saying which sub-question they serve. So every
 * delegation gets one step of its own, with a start and an end — emitted by the
 * `task` tool itself (see subagents.ts), which knows the sub-question, the
 * researcher and the outcome first-hand.
 */

/**
 * Display names. Unknown subagents fall through to their raw name rather than
 * being dropped — a name in the sidebar beats a missing step.
 */
const DISPLAY_NAMES: Record<string, string> = {
  'web-recherche': 'Web-Recherche',
  'programm-recherche': 'Programm-Recherche',
};

/** How much of a sub-question fits a sidebar row. */
const LABEL_CHARS = 90;

/**
 * Said out loud on a delegation the research clock cut short.
 *
 * The status stays `failed`, because the wire enum only knows running/done/
 * failed and it crosses to shipped mobile binaries — widening it for a
 * cosmetic distinction is not worth an additive rollout. So the LABEL carries
 * the difference instead. Measured on 12.08.2026: two of eight delegations
 * were still running when the deadline fired and showed up as bare ✗ rows,
 * which reads as "something broke" when in fact the report was written and
 * only these two sub-questions did not make it.
 */
export const CUT_SHORT_NOTE = 'Zeit abgelaufen';

/**
 * Whether a rejection is the run being stopped rather than the work failing.
 *
 * The names are the same two `classifyRunError` keys off in `resume.ts`, and
 * for the same reason: an abort surfaces under either one, and under Node the
 * timeout arrives as a `DOMException` rather than an `Error` — so this checks
 * the shape, not the class.
 */
export function isAbort(reason: unknown): boolean {
  const name = (reason as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export function subagentLabel(name: string, description?: string, note?: string): string {
  const who = DISPLAY_NAMES[name] ?? name;
  const suffix = note ? ` — ${note}` : '';
  if (!description) return `${who}${suffix}`;
  const oneLine = description.replace(/\s+/g, ' ').trim();
  if (oneLine.length === 0) return `${who}${suffix}`;
  const cut = oneLine.length > LABEL_CHARS ? `${oneLine.slice(0, LABEL_CHARS - 1)}…` : oneLine;
  return `${who}: ${cut}${suffix}`;
}
