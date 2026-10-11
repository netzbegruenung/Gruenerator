import type {
  ChatGraphState,
  ThreadToolContext,
} from '../../../agents/langgraph/ChatGraph/types.js';

type ArtifactKind = ThreadToolContext['kind'];

/**
 * The thread's artifacts of one kind, newest first. `lastToolContext` leads:
 * it is the newest by definition, and some create paths (save_as_doc) never
 * write `createdDocument` metadata, so `threadArtifacts` misses them — live
 * 11.10.2026 the classifier found the document there and the tools did not.
 */
function candidates(state: ChatGraphState, kind: ArtifactKind): string[] {
  const refs = [state.lastToolContext, ...(state.threadArtifacts ?? [])]
    .filter((a): a is ThreadToolContext => a?.kind === kind && !!a.ref)
    .map((a) => a.ref as string);
  return [...new Set(refs)];
}

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
  const refs = candidates(state, kind);
  if (id && refs.includes(id)) return id;
  return refs[0] ?? null;
}

export function threadHasArtifact(state: ChatGraphState, kind: ArtifactKind): boolean {
  return (
    state.lastTurnEditables?.some((k) => k === kind) === true || candidates(state, kind).length > 0
  );
}
