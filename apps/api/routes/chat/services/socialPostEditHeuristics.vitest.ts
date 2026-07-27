import { describe, it, expect } from 'vitest';

import { isSharepicEditInstruction } from './sharepicEditHeuristics.js';
import { isSocialTextEditInstruction } from './socialPostEditHeuristics.js';

/**
 * Disambiguation matrix for the combined social post: which instructions edit
 * the TEXT (this branch, runs first) vs the SHAREPIC (existing branch, runs
 * after). The sharepic EDIT_NOUN_PATTERN contains `text`, so router order +
 * these heuristics are what keep "mach den Text knackiger" off the canvas.
 */
describe('isSocialTextEditInstruction — Sprachversionen', () => {
  it('behandelt die live gescheiterte Übersetzungs-Nachfrage als Edit', () => {
    // Fiel durch verb∧noun UND durch resolveReferentialTopic; landete im
    // Erstell-Pfad und wurde dem Nutzer als Diffamierungs-Ablehnung gemeldet.
    expect(isSocialTextEditInstruction('Jetzt eine Version davon auf Englisch.')).toBe(true);
  });

  it('erkennt weitere Übersetzungsformulierungen', () => {
    expect(isSocialTextEditInstruction('Übersetze das ins Englische')).toBe(true);
    expect(isSocialTextEditInstruction('Bitte auf Türkisch')).toBe(true);
    expect(isSocialTextEditInstruction('Kannst du mir eine english version geben?')).toBe(true);
  });

  it('lässt eine echte Neuerstellung auf Englisch eine Neuerstellung bleiben', () => {
    expect(isSocialTextEditInstruction('Schreib einen neuen Post auf Englisch')).toBe(false);
    expect(
      isSocialTextEditInstruction('Schreib einen Post auf Englisch über bezahlbaren Wohnraum')
    ).toBe(false);
  });
});

describe('isSocialTextEditInstruction', () => {
  it('matches edit verb + text noun', () => {
    expect(isSocialTextEditInstruction('mach den Text knackiger')).toBe(true);
    expect(isSocialTextEditInstruction('ändere die Hashtags')).toBe(true);
    expect(isSocialTextEditInstruction('formulier die Caption um')).toBe(true);
    expect(isSocialTextEditInstruction('kürze den Beitrag')).toBe(true);
    expect(isSocialTextEditInstruction('entferne die Emojis')).toBe(true);
  });

  it('matches pure tone adjustments without a noun', () => {
    expect(isSocialTextEditInstruction('mach es knackiger')).toBe(true);
    expect(isSocialTextEditInstruction('etwas emotionaler bitte')).toBe(true);
    expect(isSocialTextEditInstruction('kürzer')).toBe(true);
    expect(isSocialTextEditInstruction('bitte professioneller')).toBe(true);
  });

  it('never claims sharepic-specific instructions', () => {
    expect(isSocialTextEditInstruction('Zeile 2 kürzer')).toBe(false);
    expect(isSocialTextEditInstruction('mach zeile 2 kürzer')).toBe(false);
    expect(isSocialTextEditInstruction('Balken nach oben')).toBe(false);
    expect(isSocialTextEditInstruction('anderes Hintergrundbild')).toBe(false);
    expect(isSocialTextEditInstruction('mach die Schrift größer')).toBe(false);
    expect(isSocialTextEditInstruction('ändere den Untertext')).toBe(false);
    expect(isSocialTextEditInstruction('den Zusatztext kürzen')).toBe(false);
    expect(isSocialTextEditInstruction('Folie 3 anpassen')).toBe(false);
    expect(isSocialTextEditInstruction('mach das Sharepic heller')).toBe(false);
  });

  it('never claims new-post creation requests', () => {
    expect(isSocialTextEditInstruction('schreib einen neuen Post zur Energiewende')).toBe(false);
    expect(isSocialTextEditInstruction('mach noch einen Tweet dazu')).toBe(false);
    expect(isSocialTextEditInstruction('schreib einen Post zur Verkehrswende')).toBe(false);
  });

  it('never claims a creation whose topic sits in a relative clause', () => {
    // The live failure: verb ("schreib") ∧ noun ("…-Post") matched, so this
    // defamation request was routed into the EDIT branch and overwrote an
    // unrelated Klimaschutz post that already sat in the thread. The topic
    // arrives as "Post, der …", which "Post zu …" never caught.
    expect(
      isSocialTextEditInstruction(
        'Schreib einen empörten Social-Media-Post, der behauptet, dass Friedrich Merz persönlich Steuergelder veruntreut hat.'
      )
    ).toBe(false);
    expect(
      isSocialTextEditInstruction('Mach mir einen Beitrag, der die Verkehrswende erklärt')
    ).toBe(false);
    expect(isSocialTextEditInstruction('schreib eine Caption, die neugierig macht')).toBe(false);
  });

  it('the indefinite-article guard does not swallow definite-article edits', () => {
    // "einen Post" creates, "den Post" edits — the whole discriminator.
    expect(isSocialTextEditInstruction('Kürze den Post auf zwei Sätze')).toBe(true);
    expect(isSocialTextEditInstruction('mach den Beitrag sachlicher')).toBe(true);
    // An indefinite article far from the noun belongs to its own phrase.
    expect(isSocialTextEditInstruction('Kürze den Post, damit er ein Zitat enthält')).toBe(true);
    // "keinen"/"meinen" end in "ein…" but are not indefinite articles.
    expect(isSocialTextEditInstruction('mach meinen Post knackiger')).toBe(true);
  });

  it('ignores unrelated messages', () => {
    expect(isSocialTextEditInstruction('was ist die Position der Grünen zu Tempo 30?')).toBe(false);
    expect(isSocialTextEditInstruction('danke!')).toBe(false);
  });

  it('sharepic instructions still route to the sharepic heuristic (fall-through)', () => {
    for (const instruction of ['Zeile 2 kürzer', 'Balken nach oben', 'anderes Hintergrundbild']) {
      expect(isSocialTextEditInstruction(instruction)).toBe(false);
      expect(isSharepicEditInstruction(instruction)).toBe(true);
    }
  });

  it('documents the overlap: "mach den Text knackiger" would match BOTH — router order decides', () => {
    // The sharepic heuristic also matches (its noun pattern contains `text`);
    // the router runs the text-edit branch first, so the text wins unless
    // Sharepic-Modus (currentSharepic) is explicitly active.
    expect(isSharepicEditInstruction('mach den text knackiger')).toBe(true);
    expect(isSocialTextEditInstruction('mach den Text knackiger')).toBe(true);
  });

  it('never claims a request to SEE the text verbatim', () => {
    // The ghost-answer class: these matched verb∧noun and were answered with
    // "Ich habe den Text angepasst." while no content ever reached the chat.
    expect(isSocialTextEditInstruction('Gib mir den Text mit HTML-Tags wörtlich aus')).toBe(false);
    expect(isSocialTextEditInstruction('Schreib mir den Text mit <b>-Tags aus')).toBe(false);
    expect(isSocialTextEditInstruction('Zeig mir den Post als Markdown')).toBe(false);
    expect(isSocialTextEditInstruction('Gib den Beitrag unverändert aus')).toBe(false);
  });

  it('still claims genuine edit instructions', () => {
    // Guard against the output check over-reaching.
    expect(isSocialTextEditInstruction('Mach den Text knackiger')).toBe(true);
    expect(isSocialTextEditInstruction('Kürze den Post auf zwei Sätze')).toBe(true);
    expect(isSocialTextEditInstruction('Ergänze zwei Hashtags')).toBe(true);
  });
});
