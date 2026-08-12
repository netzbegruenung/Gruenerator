/**
 * One line of forensics for a run that ended without a report.
 *
 * Its own module so the test can import it without dragging in `deepagents`
 * and the model plumbing that `index.ts` initializes. Kept to a single log
 * line rather than a dump: the failure mode this serves is "the model ended
 * its turn on purpose", and for that the last AI utterance is the whole story.
 */
export function describeFinalState(state: Record<string, unknown> | null): string {
  const messages = (state?.messages ?? []) as { content?: unknown; getType?: () => string }[];
  let lastAi = '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.getType?.() !== 'ai') continue;
    lastAi = typeof msg.content === 'string' ? msg.content : (JSON.stringify(msg.content) ?? '');
    break;
  }
  const said = lastAi.trim().slice(0, 300) || '<leer>';
  return `${messages.length} Nachricht(en), letzte KI-Antwort: "${said}"`;
}
