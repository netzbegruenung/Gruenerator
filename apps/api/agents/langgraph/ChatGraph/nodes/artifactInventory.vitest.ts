import { describe, it, expect } from 'vitest';

import {
  artifactsFromTurn,
  buildArtifactInventory,
  renderArtifactChoices,
  renderArtifactInventory,
} from './artifactInventory.js';

import type { ChatGraphState, ThreadToolContext } from '../types.js';

/**
 * Was das Modell über die Artefakte dieses Gesprächs erfährt.
 *
 * Der Anlass steht in `artifactNotes.vitest.ts`: unter einem sichtbaren Bild
 * schrieb der Loop „Die Bildgenerierung ist leider fehlgeschlagen", und einen
 * Turn später „Da ich bisher kein Bild generiert habe …". Das zweite war die
 * teurere Hälfte — sie galt für JEDES Artefakt, nicht nur für Bilder, weil das
 * Modell prinzipiell nur `parts` liest und Artefakte in `metadata` leben.
 */

function state(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    generatedImage: null,
    imagePrompt: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    ...overrides,
  } as unknown as ChatGraphState;
}

const doc = (id: string, title: string, subtype = 'documents'): ThreadToolContext => ({
  kind: subtype.startsWith('sheet') ? 'sheet' : 'document',
  ref: id,
  label: title,
});

describe('artifactsFromTurn', () => {
  it('führt ref und label mit, die deriveToolContext für Bilder wegwirft', () => {
    // Der persistierte Kontext speichert `{kind:'image'}` blank, weshalb der
    // Bild-Folgeauftrag heute eine zweite DB-Abfrage braucht. Für die Sicht
    // dieses Turns gibt es keinen Grund, dieselbe Armut zu kopieren.
    const out = artifactsFromTurn(
      state({
        generatedImage: { url: 'https://x/y.png', prompt: 'Windrad' } as never,
        imagePrompt: 'Windrad im Sonnenuntergang',
      })
    );
    expect(out).toEqual([
      { kind: 'image', ref: 'https://x/y.png', label: 'Windrad im Sonnenuntergang' },
    ]);
  });

  it('leitet die Dokument-Art aus dem subtype ab', () => {
    const out = artifactsFromTurn(
      state({
        createdDocument: { documentId: 'd1', title: 'Quartalszahlen', subtype: 'sheets' } as never,
      })
    );
    expect(out[0]?.kind).toBe('sheet');
  });

  it('nennt ein Board, obwohl es den nächsten Turn nicht erreicht', () => {
    // Boards persistieren keine Metadaten (BOARD_SPEC), haben also keine
    // Prior-Hälfte. Im laufenden Turn existieren sie trotzdem — und genau dort
    // trat der Fehlschlag-Satz auf.
    const out = artifactsFromTurn(
      state({ createdBoard: { boardId: 'b1', title: 'Kampagne' } as never })
    );
    expect(out).toEqual([{ kind: 'board', ref: 'b1', label: 'Kampagne' }]);
  });

  it('ist leer, wenn der Turn nichts gebaut hat', () => {
    expect(artifactsFromTurn(state())).toEqual([]);
  });
});

describe('buildArtifactInventory', () => {
  it('stellt die Artefakte dieses Turns vor die früheren', () => {
    const entries = buildArtifactInventory({
      prior: [doc('d1', 'Antrag')],
      fresh: [{ kind: 'image', ref: 'u', label: 'Windrad' }],
    });
    expect(entries.map((e) => [e.artifact.kind, e.prior])).toEqual([
      ['image', false],
      ['document', true],
    ]);
  });

  it('zählt ein Artefakt, das dieser Turn angefasst hat, als frisch', () => {
    // Die Zeitform beschreibt den letzten Stand, nicht die Herkunft: ein
    // Dokument, das in diesem Turn bearbeitet wurde, ist nicht „früher".
    const entries = buildArtifactInventory({
      prior: [doc('d1', 'Antrag')],
      fresh: [doc('d1', 'Antrag')],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.prior).toBe(false);
  });

  it('dedupt ein Sharepic über die Art, weil es keine stabile ref führt', () => {
    const entries = buildArtifactInventory({
      prior: [{ kind: 'sharepic', ref: null, label: 'alt' }],
      fresh: [{ kind: 'sharepic', ref: null, label: 'neu' }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.artifact.label).toBe('neu');
  });

  it('lässt Recherche-Spuren draussen — eine Abfrage ist kein Gegenstand', () => {
    const entries = buildArtifactInventory({
      prior: [
        { kind: 'bundestag', ref: null, label: null },
        { kind: 'mcp', ref: 's', label: 'Wetter' },
        { kind: 'notebook', ref: null, label: null },
      ],
    });
    expect(entries).toEqual([]);
  });
});

describe('renderArtifactInventory', () => {
  it('schweigt, wenn das Gespräch nichts gebaut hat', () => {
    expect(renderArtifactInventory([])).toBe('');
  });

  it('trennt die Zeitformen und verbietet die Nichtexistenz-Behauptung', () => {
    const block = renderArtifactInventory(
      buildArtifactInventory({
        prior: [doc('d1', 'Antrag Straßenbäume')],
        fresh: [{ kind: 'image', ref: 'u', label: 'Windrad' }],
      })
    );
    expect(block).toContain('Bild „Windrad" — in diesem Turn erstellt');
    expect(block).toContain('Dokument „Antrag Straßenbäume" — früher in diesem Gespräch erstellt');
    expect(block).toContain('Behaupte NIEMALS');
  });

  it('legt dem Schreiber keinen Marker hin, den er nachplappern kann', () => {
    // Ein Griff nützt nur dem, der ihn zurückgibt — und das ist allein der
    // Auflöser. `[A1]` im Schreiber-Block hätte den ersten Fehler gegen einen
    // zweiten getauscht: `[A1]` mitten in der Nutzerantwort.
    const block = renderArtifactInventory(
      buildArtifactInventory({ fresh: [{ kind: 'image', ref: 'u', label: 'Windrad' }] })
    );
    expect(block).not.toMatch(/\[A?\d+\]/);
  });
});

describe('renderArtifactChoices', () => {
  it('nummeriert in derselben Ordnung, die der Schreiber gelesen hat', () => {
    // Das ist der ganze Zweck der geteilten Funktion: „2." in der Antwort des
    // Auflösers meint denselben Gegenstand, den der Schreiber an zweiter Stelle
    // gesehen hat. Solange beide ihre Liste selbst bauten, war das Zufall.
    const artifacts: ThreadToolContext[] = [
      { kind: 'image', ref: 'u', label: 'Windrad' },
      doc('d1', 'Antrag'),
    ];
    const entries = buildArtifactInventory({ fresh: artifacts });
    expect(renderArtifactChoices(artifacts)).toBe('1. Bild („Windrad")\n2. Dokument („Antrag")');
    expect(entries.map((e) => e.artifact.kind)).toEqual(['image', 'document']);
  });

  it('kommt ohne label aus', () => {
    expect(renderArtifactChoices([{ kind: 'sharepic', ref: null, label: null }])).toBe(
      '1. Sharepic'
    );
  });
});
