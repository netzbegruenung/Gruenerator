/**
 * Der einzige Kanal des werkzeuglosen Schreibers (split) zu den ARTEFAKTEN
 * dieses Turns — ein Artefakt, das er nicht sieht, ist eines, das er leugnet.
 *
 * Rein: Turn-Zustand plus zwei Flags. Einzeln geprüft in
 * `artifactNotes.vitest.ts`.
 */
import { NO_ARTIFACT_URL_RULE } from '../../../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';

import {
  EDITOR_SURFACE_NOUNS,
  isEditToolEnabled,
  resolveEditorSurfaceKind,
  TOOL_EDIT_SURFACES,
  type EditorSurfaceKind,
} from './routing.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/** Catalog keys that can produce a user-visible artifact. Gates the synth's
 *  capability note — see its call site. */
export const ARTIFACT_TOOL_NAMES = [
  'generate_image',
  'sharepic',
  'create_presentation',
  'create_sheet',
  'create_document',
  'create_pdf',
  'create_board',
  'edit_document',
] as const;

/** Is the surface's artefact actually open, with an addressable id? Each
 *  surface carries its target in its own state field. */
function hasOpenEditTarget(state: ChatGraphState, kind: EditorSurfaceKind): boolean {
  if (kind === 'board') return state.currentBoard?.id != null;
  if (kind === 'canvas') return state.currentCanvas?.id != null;
  return state.currentDocument?.id != null;
}

/**
 * An editor sidebar whose artefact IS open, whose toggle IS on — and whose
 * `edit_document` was nevertheless not mounted, because `decideEditToolLoop`
 * refused the turn (image attachment, selected notebook, secondary intent, a
 * forced tool, a compound turn). That leaves NO edit path at all: nothing plans
 * ops, nothing dispatches, and without the note below the model is told only
 * that it sits in an editor and answers as if it had edited.
 *
 * `doc` used to be excluded here because it still had the classifier's
 * `trigger_doc_edit` stage to fall back on. Since #3428 that stage is gone and
 * the doc dispatch lives in the tool, so a missing tool means the same thing on
 * every surface — which is the whole point of the trade-off `decideEditToolLoop`
 * makes: those turns are allowed to skip the edit, but never to pretend.
 */
function noEditPathSurface(
  state: ChatGraphState,
  surface: EditSurfaceReading
): EditorSurfaceKind | null {
  if (surface.kind == null || !surface.toggleOn) return null;
  const orphaned =
    TOOL_EDIT_SURFACES.has(surface.kind) &&
    hasOpenEditTarget(state, surface.kind) &&
    state.editToolSurface == null;
  return orphaned ? surface.kind : null;
}

/**
 * The two facts every note below keys on, resolved ONCE per call.
 *
 * Not a convenience: `buildArtifactNotes` prints two MUTUALLY EXCLUSIVE notes
 * ("die KI-Bearbeitung ist ausgeschaltet" vs. "in diesem Zug kann nicht
 * bearbeitet werden"), and they are only exclusive as long as both read the
 * same answer. Asking twice is how that guarantee is lost. See
 * `isEditToolEnabled` for the same failure one layer down.
 */
interface EditSurfaceReading {
  kind: EditorSurfaceKind | null;
  toggleOn: boolean;
}

function readEditSurface(state: ChatGraphState): EditSurfaceReading {
  return {
    kind: resolveEditorSurfaceKind(state.agentConfig?.identifier, state.enabledTools),
    toggleOn: isEditToolEnabled(state.enabledTools),
  };
}

/**
 * The "no edit path this turn" note on its own, for the UNIFIED loop.
 *
 * Unified mode has no synth phase and never calls {@link buildArtifactNotes} —
 * one model holds the tools and writes the answer in one stream — so without
 * this the honesty rule reached only split-mode turns. Which is backwards: the
 * editor agents run on Mistral, and Mistral is exactly what `resolveLoopMode`
 * sends down the unified path.
 */
export function buildNoEditPathNote(state: ChatGraphState): string {
  const kind = noEditPathSurface(state, readEditSurface(state));
  return kind == null ? '' : `\n\n${noEditPathNote(kind)}`;
}

/** One sentence, one place — both loop modes print the same thing. */
function noEditPathNote(kind: EditorSurfaceKind): string {
  const artefact = EDITOR_SURFACE_NOUNS[kind];
  const geoeffnete = artefact.gender === 'f' ? 'die geöffnete' : 'das geöffnete';
  return `HINWEIS: In diesem Zug kann ${geoeffnete} ${artefact.noun} nicht direkt bearbeitet werden. Beschreibe die gewünschte Änderung als Text und behaupte nicht, sie vorgenommen zu haben.`;
}

/**
 * The synth model's only channel for "what did this turn actually produce".
 *
 * Split mode runs the writer WITHOUT tools and without the tool-result replay,
 * so an artifact it cannot see is an artifact it will deny. Extracted from
 * `buildSynthSystem` to be testable on its own after two live failures that both
 * came down to what this string does or does not say — see the notes inside.
 */
