import type {
  ChatGraphState,
  ThreadToolContext,
} from '../../../agents/langgraph/ChatGraph/types.js';

type ArtifactKind = ThreadToolContext['kind'];

/** Die genannte, sonst die zuletzt im Gespräch entstandene oder bearbeitete Art. */
export function resolveThreadArtifactId(
  state: ChatGraphState,
  kind: ArtifactKind,
  id?: string
): string | null {
  const matches = (state.threadArtifacts ?? []).filter((a) => a.kind === kind && a.ref);
  if (id) return matches.some((a) => a.ref === id) ? id : null;
  return matches[0]?.ref ?? null;
}

export function threadHasArtifact(state: ChatGraphState, kind: ArtifactKind): boolean {
  return (
    state.lastTurnEditables?.some((k) => k === kind) === true ||
    state.threadArtifacts?.some((a) => a.kind === kind) === true
  );
}
