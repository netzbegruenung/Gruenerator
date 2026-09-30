import { describe, it, expect } from 'vitest';

import { isQuestionAboutEditing, priorTurnEditables, verbNearNoun } from './editAddressee.js';

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
    expect(priorTurnEditables([], [{ toolName: 'social_post' }])).toEqual(['social_post']);
    expect(priorTurnEditables([], [{ toolName: 'social_post_edit' }])).toEqual(['social_post']);
    expect(priorTurnEditables([], [{ toolName: 'reel_edit' }])).toEqual(['reel']);
    expect(priorTurnEditables([], [{ toolName: 'reel_processing' }])).toEqual(['reel']);
  });

  it('zählt keinen anderen Turn', () => {
    expect(priorTurnEditables([], [])).toEqual([]);
    expect(priorTurnEditables([{ kind: 'document' }], [{ toolName: 'web_search' }])).toEqual([]);
  });
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
