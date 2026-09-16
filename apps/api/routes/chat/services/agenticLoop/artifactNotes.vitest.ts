import { describe, it, expect } from 'vitest';

import { buildArtifactNotes } from './artifactNotes.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/**
 * Was der Schreiber über diesen Turn erfährt.
 *
 * Im Split-Modus läuft der schreibende Aufruf OHNE Werkzeuge und ohne die
 * Tool-Ergebnisse — was hier nicht drinsteht, existiert für ihn nicht. Zwei live
 * beobachtete Fehler hingen genau daran, und beide waren am fertigen String zu
 * sehen, nicht am Zustand:
 *
 *  1. Unter einem sichtbar erzeugten Bild schrieb der Loop „Die Bildgenerierung
 *     ist leider fehlgeschlagen." Der Erfolgshinweis stand im Prompt — daneben
 *     aber auch die fertige Formulierung fürs Gegenteil.
 *  2. Einen Turn später: „Da ich bisher kein Bild generiert habe …", während das
 *     Bild im selben Thread stand. `lastToolContext` steuerte ausschliesslich die
 *     Klassifikation und erreichte den Prompt nie.
 */

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    generatedImage: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    editorEditsSummary: null,
    compoundEdit: false,
    lastToolContext: null,
    agentConfig: { identifier: 'gruenerator-universal' },
    enabledTools: {},
    ...overrides,
  } as unknown as ChatGraphState;
}

const anImage = { url: 'https://x/y.png', prompt: 'Windrad', style: 'realistic' };