export function buildArtifactNotes(
  state: ChatGraphState,
  opts: {
    artifactToolMounted: boolean;
    /** Whether a native tool or MCP connector call failed this same turn —
     *  set by the caller from `buildToolFailureNote`/`mcpHasFailure` so this
     *  function can tell a clean success from a mixed success+failure turn. */
    hasFailures?: boolean;
  }
): { notes: string; capabilityNote: string; producedArtifact: boolean } {
  const artifactToolMounted = opts.artifactToolMounted;
  // Surface + AI-edit toggle, read ONCE and passed on — see `EditSurfaceReading`.
  const surface = readEditSurface(state);
  const editSurfaceKind = surface.kind;
  const editToggleOn = surface.toggleOn;
  const noEditPathKind = noEditPathSurface(state, surface);
  // Split mode has no tool returns in the synth context — without these
  // notes the synthesizer is blind to artifacts the gather phase produced.
  const artifacts = [
    state.generatedImage
      ? 'HINWEIS: In diesem Turn wurde bereits ein Bild erstellt und dem*der Nutzer*in angezeigt — kündige es kurz an. Behaupte NIEMALS, die Bildgenerierung sei fehlgeschlagen: sie ist geglückt, das Bild steht sichtbar im Chat.'
      : '',
    // Artefakte aus FRÜHEREN Turns stehen NICHT mehr hier, sondern im
    // ARTEFAKTE-Block von `systemMessage` (respondNode → artifactInventory).
    // Der Hinweis stand kurz an dieser Stelle und deckte genau eine Art ab
    // (Bild) aus genau einer Quelle (dem einen `lastToolContext`-Slot). Die
    // Liste dort kommt aus `threadArtifacts`, kennt alle Arten und erreicht
    // beide Pfade — dieselbe Zeile hier wäre eine zweite, ärmere Wahrheit.
    (state.sharepicVariants?.length ?? 0) > 0
      ? 'HINWEIS: In diesem Turn wurde bereits ein Sharepic erstellt und dem*der Nutzer*in angezeigt — kündige es kurz an und biete Anpassungen an.'
      : '',
    state.createdDocument != null
      ? `HINWEIS: In diesem Turn wurde bereits ${
          state.createdDocument.subtype === 'presentations'
            ? 'eine Präsentation'
            : state.createdDocument.subtype === 'sheets'
              ? 'eine Tabelle'
              : 'ein Dokument'
        } ("${state.createdDocument.title}") erstellt und dem*der Nutzer*in angezeigt — kündige es kurz an und fasse die recherchierten Kerninhalte zusammen. ${NO_ARTIFACT_URL_RULE}`
      : '',
    state.createdBoard != null
      ? `HINWEIS: In diesem Turn wurde bereits ein Board ("${state.createdBoard.title}") erstellt und dem*der Nutzer*in angezeigt — kündige es kurz an und nenne den Pfad genau so: /boards/${state.createdBoard.boardId}. ${NO_ARTIFACT_URL_RULE}`
      : '',
    // Gated on there BEING an edit path: `compoundEdit` and `editToolLoop` are
    // decided separately (a `secondaryIntent` kills the second and not the
    // first), and since #3428 nothing outside the loop inserts anything. Left
    // ungated, this note and the "kann in diesem Zug nicht bearbeitet werden"
    // note below would arrive together and contradict each other.
    state.compoundEdit === true && noEditPathKind == null
      ? 'HINWEIS: Die recherchierten Inhalte werden gerade in das GEÖFFNETE Dokument eingefügt. Schreibe NUR eine KURZE Bestätigung (1–2 Sätze), die das Thema nennt und sagt, dass es ins Dokument eingearbeitet wird — KEINE lange Ausformulierung (der Inhalt landet im Dokument, nicht im Chat).'
      : '',
    // The edit tool PLANNED a change for the open artefact this turn and sent
    // it to the client, which applies it in place (Univer / Yjs). Two failure
    // modes to hold apart, and the prompt used to invite the second while
    // fixing the first:
    //
    //  - The model writes nothing (→ fallback) or claims it cannot edit at all
    //    — observed live as "keine Antwort gefunden" after 5 slides and "kann
    //    die Akzentfarbe nicht ändern" after set_deck_option succeeded. Still
    //    forbidden below.
    //  - The model reports the change as SAVED. The server cannot know that:
    //    `editor_operations` has no acknowledgement channel, so with the deck
    //    not open in a client the ops go nowhere and only a toast appears. On
    //    03.08.2026 the answer said "AKTUALISIERT" and the deck was unchanged
    //    on reload. Ordering past tense here is what produced that sentence.
    //
    // Present tense is the honest form of what the server actually knows.
    //
    // The doc surface adds one clause, because its apply path ends somewhere
    // else: BlockNote writes suggestion MARKS, and the change is only in the
    // document once the person accepts them. The unified loop reads the same
    // fact off the tool result (`note`); split mode has no tool results in the
    // writing context, so it has to be said here.
    state.editorEditsSummary
      ? `HINWEIS: Die gewünschte Änderung ist geplant und wird gerade in die GEÖFFNETE Datei übernommen: ${state.editorEditsSummary}. Sag das dem*der Nutzer*in KURZ in der GEGENWART (1 Satz, z.B. „Die Folien werden gerade aktualisiert — …"). Behaupte NIEMALS, du könntest die Änderung nicht vornehmen — sie ist bereits ausgelöst. Behaupte aber ebenso NICHT, sie sei fertig GESPEICHERT: das Übernehmen geschieht in der geöffneten Datei.${state.editToolSurface === 'doc' ? ' Im Dokument erscheint sie als VORSCHLAG — nenne das und sag dazu, dass die Person ihn dort annehmen oder verwerfen kann.' : ''}`
      : '',
    // Editor surface with the AI-edit toggle OFF: the edit tool is NOT
    // mounted, so any "I changed X" would be a false claim the client never
    // applied. Force the model to say editing is off instead.
    editSurfaceKind != null && !editToggleOn
      ? 'HINWEIS: Die KI-Bearbeitung ist ausgeschaltet — du kannst das geöffnete Dokument nur ANSEHEN und Fragen dazu beantworten, aber NICHTS ändern. Wird eine Änderung gewünscht, sag freundlich und knapp, dass die Bearbeitung ausgeschaltet ist (Stift-Symbol im Chat), und behaupte NIEMALS, etwas geändert/eingetragen zu haben.'
      : '',
    // Mutually exclusive with the note above by construction (`editToggleOn`):
    // "the toggle is off" and "the toggle is on but this turn cannot edit" are
    // different facts and must never arrive together.
    noEditPathKind != null ? noEditPathNote(noEditPathKind) : '',
  ]
    .filter(Boolean)
    .map((n) => `\n\n${n}`)
    .join('');
  // Turn-outcome honesty: with no gathered sources the model must not claim
  // it researched — the classic follow-up lie ("laut meiner Recherche …"
  // with zero tool calls). Skip when an artifact WAS produced (those turns
  // legitimately have their own confirmation notes above).
  const producedArtifact =
    state.generatedImage != null ||
    (state.sharepicVariants?.length ?? 0) > 0 ||
    state.createdDocument != null ||
    state.createdBoard != null ||
    state.editorEditsSummary != null;
  // The platform CAN generate sharepics/images (via loop tools) — the synth
  // model has no tools of its own, so without this it defaults to "I'm just
  // a text model, I can't make images" and refuses (observed live).
  //
  // Attached only when an artifact tool was actually mounted this turn, or
  // one was produced — not unconditionally. On a pure knowledge turn it was
  // ~550 characters advertising Sharepics nobody had asked about, and it
  // worked AGAINST answer rule 1, which then had to forbid the very offers
  // this note invites. Two rules cancelling each other out.
  //
  // Der Schluss-Satz hing früher fest an dieser Notiz und nannte BEIDE
  // Ausgänge — auch auf einem Turn, dessen Artefakt nachweislich fertig war.
  // Der Prompt trug damit gleichzeitig „ein Bild wurde erstellt, kündige es
  // an" und eine fertige Formulierung fürs Gegenteil, und der Schreiber
  // (gemma4-31b) griff live zur zweiten: „Die Bildgenerierung ist leider
  // fehlgeschlagen" — unter dem sichtbaren Bild. Ein Ausgang, den der Code
  // bereits kennt, gehört nicht als Wahlmöglichkeit in den Prompt.
  // Mixed outcome: this turn produced SOMETHING but something else in the same
  // turn also failed (a native tool error or a failed MCP call — the caller
  // passes both in as one flag). Left as two independent clauses, the writer
  // had already shown it picks ONE of them rather than weaving them together —
  // announcing the success and burying or omitting the failure, or vice versa.
  // A single paragraph instruction forces it to hold both at once.
  const outcomeClause =
    producedArtifact && opts.hasFailures
      ? ' In diesem Turn ist EINIGES geglückt und ANDERES fehlgeschlagen. Schreibe dazu EINEN zusammenhängenden Absatz, der beides nennt: was fertig ist (knapp) und was nicht geklappt hat samt Grund — nicht zwei unverbundene Sätze, und verschweige keinen der beiden Ausgänge.'
      : producedArtifact
        ? ' In diesem Turn wurde ein Artefakt ERSTELLT: kündige es knapp an und fasse die recherchierten Kerninhalte zusammen. Behaupte unter keinen Umständen, die Erstellung sei fehlgeschlagen.'
        : ' Wurde ein Artefakt angefragt aber nicht erstellt, sag knapp, dass die Erstellung nicht geklappt hat.';
  const capabilityNote =
    artifactToolMounted || producedArtifact
      ? `\n\nWICHTIG: Du bist Teil einer Plattform, die Sharepics, Bilder, Präsentationen, Tabellen, Dokumente und Boards über Tools ERSTELLEN kann. Behaupte NIEMALS, du seist "nur ein Textmodell" oder nutztest "ein textbasiertes Format", und biete NIEMALS ein Text-Konzept/Storyboard als Ersatz für eine echte Präsentation/Tabelle/ein Dokument an.${outcomeClause}`
      : '';
  return { notes: artifacts, capabilityNote, producedArtifact };
}
