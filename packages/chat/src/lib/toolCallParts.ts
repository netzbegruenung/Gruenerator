/**
 * assistant-ui keys tool-call parts by `toolCallId` and throws "Duplicate key
 * toolCallId-…" on a repeat, which takes the whole message view down. Every
 * place that hands content to the runtime passes it through here, so a repeat
 * from any source (a row persisted twice, a card rebuilt by a resume, an old
 * server) costs a card instead of the message. The first card per id wins.
 */
export function dropDuplicateToolCalls<P extends { type: string }>(parts: readonly P[]): P[] {
  const seen = new Set<string>();
  return parts.filter((p) => {
    if (p.type !== 'tool-call' || !('toolCallId' in p) || typeof p.toolCallId !== 'string') {
      return true;
    }
    if (seen.has(p.toolCallId)) return false;
    seen.add(p.toolCallId);
    return true;
  });
}