describe('buildArtifactNotes', () => {
  it('nennt ein erzeugtes Bild und verbietet die Fehlschlag-Behauptung', () => {
    const { notes, producedArtifact } = buildArtifactNotes(
      makeState({ generatedImage: anImage as never }),
      { artifactToolMounted: true }
    );
    expect(producedArtifact).toBe(true);
    expect(notes).toContain('wurde bereits ein Bild erstellt');
    expect(notes).toContain('fehlgeschlagen');
    expect(notes).toContain('sie ist geglückt');
  });

  it('bietet auf einem Erfolgs-Turn KEINE Fehlschlag-Formulierung mehr an', () => {
    // Der eigentliche Befund: der Prompt trug beide Ausgänge gleichzeitig, und
    // der Schreiber griff zum falschen. Ein Ausgang, den der Code bereits kennt,
    // gehört nicht als Wahlmöglichkeit hinein.
    const { capabilityNote } = buildArtifactNotes(makeState({ generatedImage: anImage as never }), {
      artifactToolMounted: true,
    });
    expect(capabilityNote).toContain('wurde ein Artefakt ERSTELLT');
    expect(capabilityNote).not.toContain('nicht erstellt');
  });

  it('behält die Fehlschlag-Formulierung, wenn NICHTS erzeugt wurde', () => {
    const { capabilityNote, producedArtifact } = buildArtifactNotes(makeState(), {
      artifactToolMounted: true,
    });
    expect(producedArtifact).toBe(false);
    expect(capabilityNote).toContain('nicht erstellt');
  });

  it('überlässt frühere Artefakte dem Inventar', () => {
    // Diese Notizen beschreiben, was DIESER Turn getan hat — jede trägt eine
    // Handlungsanweisung („kündige es kurz an"). Was der Thread schon hält,
    // steht im ARTEFAKTE-Block von `systemMessage` (artifactInventory), der
    // beide Pfade erreicht und alle Arten kennt statt nur Bilder. Kurzzeitig
    // stand hier eine zweite, ärmere Fassung davon.
    const { notes } = buildArtifactNotes(
      makeState({ lastToolContext: { kind: 'image', ref: 'img-1', label: 'Bild' } as never }),
      { artifactToolMounted: false }
    );
    expect(notes).toBe('');
  });

  it('sagt nicht zweimal dasselbe, wenn der Turn selbst ein Bild erzeugt hat', () => {
    const { notes } = buildArtifactNotes(
      makeState({
        generatedImage: anImage as never,
        lastToolContext: { kind: 'image', ref: 'img-0', label: 'Bild' } as never,
      }),
      { artifactToolMounted: true }
    );
    expect(notes).toContain('In diesem Turn wurde bereits ein Bild erstellt');
    expect(notes).not.toContain('Früher in diesem Gespräch');
  });

  it('schweigt komplett, wenn nichts vorliegt und kein Artefakt-Tool hängt', () => {
    const { notes, capabilityNote } = buildArtifactNotes(makeState(), {
      artifactToolMounted: false,
    });
    expect(notes).toBe('');
    expect(capabilityNote).toBe('');
  });

  it('meldet auch ein früheres Sharepic nicht — Zeitform ist die ganze Aussage', () => {
    const { notes } = buildArtifactNotes(
      makeState({ lastToolContext: { kind: 'sharepic', ref: 'c-1', label: 'Sharepic' } as never }),
      { artifactToolMounted: false }
    );
    expect(notes).toBe('');
  });

  /**
   * Der Ausgeschaltet-Hinweis hängt an der Liste der `edit_current_*`-Schalter,
   * und die stand dreimal von Hand da: hier (NEGIERT), in `decideTurnPlan` und
   * in `isEditorSurface`. Als `canvas` nur in zwei davon nachgetragen wurde,
   * behauptete dieser Hinweis auf JEDEM Studio-Turn, die Bearbeitung sei aus —
   * eine Notiz weiter oben kündigte im selben Prompt die Änderung an. Seitdem
   * beantwortet `isEditToolEnabled` die Frage einmal.
   */
  describe('KI-Bearbeitung ausgeschaltet', () => {
    const AUS = 'Die KI-Bearbeitung ist ausgeschaltet';

    it('schweigt auf einer Sharepic-Fläche mit eingeschaltetem Schalter', () => {
      const { notes } = buildArtifactNotes(
        makeState({
          agentConfig: { identifier: 'gruenerator-sharepic-editor' } as never,
          enabledTools: { edit_current_canvas: true },
        }),
        { artifactToolMounted: true }
      );
      expect(notes).not.toContain(AUS);
    });

    it('meldet sich auf einer Sharepic-Fläche mit ausgeschaltetem Schalter', () => {
      const { notes } = buildArtifactNotes(
        makeState({
          agentConfig: { identifier: 'gruenerator-sharepic-editor' } as never,
          enabledTools: { edit_current_canvas: false },
        }),
        { artifactToolMounted: false }
      );
      expect(notes).toContain(AUS);
    });

    it('gilt unverändert für Dokument- und Board-Flächen', () => {
      const docOn = buildArtifactNotes(
        makeState({
          agentConfig: { identifier: 'gruenerator-docs-editor' } as never,
          enabledTools: { edit_current_doc: true },
        }),
        { artifactToolMounted: true }
      );
      expect(docOn.notes).not.toContain(AUS);

      const boardOff = buildArtifactNotes(
        makeState({
          agentConfig: { identifier: 'gruenerator-boards-editor' } as never,
          enabledTools: { edit_current_board: false },
        }),
        { artifactToolMounted: false }
      );
      expect(boardOff.notes).toContain(AUS);
    });
  });

  it('verlangt EINEN Absatz statt zweier getrennter Sätze, wenn im selben Turn etwas glückte UND etwas fehlschlug', () => {
    const { capabilityNote } = buildArtifactNotes(
      makeState({ createdBoard: { boardId: 'b-1', title: 'Sprint' } as never }),
      {
        artifactToolMounted: true,
        hasFailures: true,
      }
    );
    expect(capabilityNote).toContain('EINEN zusammenhängenden Absatz');
    expect(capabilityNote).not.toContain('wurde ein Artefakt ERSTELLT: kündige es knapp an');
    expect(capabilityNote).not.toContain('nicht erstellt');
  });

  it('bleibt beim reinen Erfolgs-Wortlaut, wenn nichts fehlgeschlagen ist', () => {
    const { capabilityNote } = buildArtifactNotes(
      makeState({ createdBoard: { boardId: 'b-1', title: 'Sprint' } as never }),
      {
        artifactToolMounted: true,
        hasFailures: false,
      }
    );
    expect(capabilityNote).toContain('wurde ein Artefakt ERSTELLT');
    expect(capabilityNote).not.toContain('zusammenhängenden Absatz');
  });
});
