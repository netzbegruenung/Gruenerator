import { describe, it, expect } from 'vitest';

import { isSharepicEditInstruction } from './sharepicEditHeuristics.js';
import { isSocialTextEditInstruction } from './socialPostEditHeuristics.js';

/**
 * Disambiguation matrix for the combined social post: which instructions edit
 * the TEXT (this branch, runs first) vs the SHAREPIC (existing branch, runs
 * after). The sharepic EDIT_NOUN_PATTERN contains `text`, so router order +
 * these heuristics are what keep "mach den Text knackiger" off the canvas.
 */
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
});
