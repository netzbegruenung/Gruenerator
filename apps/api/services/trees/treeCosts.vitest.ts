import { describe, expect, it } from 'vitest';

import {
  CHARS_PER_TREE,
  DOCUMENT_MIN_CHARS,
  SPEECH_SECONDS_PER_TREE,
  TREE_COST_DEEP_RESEARCH,
  TREE_COST_DOCUMENT,
  UNITS_PER_TREE,
  formatTrees,
  treeCostForChars,
  treeCostForImage,
  treeCostForSpeechSeconds,
  unitsToTrees,
} from './treeCosts.js';

describe('treeCosts', () => {
  it('prices an image by its cost multiplier', () => {
    expect(treeCostForImage(0.5)).toBe(50);
    expect(treeCostForImage(1)).toBe(100);
    expect(treeCostForImage(2)).toBe(200);
  });

  it('prices generated audio by the second, rounding up', () => {
    expect(treeCostForSpeechSeconds(SPEECH_SECONDS_PER_TREE)).toBe(UNITS_PER_TREE);
    expect(treeCostForSpeechSeconds(1)).toBe(1);
    expect(treeCostForSpeechSeconds(0)).toBe(0);
    expect(treeCostForSpeechSeconds(-5)).toBe(0);
    expect(treeCostForSpeechSeconds(360)).toBe(200);
  });

  it('prices translated characters, rounding up', () => {
    expect(treeCostForChars(CHARS_PER_TREE)).toBe(100);
    expect(treeCostForChars(DOCUMENT_MIN_CHARS)).toBe(250);
    expect(treeCostForChars(1)).toBe(1);
    expect(treeCostForChars(0)).toBe(0);
    expect(treeCostForChars(-100)).toBe(0);
  });

  it('keeps the fixed costs in step with the table', () => {
    expect(TREE_COST_DOCUMENT).toBe(250);
    expect(TREE_COST_DOCUMENT).toBe(treeCostForChars(DOCUMENT_MIN_CHARS));
    expect(TREE_COST_DEEP_RESEARCH).toBe(UNITS_PER_TREE);
  });

  it('converts units to trees and formats them for de-DE', () => {
    expect(unitsToTrees(250)).toBe(2.5);
    expect(unitsToTrees(0)).toBe(0);
    expect(formatTrees(250)).toBe('2,5');
    expect(formatTrees(1000)).toBe('10');
    expect(formatTrees(25)).toBe('0,25');
    expect(formatTrees(100)).toBe('1');
  });
});
