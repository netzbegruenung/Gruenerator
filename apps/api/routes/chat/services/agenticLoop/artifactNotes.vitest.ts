import { describe, it, expect } from 'vitest';

import {
  buildArtifactNotes,
  buildPreLoopEditNotes,
  editOutcomeAfterPreamble,
  editOutcomeTail,
} from './artifactNotes.js';

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
    currentDocument: null,
    currentBoard: null,
    currentCanvas: null,
    editToolSurface: null,
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

  it('sagt ehrlich, dass die Sharepic-Bearbeitung NICHTS geändert hat', () => {
    const { notes } = buildArtifactNotes(
      makeState({
        editToolSurface: 'canvas',
        editorEditUnchanged:
          'Es wurde NICHTS geändert: Es gibt keine Quellenangabe. Sag das der Person ehrlich und schlag vor, was stattdessen geht.',
      }),
      { artifactToolMounted: true }
    );
    expect(notes).toContain('Es wurde NICHTS geändert: Es gibt keine Quellenangabe.');
    expect(notes).not.toContain('Folien werden gerade aktualisiert');
  });

  it('meldet eine Sharepic-Überarbeitung als geschehen, mit dem Vorschlag im Editor', () => {
    const { notes } = buildArtifactNotes(
      makeState({
        editToolSurface: 'canvas',
        currentCanvas: { id: 'c-1', sharepic: { focusSlide: 0, selection: [] } } as never,
        editorEditsSummary: 'Sharepic überarbeitet (Hintergrund in Sand)',
      }),
      { artifactToolMounted: true }
    );
    expect(notes).toContain('Sharepic überarbeitet (Hintergrund in Sand)');
    expect(notes).toContain('VERGANGENHEIT');
    expect(notes).toContain('behalten oder verwerfen');
    expect(notes).not.toContain('werden gerade aktualisiert');
    expect(notes).not.toContain('GEGENWART');
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

  /**
   * Der Turn, den `decideEditToolLoop` ablehnt, obwohl die Fläche und das Ziel
   * da sind (Bildanhang, gewähltes Notebook, Zweit-Intent, erzwungenes
   * Werkzeug, Verbund-Turn). Für eine Werkzeug-Fläche bleibt dann GAR kein
   * Bearbeitungsweg — und ohne diesen Hinweis erfährt das Modell nur, dass es
   * in einem Editor sitzt, und antwortet, als hätte es bearbeitet.
   */
  describe('kein Bearbeitungsweg in diesem Zug', () => {
    const KEIN_WEG = 'nicht direkt bearbeitet werden';
    const AUS = 'Die KI-Bearbeitung ist ausgeschaltet';

    const docTurn = (overrides: Partial<ChatGraphState> = {}) =>
      makeState({
        agentConfig: { identifier: 'gruenerator-docs-editor' } as never,
        enabledTools: { edit_current_doc: true },
        currentDocument: { id: 'doc-1' } as never,
        editToolSurface: null,
        ...overrides,
      });

    const canvasTurn = (overrides: Partial<ChatGraphState> = {}) =>
      makeState({
        agentConfig: { identifier: 'gruenerator-sharepic-editor' } as never,
        enabledTools: { edit_current_canvas: true },
        currentCanvas: { id: 'canvas-1' } as never,
        editToolSurface: null,
        ...overrides,
      });

    it('meldet sich, wenn Fläche und Sharepic da sind, das Werkzeug aber nicht montiert wurde', () => {
      const { notes } = buildArtifactNotes(canvasTurn(), { artifactToolMounted: false });
      expect(notes).toContain(KEIN_WEG);
      expect(notes).toContain('das geöffnete Sharepic');
    });

    it('schweigt, sobald das Werkzeug montiert ist', () => {
      const { notes } = buildArtifactNotes(canvasTurn({ editToolSurface: 'canvas' }), {
        artifactToolMounted: true,
      });
      expect(notes).not.toContain(KEIN_WEG);
    });

    it('schweigt ohne offenes Ziel — dann gibt es nichts zu bearbeiten', () => {
      const { notes } = buildArtifactNotes(canvasTurn({ currentCanvas: null }), {
        artifactToolMounted: false,
      });
      expect(notes).not.toContain(KEIN_WEG);
    });

    it('überlässt dem Ausgeschaltet-Hinweis den Vortritt — nie beide', () => {
      const { notes } = buildArtifactNotes(
        canvasTurn({ enabledTools: { edit_current_canvas: false } }),
        { artifactToolMounted: false }
      );
      expect(notes).toContain(AUS);
      expect(notes).not.toContain(KEIN_WEG);
    });

    it('dekliniert nach der Fläche — und nimmt die Dokument-Fläche seit #3428 mit', () => {
      const sheet = buildArtifactNotes(
        makeState({
          agentConfig: { identifier: 'gruenerator-sheets-editor' } as never,
          enabledTools: { edit_current_doc: true },
          currentDocument: { id: 'sheet-1' } as never,
          editToolSurface: null,
        }),
        { artifactToolMounted: false }
      );
      expect(sheet.notes).toContain('die geöffnete Tabelle');

      // Der Dispatch-Weg (trigger_doc_edit) liegt jetzt IM Werkzeug — fehlt es,
      // gibt es auf der Dokument-Fläche keinen Bearbeitungsweg mehr.
      const doc = buildArtifactNotes(docTurn(), { artifactToolMounted: false });
      expect(doc.notes).toContain(KEIN_WEG);
      expect(doc.notes).toContain('das geöffnete Dokument');
    });

    it('widerspricht sich auf einem Verbund-Turn ohne Werkzeug nicht selbst', () => {
      // `compoundEdit` und `editToolLoop` fallen getrennt (ein Zweit-Intent
      // nimmt nur das zweite). Ohne Werkzeug fügt seit #3428 NICHTS mehr ein —
      // die „wird gerade eingefügt"-Notiz darf dann nicht danebenstehen.
      const { notes } = buildArtifactNotes(docTurn({ compoundEdit: true }), {
        artifactToolMounted: false,
      });
      expect(notes).toContain(KEIN_WEG);
      expect(notes).not.toContain('werden gerade in das GEÖFFNETE Dokument eingefügt');
    });

    it('lässt die Einfüge-Notiz stehen, sobald das Werkzeug montiert ist', () => {
      const { notes } = buildArtifactNotes(
        docTurn({ compoundEdit: true, editToolSurface: 'doc' }),
        { artifactToolMounted: true }
      );
      expect(notes).not.toContain(KEIN_WEG);
      expect(notes).toContain('werden gerade in das GEÖFFNETE Dokument eingefügt');
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

/**
 * Der Unified-Pfad hat keinen Synth-Prompt. Was er vor dem Loop wissen kann
 * (Schalter, Bearbeitungsweg), bekommt er über diesen einen Bauer — derselbe,
 * den auch `buildArtifactNotes` für die beiden Notizen benutzt, damit Split und
 * Unified nie verschiedene Sätze sagen (#3439).
 */
describe('buildPreLoopEditNotes', () => {
  it('liefert die Ausgeschaltet-Notiz mit dem Substantiv der Fläche', () => {
    const state = makeState({
      agentConfig: { identifier: 'gruenerator-sharepic-editor' } as never,
      enabledTools: { edit_current_canvas: false },
    });
    const note = buildPreLoopEditNotes(state);
    expect(note).toContain('Die KI-Bearbeitung ist ausgeschaltet');
    expect(note).toContain('das geöffnete Sharepic');
    expect(buildArtifactNotes(state, { artifactToolMounted: false }).notes).toContain(note.trim());
  });

  it('liefert die Kein-Weg-Notiz, wenn das Werkzeug trotz Schalter fehlt', () => {
    const state = makeState({
      agentConfig: { identifier: 'gruenerator-sharepic-editor' } as never,
      enabledTools: { edit_current_canvas: true },
      currentCanvas: { id: 'c1' } as never,
      editToolSurface: null,
    });
    const note = buildPreLoopEditNotes(state);
    expect(note).toContain('kann das geöffnete Sharepic nicht direkt bearbeitet werden');
    expect(buildArtifactNotes(state, { artifactToolMounted: false }).notes).toContain(note.trim());
  });

  it('schweigt, wenn edit_document montiert ist oder keine Fläche offen ist', () => {
    expect(
      buildPreLoopEditNotes(
        makeState({
          agentConfig: { identifier: 'gruenerator-sharepic-editor' } as never,
          enabledTools: { edit_current_canvas: true },
          currentCanvas: { id: 'c1' } as never,
          editToolSurface: 'canvas',
        })
      )
    ).toBe('');
    expect(buildPreLoopEditNotes(makeState())).toBe('');
  });
});

describe('editOutcomeTail', () => {
  const canvas = (o: Partial<ChatGraphState>) =>
    makeState({
      editToolSurface: 'canvas',
      currentCanvas: { id: 'c-1', sharepic: { focusSlide: 0, selection: [] } } as never,
      ...o,
    });

  it('sagt nach einer Vorrede ehrlich, dass nichts geändert wurde, und warum', () => {
    const tail = editOutcomeTail(
      canvas({
        editorEditUnchanged: 'Es wurde NICHTS geändert: …',
        editorEditUnchangedReason: 'Die Überschrift hat in dieser Form nur eine Größe.',
      })
    );
    expect(tail).toBe(
      'Geändert hat sich dabei allerdings nichts: Die Überschrift hat in dieser Form nur eine Größe.'
    );
  });

  it('nennt eine angewendete Änderung als geschehen, mit dem Vorschlag im Editor', () => {
    const tail = editOutcomeTail(canvas({ editorEditsSummary: 'Sharepic überarbeitet (x)' }));
    expect(tail).toContain('behalten oder verwerfen');
  });

  it('schweigt ohne Bearbeitung und auf anderen Flächen', () => {
    expect(editOutcomeTail(canvas({}))).toBeNull();
    expect(
      editOutcomeTail(makeState({ editToolSurface: 'sheet', editorEditsSummary: '1 Änderung' }))
    ).toBeNull();
  });
});

describe('editOutcomeAfterPreamble', () => {
  const unchanged = makeState({
    editToolSurface: 'canvas',
    currentCanvas: { id: 'c-1', sharepic: { focusSlide: 0, selection: [] } } as never,
    editorEditUnchanged: 'Es wurde NICHTS geändert: …',
    editorEditUnchangedReason: 'Es gibt keine Quellenangabe.',
  });
  const PRE = 'Ich entferne die Quellenangabe.';
  const step = (textOffset?: number) =>
    ({
      toolCallId: 't1',
      toolName: 'edit_current_sharepic',
      args: {},
      result: {},
      ...(textOffset !== undefined && { textOffset }),
    }) as never;

  it('hängt den Ausgang an, wenn nach dem Aufruf nichts mehr geschrieben wurde', () => {
    expect(editOutcomeAfterPreamble(unchanged, [step(PRE.length)], PRE)).toContain(
      'Geändert hat sich dabei allerdings nichts'
    );
    // The guarantee forced the edit after the stream: no offset recorded.
    expect(editOutcomeAfterPreamble(unchanged, [step()], PRE)).not.toBeNull();
  });

  it('lässt eine Antwort stehen, die nach dem Ergebnis geschrieben wurde', () => {
    const text = `${PRE} Geändert hat sich nichts, es gibt keine Quelle.`;
    expect(editOutcomeAfterPreamble(unchanged, [step(PRE.length)], text)).toBeNull();
  });

  it('überlässt eine leere Antwort dem Rückfall', () => {
    expect(editOutcomeAfterPreamble(unchanged, [step(0)], '')).toBeNull();
  });
});
