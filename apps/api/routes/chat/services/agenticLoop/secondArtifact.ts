/**
 * Ein zweites Artefakt im selben Turn: „eine Präsentation mit 5 Folien und dazu ein
 * Sharepic" (#5957).
 *
 * Bis 11/2026 nahm `forceFinish` nach dem ersten Artefakt ALLE Werkzeuge weg. Ein
 * reiner Auftrag baut sein Artefakt vor dem Strom (`runOrderedArtifact`), also hatte
 * das Modell für das zweite nie ein Werkzeug: es meldete die Präsentation als
 * erstellt oder schrieb den Aufruf als Text (live 22.11.2026). Ein Satz im Prompt
 * dagegen half nicht, gemessen 0 von 2.
 *
 * Jetzt bekommt der Turn nach dem ersten Artefakt genau EINEN weiteren Schritt, und
 * der sieht nur die Erstell-Werkzeuge der noch freien Plätze. Ein Platz ist das Feld,
 * in dem der Zustand das Artefakt hält. Das schliesst die beiden Fehler aus, gegen
 * die `forceFinish` stand: ein zweites Sharepic (sein Platz ist belegt) und ein
 * Dokument, das das erste in `createdDocument` überschreibt (alle Dokument-Arten
 * teilen sich diesen einen Platz). Ob der Schritt etwas baut, entscheidet das Modell.
 */

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/** Erstell-Werkzeuge je Platz im Zustand. */
const SLOT_TOOLS = {
  image: ['generate_image'],
  sharepic: ['sharepic'],
  board: ['create_board'],
  document: [
    'create_presentation',
    'create_sheet',
    'create_document',
    'create_pdf',
    'create_explainable',
  ],
} as const;

type Slot = keyof typeof SLOT_TOOLS;

function filledSlots(state: ChatGraphState): Slot[] {
  const filled: Slot[] = [];
  if (state.generatedImage != null) filled.push('image');
  if ((state.sharepicVariants?.length ?? 0) > 0) filled.push('sharepic');
  if (state.createdBoard != null) filled.push('board');
  if (state.createdDocument != null) filled.push('document');
  return filled;
}

/** Eine Bearbeitung ist ein anderer Ablauf: dort bleibt es beim alten Ende. */
function editedSomething(state: ChatGraphState): boolean {
  return (
    (state.chatSharepicEdits?.length ?? 0) > 0 ||
    (state.chatArtifactEdits?.length ?? 0) > 0 ||
    state.editorEditsSummary != null
  );
}

/**
 * Die Werkzeuge des Zusatzschritts, oder `null`, wenn es keinen gibt: genau ein
 * Platz belegt, nichts bearbeitet, und mindestens ein montiertes Werkzeug eines
 * freien Platzes.
 */
export function secondArtifactTools(
  state: ChatGraphState,
  mounted: readonly string[]
): string[] | null {
  if (editedSomething(state)) return null;
  const filled = filledSlots(state);
  if (filled.length !== 1) return null;
  const have = new Set(mounted);
  const free = (Object.keys(SLOT_TOOLS) as Slot[])
    .filter((slot) => slot !== filled[0])
    .flatMap((slot) => SLOT_TOOLS[slot].filter((t) => have.has(t)));
  return free.length > 0 ? free : null;
}

/**
 * Der Zusatzschritt als kleiner Zustandsautomat über die Schrittzahl des Loops.
 * `buildPrepareStep` fragt je Schritt erst `activeTools(steps)`, dann `forceFinish()`:
 * `tools` sieht die Schrittzahl und öffnet den Zusatzschritt, `finish` liest denselben
 * Stand. Ab dem nächsten Schritt ist er verbraucht.
 */
export function createSecondArtifactGate(
  state: () => ChatGraphState,
  mounted: () => readonly string[]
) {
  let openedAt: number | null = null;
  let used = false;
  let current = 0;
  const eligible = () => secondArtifactTools(state(), mounted());
  return {
    /** Für `activeTools`: die eingeschränkte Liste im Zusatzschritt, sonst `null`. */
    tools(stepCount: number): string[] | null {
      current = stepCount;
      if (used) return null;
      if (openedAt != null) {
        if (stepCount > openedAt) {
          used = true;
          return null;
        }
        return eligible();
      }
      const list = eligible();
      if (list) openedAt = stepCount;
      return list;
    },
    /** Für `forceFinish`: wahr, solange der Zusatzschritt dieses Schritts offen ist. */
    open(): boolean {
      return !used && openedAt === current && eligible() != null;
    },
  };
}
