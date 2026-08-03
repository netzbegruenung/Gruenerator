import { describe, it, expect } from 'vitest';

import {
  asksForNewArtifact,
  isSharepicEditInstruction,
  isVerificationQuestion,
  hasSharepicEditVerb,
  isShortAffirmation,
} from './sharepicEditHeuristics.js';

/**
 * A question about the CONTENT is not an instruction to change it. Live, a user
 * questioning a fact got "Welche Variante soll ich bearbeiten?" and the turn
 * ended there.
 *
 * The hard part is that a bare "?" test would be wrong: half of all polite edit
 * requests are questions in form ("Kannst du die Überschrift kürzen?"). What
 * separates them is the verification vocabulary, not the punctuation — these
 * tests pin both directions.
 */
describe('isVerificationQuestion', () => {
  it('catches questions that challenge the content', () => {
    expect(isVerificationQuestion('bist du sicher, dass der Name stimmt?')).toBe(true);
    expect(isVerificationQuestion('Ist das sachlich korrekt?')).toBe(true);
    expect(isVerificationQuestion('Stimmt das wirklich?')).toBe(true);
    expect(isVerificationQuestion('Welche Quelle hast du dafür?')).toBe(true);
    expect(isVerificationQuestion('Hast du dir das Zitat ausgedacht?')).toBe(true);
    expect(isVerificationQuestion('Woher hast du die Zahl?')).toBe(true);
  });

  it('leaves polite edit requests alone — they are questions in form only', () => {
    expect(isVerificationQuestion('Kannst du die Überschrift kürzen?')).toBe(false);
    expect(isVerificationQuestion('Magst du das Bild austauschen?')).toBe(false);
    expect(isVerificationQuestion('Machst du Zeile 2 kürzer?')).toBe(false);
  });

  it('needs BOTH the vocabulary and a question mark', () => {
    // A correction that carries an instruction must keep working.
    expect(isVerificationQuestion('das stimmt so nicht, kürz es')).toBe(false);
    expect(isVerificationQuestion('Kürzer bitte')).toBe(false);
  });

  it('closes every door into the edit branch, not just one', () => {
    // These carry a real edit VERB and NOUN, so without the guard both
    // predicates fire and a question about what the assistant did becomes an
    // order to do more of it. The refinement door is covered in
    // sharepicRefinement.vitest.ts — a fix that shuts one of two doors is the
    // bug this suite already knows about.
    expect(isSharepicEditInstruction('Hast du den Text wirklich geändert?')).toBe(false);
    expect(hasSharepicEditVerb('Stimmt das, oder hast du das geändert?')).toBe(false);
    // …while the same words as an instruction stay an instruction.
    expect(isSharepicEditInstruction('Ändere den Text')).toBe(true);
    expect(hasSharepicEditVerb('ändere das')).toBe(true);
  });
});

describe('asksForNewArtifact', () => {
  it('erkennt die live gescheiterte Multi-Intent-Anfrage als Erstellung', () => {
    // Erzeugte KEINEN Inhalt: "Kürze" allein reichte dem Refinement-Muster,
    // der Turn landete im Sharepic-Edit-Zweig und fragte "Welche Variante
    // soll ich bearbeiten?" für Artefakte ohne Bezug zur Anfrage.
    const prompt =
      'Schreib einen Instagram-Post UND eine Pressemitteilung zum Thema Windkraft. Kürze danach nur die Pressemitteilung.';
    expect(asksForNewArtifact(prompt)).toBe(true);
    expect(isSharepicEditInstruction(prompt)).toBe(false);
  });

  it('erkennt weitere Dokument-Artefakte', () => {
    expect(asksForNewArtifact('Mach mir eine Rede zum Thema Verkehr')).toBe(true);
    expect(asksForNewArtifact('Erstell eine Präsentation dazu')).toBe(true);
    expect(asksForNewArtifact('Schreib einen Beitrag über Wohnraum')).toBe(true);
  });

  it('lässt Sharepic-interne Felder editierbar', () => {
    // Der bestimmte Artikel und die Layout-Felder duerfen NICHT als
    // Neuerstellung gelten, sonst waere der Edit-Zweig tot.
    expect(asksForNewArtifact('Mach ein anderes Bild rein')).toBe(false);
    expect(asksForNewArtifact('Kürze Zeile 2')).toBe(false);
    expect(asksForNewArtifact('Kürze den Post')).toBe(false);
    expect(isSharepicEditInstruction('ändere die farbe')).toBe(true);
  });
});

