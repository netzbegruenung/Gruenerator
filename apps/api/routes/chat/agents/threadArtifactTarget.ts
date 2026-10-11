import type {
  ChatGraphState,
  ThreadToolContext,
} from '../../../agents/langgraph/ChatGraph/types.js';

type ArtifactKind = ThreadToolContext['kind'];

/**
 * Die genannte, sonst die zuletzt im Gespräch entstandene oder bearbeitete Art.
 * Eine ID, die nicht zum Gespräch gehört, zählt als nicht genannt: Modelle
 * erfinden sie (live 11.10.2026 meldete read_sheet so „keine Tabelle", während
 * edit_sheet im selben Zug die richtige fand).
 */
export function resolveThreadArtifactId(
  state: ChatGraphState,
  kind: ArtifactKind,
  id?: string
): string | null {
  const matches = (state.threadArtifacts ?? []).filter((a) => a.kind === kind && a.ref);
  if (id && matches.some((a) => a.ref === id)) return id;
  return matches[0]?.ref ?? null;
}

export function threadHasArtifact(state: ChatGraphState, kind: ArtifactKind): boolean {
  return (
    state.lastTurnEditables?.some((k) => k === kind) === true ||
    state.threadArtifacts?.some((a) => a.kind === kind) === true
  );
}
