import { describe, it, expect } from 'vitest';

import { orderText } from './orderText.js';
import { isReelEditInstruction, hasReelEditVerb, hasStrongReelNoun } from './reelEditHeuristics.js';

describe('isReelEditInstruction', () => {
  it('matches umlaut-initial verbs (\\b fails on "ändere")', () => {
    expect(isReelEditInstruction('ändere die untertitel')).toBe(true);
    expect(isReelEditInstruction('die Untertitel kürzen bitte')).toBe(true);
  });

  it('matches the primary phrasings', () => {
    expect(isReelEditInstruction('Untertitel meines Reels anpassen')).toBe(true);
    expect(isReelEditInstruction('Korrigiere die Tippfehler in den Untertiteln')).toBe(true);
    expect(isReelEditInstruction('formuliere segment 3 um')).toBe(true);
    expect(isReelEditInstruction('mach die captions kürzer')).toBe(true);
  });

  it('requires both an edit verb and a reel noun', () => {
    expect(isReelEditInstruction('untertitel')).toBe(false);
    expect(isReelEditInstruction('mach das kürzer')).toBe(false);
    expect(isReelEditInstruction('was ist ein reel?')).toBe(false);
  });

  it('never treats "create a new reel/video" as an edit', () => {
    expect(isReelEditInstruction('erstelle ein neues Reel')).toBe(false);
    expect(isReelEditInstruction('mach ein neues video')).toBe(false);
  });

  it('does not fire on sharepic phrasings', () => {
    expect(isReelEditInstruction('mach zeile 2 kürzer')).toBe(false);
    expect(isReelEditInstruction('anderes hintergrundbild für das sharepic')).toBe(false);
  });

  it('lets content-creation requests about the reel fall through', () => {
    expect(isReelEditInstruction('schreib mir einen instagram post zu dem reel')).toBe(false);
    expect(isReelEditInstruction('mach einen beitrag aus den untertiteln')).toBe(false);
    expect(isReelEditInstruction('fasse das video zusammen')).toBe(false);
  });
});

describe('hasStrongReelNoun', () => {
  it('distinguishes reel-only nouns from generic ones', () => {
    expect(hasStrongReelNoun('untertitel anpassen')).toBe(true);
    expect(hasStrongReelNoun('mein reel bearbeiten')).toBe(true);
    expect(hasStrongReelNoun('segment 2 kürzen')).toBe(false);
    expect(hasStrongReelNoun('den video text ändern')).toBe(false);
  });
});

describe('hasReelEditVerb', () => {
  it('matches a lone edit verb (active Reel-Modus follow-ups)', () => {
    expect(hasReelEditVerb('mach das kürzer')).toBe(true);
    expect(hasReelEditVerb('korrigier das bitte')).toBe(true);
  });

  it('still rejects new-reel requests', () => {
    expect(hasReelEditVerb('erstelle ein neues reel')).toBe(false);
  });

  it('rejects content-creation requests even in Reel-Modus ("schreib" overlap)', () => {
    expect(hasReelEditVerb('schreib mir einen insta-post dazu')).toBe(false);
    expect(hasReelEditVerb('mach daraus einen linkedin beitrag')).toBe(false);
    expect(hasReelEditVerb('schreib eine pressemitteilung dazu')).toBe(false);
  });

  it('rejects plain questions', () => {
    expect(hasReelEditVerb('wie ist das wetter heute?')).toBe(false);
  });
});

/**
 * Der Stoff entscheidet nicht (#3912, beta 30.09.2026): ein eingefügter
 * Newsletter mit „Reels … Untertiteln" und „Schreibt uns" lieferte beide Hälften
 * von verb∧noun, und „rechtschreibung korrigieren" darunter bekam die
 * Reel-Auswahl. Die Stufe fragt den Auftrag (`orderText`), nicht die Nachricht.
 */
describe('Reel-Weiche liest den Auftrag, nicht den Stoff', () => {
  const newsletter =
    'Neu im Grünerator: der Untertitler versieht Reels automatisch mit Untertiteln, und die Suche findet jetzt auch ältere Beschlüsse eurer Landesverbände. Außerdem gibt es neue Vorlagen für Sharepics. Schreibt uns eure Rückmeldungen, wir freuen uns über jede Idee und jeden Hinweis!';

  it.each([
    [`${newsletter}\n\nrechtschreibung korrigieren`],
    [`${newsletter}\n\nübersetze das ins Englische`],
  ])('eingefügter Text mit Reizwörtern fällt durch: %s', (text) => {
    // Über den ganzen Text greift die Weiche — das war der Ausfall.
    expect(isReelEditInstruction(text)).toBe(true);
    expect(isReelEditInstruction(orderText(text))).toBe(false);
  });

  it('ein echter Reel-Auftrag greift weiter', () => {
    expect(isReelEditInstruction(orderText('mach den Untertitel im Reel kürzer'))).toBe(true);
    expect(
      isReelEditInstruction(
        orderText('Korrigiere die Tippfehler in den Untertiteln:\n\n' + newsletter)
      )
    ).toBe(true);
  });
});