describe('isSharepicEditInstruction', () => {
  it('matches umlaut-initial verbs (the \\b bug: "ändere"/"änderungen" never matched)', () => {
    expect(isSharepicEditInstruction('ändere die farbe')).toBe(true);
    expect(isSharepicEditInstruction('der text ergibt keinen sinn, schlage änderungen vor')).toBe(
      true
    );
  });

  it('matches umlaut-initial nouns ("überschrift")', () => {
    expect(isSharepicEditInstruction('die überschrift anpassen')).toBe(true);
  });

  it('treats "sharepic" itself as an editable noun', () => {
    expect(isSharepicEditInstruction('setze ein in das sharepic')).toBe(true);
    expect(isSharepicEditInstruction('mach das in die variante rein')).toBe(true);
  });

  it('still matches the ASCII cases', () => {
    expect(isSharepicEditInstruction('mach zeile 2 kürzer')).toBe(true);
    expect(isSharepicEditInstruction('balken nach oben verschieben')).toBe(true);
  });

  it('never fires on fresh-variant requests', () => {
    expect(isSharepicEditInstruction('mach mir ein neues sharepic')).toBe(false);
    expect(isSharepicEditInstruction('zeig mir alle varianten')).toBe(false);
  });

  it('requires an edit verb', () => {
    expect(isSharepicEditInstruction('was steht im wahlprogramm zum klimaschutz?')).toBe(false);
  });

  it('matches slider-deck nouns (slide/folie/seite/karussell)', () => {
    expect(isSharepicEditInstruction('mach die headline auf folie 2 kürzer')).toBe(true);
    expect(isSharepicEditInstruction('ändere den text auf slide 3')).toBe(true);
    expect(isSharepicEditInstruction('entferne seite 3')).toBe(true);
    expect(isSharepicEditInstruction('mach das karussell dunkler')).toBe(true);
    expect(isSharepicEditInstruction('ändere das cover')).toBe(true);
  });

  it('never fires on fresh-deck requests', () => {
    expect(isSharepicEditInstruction('mach mir ein neues karussell')).toBe(false);
    expect(isSharepicEditInstruction('erstelle einen neuen slider über klimaschutz')).toBe(false);
  });
});

describe('hasSharepicEditVerb (relaxed Sharepic-Modus check)', () => {
  it('fires on verb-only instructions that lack a noun', () => {
    expect(hasSharepicEditVerb('setz das bitte um')).toBe(true);
    expect(hasSharepicEditVerb('ändere das entsprechend')).toBe(true);
  });

  it('stays quiet on plain questions and fresh-variant requests', () => {
    expect(hasSharepicEditVerb('was bedeutet das?')).toBe(false);
    expect(hasSharepicEditVerb('drei varianten bitte')).toBe(false);
  });
});

describe('isShortAffirmation', () => {
  it('matches confirmations of a proposed edit', () => {
    expect(isShortAffirmation('yes')).toBe(true);
    expect(isShortAffirmation('ja')).toBe(true);
    expect(isShortAffirmation('Ja, mach das so!')).toBe(true);
    expect(isShortAffirmation('ok, so umsetzen')).toBe(true);
    expect(isShortAffirmation('passt')).toBe(true);
  });

  it('rejects questions, content and long messages', () => {
    expect(isShortAffirmation('ja aber was bedeutet das für die farbe?')).toBe(false);
    expect(isShortAffirmation('was steht im wahlprogramm?')).toBe(false);
    expect(
      isShortAffirmation('ja ich finde wir sollten dann auch noch über den hintergrund sprechen')
    ).toBe(false);
  });
});
