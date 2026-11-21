import { describe, expect, it, vi } from 'vitest';

vi.mock('../sharedMediaService.js', () => ({ getSharedMediaService: vi.fn() }));

import {
  aspectRatioFor,
  captionTemplateFor,
  clipStartsFor,
  displaySize,
  heightPreferenceFor,
  wordsForEditor,
} from './editorSeed.js';

describe('wordsForEditor', () => {
  const segments = [
    { text: 'Hallo zusammen.', startTime: 0, endTime: 1 },
    { text: 'Wir sind hier', startTime: 2, endTime: 3.5 },
  ];

  it('keeps the provider words while they still say what the segments say', () => {
    const stored = [
      { word: 'Hallo', start: 0, end: 0.4 },
      { word: 'zusammen.', start: 0.5, end: 1 },
      { word: 'Wir', start: 2, end: 2.3 },
      { word: 'sind', start: 2.4, end: 2.9 },
      { word: 'hier', start: 3, end: 3.5 },
    ];
    expect(wordsForEditor(stored, segments)).toBe(stored);
  });

  it('spreads the segment words evenly once the text was edited', () => {
    const stored = [{ word: 'Halo', start: 0, end: 1 }];
    expect(wordsForEditor(stored, segments)).toEqual([
      { word: 'Hallo', start: 0, end: 0.5 },
      { word: 'zusammen.', start: 0.5, end: 1 },
      { word: 'Wir', start: 2, end: 2.5 },
      { word: 'sind', start: 2.5, end: 3 },
      { word: 'hier', start: 3, end: 3.5 },
    ]);
  });

  it('derives words for projects saved before words were stored', () => {
    expect(wordsForEditor(null, segments)).toHaveLength(5);
  });
});

describe('aspectRatioFor / displaySize', () => {
  it('picks the nearest canvas; stored sizes are already rotated', () => {
    expect(aspectRatioFor(displaySize({ width: 1080, height: 1920, rotation: '90' }))).toBe('9:16');
    expect(aspectRatioFor(displaySize({ width: 1920, height: 1080 }))).toBe('16:9');
    expect(aspectRatioFor(displaySize({ width: 1080, height: 1350 }))).toBe('4:5');
    expect(aspectRatioFor(null)).toBe('9:16');
  });
});

describe('captionTemplateFor', () => {
  it('maps every subtitler look to an editor template (DE)', () => {
    expect(captionTemplateFor('shadow')).toBe('schlagschatten');
    expect(captionTemplateFor('clean')).toBe('weiss');
    expect(captionTemplateFor('tanne')).toBe('balken-tanne');
    expect(captionTemplateFor('standard')).toBe('balken-schwarz');
    expect(captionTemplateFor(null)).toBe('schlagschatten');
  });

  it('uses the Gotham templates for Austria', () => {
    expect(captionTemplateFor('shadow', 'de-AT')).toBe('at-schlagschatten');
    expect(captionTemplateFor('clean', 'de-AT')).toBe('at-weiss');
    expect(captionTemplateFor('tanne', 'de-AT')).toBe('at-balken-gruen');
    expect(captionTemplateFor('standard', 'de-AT')).toBe('at-balken-schwarz');
    expect(captionTemplateFor('unknown', 'de-AT')).toBe('at-schlagschatten');
  });
});

describe('heightPreferenceFor', () => {
  it('defaults to tief', () => {
    expect(heightPreferenceFor('standard')).toBe('standard');
    expect(heightPreferenceFor('tief')).toBe('tief');
    expect(heightPreferenceFor(null)).toBe('tief');
  });
});

describe('clipStartsFor', () => {
  it('turns joined part lengths into clip starts', () => {
    expect(clipStartsFor({ parts: [4, 2.5, 3] })).toEqual([0, 4, 6.5]);
    expect(clipStartsFor({})).toEqual([0]);
  });
});
