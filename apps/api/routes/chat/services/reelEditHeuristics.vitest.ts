import { describe, it, expect } from 'vitest';

import { orderMayMeanArtifact, orderText } from './orderText.js';
import {
  isReelEditInstruction,
  hasReelEditVerb,
  hasStrongReelNoun,
  namesReelTarget,
} from './reelEditHeuristics.js';

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

/** Final-Review PR #3922: Befehlsformen mit Wortende, Gruß und Dank am Rand. */
describe('Reel-Weiche: Anfang des Stoffs und Gruß am Rand', () => {
  const rest =
    ' der Untertitler versieht Reels automatisch mit Untertiteln, und die Suche findet jetzt auch ältere Beschlüsse eurer Landesverbände. Schreibt uns!';

  it.each([
    [`Kürzlich hat der Landesvorstand beschlossen:${rest}\n\nrechtschreibung korrigieren`],
    [`Macht mit beim Klimastreik!${rest}\n\nrechtschreibung korrigieren`],
    [`Erklärung der Landesvorsitzenden:${rest}\n\nübersetze das ins Englische`],
  ])('ein Stoff, der wie ein Wort eines Auftrags beginnt, holt kein Reel: %s', (text) => {
    expect(isReelEditInstruction(orderText(text))).toBe(false);
  });

  it('ein Reel-Auftrag zwischen Gruß und Dank greift', () => {
    expect(
      isReelEditInstruction(orderText('Moin\n\nmach den Untertitel im Reel kürzer\n\nDanke dir'))
    ).toBe(true);
  });
});

/**
 * Final-Review PR #3922: im Reel-Modus genügt ein Bearbeitungsverb. Unter
 * eingefügtem Stoff kann das Verb den Stoff meinen — die Stufe verlangt dann
 * `orderMayMeanArtifact(message, namesReelTarget)`.
 */
describe('Reel-Modus: ein Auftrag ohne Reel über eingefügtem Stoff meint den Stoff', () => {
  const claim =
    'Seit Januar fördert der Bund private Wallboxen mit 900 Euro pro Ladepunkt, und inzwischen gibt es in Deutschland über 500.000 öffentliche Ladepunkte. Die Förderung läuft noch bis Ende 2027 und gilt auch für Mieter.';

  it.each([
    [`${claim}\n\nkürzer bitte`],
    [`${claim}\n\nprüf die Fakten darin und korrigiere falsche Angaben`],
    [`${claim}\n\nrechtschreibung korrigieren`],
  ])('greift nicht: %s', (message) => {
    // Das Verb allein hätte die Abkürzung genommen — das war der Ausfall.
    expect(hasReelEditVerb(orderText(message))).toBe(true);
    expect(orderMayMeanArtifact(message, namesReelTarget)).toBe(false);
  });

  it.each([
    [`${claim}\n\nmach die Untertitel kürzer`],
    [`Ersetze den Untertitel durch:\n\n${claim}`],
  ])('ein Auftrag, der das Reel nennt, greift weiter: %s', (message) => {
    expect(hasReelEditVerb(orderText(message))).toBe(true);
    expect(orderMayMeanArtifact(message, namesReelTarget)).toBe(true);
  });

  it.each([['kürzer bitte'], ['korrigier das']])(
    'ohne Stoff bleibt es beim Reel: %s',
    (message) => {
      expect(hasReelEditVerb(orderText(message))).toBe(true);
      expect(orderMayMeanArtifact(message, namesReelTarget)).toBe(true);
    }
  );
});
