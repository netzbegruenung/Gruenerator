/**
 * Which artifacts this turn's tools actually changed, and which ones the
 * phantom-edit guard watches (stripPhantomArtifactEdit, #4458).
 */
import type { PersistedStep } from './types.js';
import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';
import type { EditableArtifactKind } from '../outputSanity.js';

const KIND_BY_TOOL: Readonly<Record<string, EditableArtifactKind>> = {
  sharepic: 'sharepic',
  edit_current_sharepic: 'sharepic',
  edit_sharepic: 'sharepic',
  create_sheet: 'sheet',
  edit_sheet: 'sheet',
  create_presentation: 'presentation',
  edit_presentation: 'presentation',
  create_document: 'document',
  create_board: 'board',
  create_explainable: 'explainable',
  edit_explainable: 'explainable',
  edit_document_text: 'document',
};

const KIND_BY_SURFACE: Readonly<Record<string, EditableArtifactKind>> = {
  doc: 'document',
  sheet: 'sheet',
  presentation: 'presentation',
  board: 'board',
  canvas: 'sharepic',
};

// add_card only asks (confirm card); these write immediately.
const BOARD_WRITES = new Set(['edit_card', 'move_card', 'set_due', 'assign']);

function changedSomething(step: PersistedStep): boolean {
  if (step.ok === false) return false;
  const r = step.result ?? {};
  // A confirm question is not a change, and neither is an error in the body.
  return r.needsConfirmation !== true && r.error == null;
}

export function editedArtifactKinds(
  steps: readonly PersistedStep[],
  state: Pick<ChatGraphState, 'editToolSurface'>
): Set<EditableArtifactKind> {
  const kinds = new Set<EditableArtifactKind>();
  for (const step of steps) {
    if (!changedSomething(step)) continue;
    const direct = KIND_BY_TOOL[step.toolName];
    if (direct) kinds.add(direct);
    if (step.toolName === 'edit_document' && state.editToolSurface) {
      const surface = KIND_BY_SURFACE[state.editToolSurface];
      if (surface) kinds.add(surface);
    }
    if (step.toolName === 'boards_tasks' && BOARD_WRITES.has(String(step.args?.action))) {
      kinds.add('board');
    }
  }
  return kinds;
}

/** Sharepic always (as before); the rest only when the thread really has one. */
export function guardedArtifactKinds(
  state: Pick<ChatGraphState, 'threadArtifacts' | 'editToolSurface' | 'lastToolContext'>
): Set<EditableArtifactKind> {
  const kinds = new Set<EditableArtifactKind>(['sharepic']);
  for (const a of [
    ...(state.threadArtifacts ?? []),
    ...(state.lastToolContext ? [state.lastToolContext] : []),
  ]) {
    if (
      a.kind === 'sheet' ||
      a.kind === 'presentation' ||
      a.kind === 'document' ||
      a.kind === 'board' ||
      a.kind === 'explainable'
    ) {
      kinds.add(a.kind);
    }
  }
  const surface = state.editToolSurface ? KIND_BY_SURFACE[state.editToolSurface] : null;
  if (surface) kinds.add(surface);
  return kinds;
}
