import { describe, it, expect } from 'vitest';

import {
  isQuestionAboutEditing,
  namesDocumentTarget,
  namesSheetTarget,
  priorTurnEditables,
  verbNearNoun,
} from './editAddressee.js';

describe('priorTurnEditables', () => {
  it('zählt ein neues Sharepic und eine Bearbeitung', () => {
    expect(priorTurnEditables([{ kind: 'sharepic' }], [])).toEqual(['sharepic']);
    // Die zweite Korrektur in Folge: der Turn davor speicherte nur `sharepic_edit`.
    expect(priorTurnEditables([], [{ toolName: 'sharepic_edit' }])).toEqual(['sharepic']);
  });

  it('kennt ein Bild aus den Artefakten', () => {
    expect(priorTurnEditables([{ kind: 'image' }], [])).toEqual(['image']);
  });

  it('kennt Post und Reel aus ihren Schritten', () => {
    expect(
      priorTurnEditables([], [{ toolName: 'social_post', result: { postId: 'p1', text: 'Hallo' } }])
    ).toEqual(['social_post']);
    expect(priorTurnEditables([], [{ toolName: 'social_post_edit' }])).toEqual(['social_post']);
    expect(priorTurnEditables([], [{ toolName: 'reel_edit' }])).toEqual(['reel']);
    expect(priorTurnEditables([], [{ toolName: 'reel_processing' }])).toEqual(['reel']);
  });

  // Claude-Review #3940: ein abgelehntes Sharepic speichert `{ variants: [] }`
  // und machte den nächsten Turn zum Adressaten des alten Sharepics.
  it('zählt keinen gescheiterten Schritt', () => {
    expect(priorTurnEditables([], [{ toolName: 'sharepic', result: { variants: [] } }])).toEqual(
      []
    );
    expect(priorTurnEditables([], [{ toolName: 'social_post', result: { error: 'x' } }])).toEqual(
      []
    );
    expect(priorTurnEditables([], [{ toolName: 'sharepic_edit', result: {}, ok: false }])).toEqual(
      []
    );
    expect(
      priorTurnEditables([], [{ toolName: 'sharepic', result: { variants: [{ id: 'v1' }] } }])
    ).toEqual(['sharepic']);
  });

  it('kennt Dokument und Tabelle aus Artefakt, Schritt und Intent (#3941)', () => {
    expect(priorTurnEditables([{ kind: 'document' }], [])).toEqual(['document']);
    expect(priorTurnEditables([{ kind: 'sheet' }], [])).toEqual(['sheet']);
    expect(priorTurnEditables([], [{ toolName: 'create_document' }])).toEqual(['document']);
    expect(priorTurnEditables([], [{ toolName: 'create_sheet' }])).toEqual(['sheet']);
    // Die Bearbeitungen speichern keinen Schritt, nur ihren Intent.
    expect(priorTurnEditables([], [], 'modify_doc')).toEqual(['document']);
    expect(priorTurnEditables([], [], 'edit_sheet')).toEqual(['sheet']);
  });

  it('zählt keinen anderen Turn', () => {
    expect(priorTurnEditables([], [])).toEqual([]);
    expect(priorTurnEditables([{ kind: 'presentation' }], [{ toolName: 'web_search' }])).toEqual(
      []
    );
    expect(priorTurnEditables([], [], 'direct')).toEqual([]);
  });
});

describe('namesDocumentTarget / namesSheetTarget', () => {
  it.each(['kürz das Dokument', 'den Text im Dokument straffen', 'Überarbeite dieses Dokument'])(
    'nennt das Dokument: %s',
    (text) => {
      expect(namesDocumentTarget(text, null)).toBe(true);
    }
  );

  it.each([
    'Verbesser meine Formulierung: Wir fordern mehr Radwege.',
    'Erstelle ein Dokument',
    'Verbessere die Dokumentation',
  ])('nennt kein Dokument: %s', (text) => {
    expect(namesDocumentTarget(text, null)).toBe(false);
  });

  it('der Titel zählt als Name', () => {
    expect(namesDocumentTarget('kürz den Antrag Radverkehr', 'Antrag Radverkehr')).toBe(true);
    expect(
      namesDocumentTarget(
        'Kürze in dem Antrag von vorhin die Begründung auf die Hälfte',
        'Antrag für einen autofreien Sonntag'
      )
    ).toBe(true);
    expect(namesDocumentTarget('Verbesser meinen Absatz zum Radverkehr', 'Antrag Radverkehr')).toBe(
      false
    );
  });

  it.each(['die Tabelle', 'füg in der Tabelle eine Zeile ein', 'in meiner Tabelle'])(
    'nennt die Tabelle: %s',
    (text) => {
      expect(namesSheetTarget(text, null)).toBe(true);
    }
  );

  it.each(['füg eine Tabelle ein', 'Entfern bitte die Füllwörter aus meinem Absatz'])(
    'nennt keine Tabelle: %s',
    (text) => {
      expect(namesSheetTarget(text, null)).toBe(false);
    }
  );
});

describe('verbNearNoun', () => {
  const verb = /(?<!\p{L})(mach|kürz)/iu;
  const noun = /(?<!\p{L})(text|zeile\s*\d?)/iu;

  it('beide Wortstellungen, dicht beieinander', () => {
    expect(verbNearNoun('mach den Text kürzer', verb, noun)).toBe(true);
    expect(verbNearNoun('Zeile 2 kürzer', verb, noun)).toBe(true);
  });

  it('nicht über eine Satzgrenze und nicht über das Fenster hinaus', () => {
    expect(verbNearNoun('Mach weiter. Den Text lese ich später.', verb, noun)).toBe(false);
    expect(
      verbNearNoun('mach bitte zuerst alles andere fertig und danach den Text', verb, noun)
    ).toBe(false);
  });

  it('`accept` kann ein Paar ablehnen', () => {
    expect(verbNearNoun('mach den Text', verb, noun, { accept: () => false })).toBe(false);
  });
});

describe('isQuestionAboutEditing', () => {
  it.each(['Wie mache ich gute Reels?', 'Was sind gute Untertitel für Instagram?'])(
    'Frage darüber: %s',
    (text) => {
      expect(isQuestionAboutEditing(text)).toBe(true);
    }
  );

  it.each([
    'Kannst du die Überschrift kürzen?',
    'Wie wäre es mit einem anderen Bild?',
    'wie mache ich das',
  ])('Auftrag oder Vorschlag: %s', (text) => {
    expect(isQuestionAboutEditing(text)).toBe(false);
  });
});
