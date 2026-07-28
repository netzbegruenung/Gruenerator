import { describe, expect, it } from 'vitest';

import { getSpeakerLabel, parseSpeakerBlocks, transcriptToMarkdown } from './formatTranscript';

// The backend emits one [speaker_N] marker per diarized *segment*, and Voxtral
// segments are often a single clause. Everything here is really one property:
// a marker starts a new block only when the speaker actually changed.
describe('parseSpeakerBlocks', () => {
  it('merges consecutive segments from the same speaker into one block', () => {
    const text =
      '[speaker_0] Guten Abend. [speaker_0] Wir beginnen mit TOP 1. [speaker_0] Bitte sehr.';

    expect(parseSpeakerBlocks(text)).toEqual([
      {
        speaker: 'speaker_0',
        text: 'Guten Abend. Wir beginnen mit TOP 1. Bitte sehr.',
        offset: 11,
      },
    ]);
  });

  it('starts a new block when the speaker changes and again when it changes back', () => {
    const text = '[speaker_0] Frage. [speaker_1] Antwort. [speaker_0] Danke.';

    expect(parseSpeakerBlocks(text).map((b) => [b.speaker, b.text])).toEqual([
      ['speaker_0', 'Frage.'],
      ['speaker_1', 'Antwort.'],
      ['speaker_0', 'Danke.'],
    ]);
  });

  it('keeps text that appears before any marker, attributed to nobody', () => {
    expect(parseSpeakerBlocks('Vorspann. [speaker_0] Hallo.')).toEqual([
      { speaker: '', text: 'Vorspann.', offset: 0 },
      { speaker: 'speaker_0', text: 'Hallo.', offset: 21 },
    ]);
  });

  it('gives every block a distinct offset so it can serve as a render key', () => {
    const blocks = parseSpeakerBlocks('[speaker_0] A. [speaker_1] B. [speaker_0] C.');
    const offsets = blocks.map((b) => b.offset);
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it('returns nothing for markers with no text between them', () => {
    expect(parseSpeakerBlocks('[speaker_0]   [speaker_1]  ')).toEqual([]);
  });
});

describe('getSpeakerLabel', () => {
  it('prefers the mapped name', () => {
    expect(getSpeakerLabel('speaker_1', { speaker_1: 'Katja Hoyer' })).toBe('Katja Hoyer');
  });

  it('falls back to a 1-based Sprecher*in label when unmapped', () => {
    expect(getSpeakerLabel('speaker_0')).toBe('Sprecher*in 1');
    expect(getSpeakerLabel('speaker_3', {})).toBe('Sprecher*in 4');
  });

  it('returns the id unchanged when it is not a speaker marker', () => {
    expect(getSpeakerLabel('moderator')).toBe('moderator');
  });
});

describe('transcriptToMarkdown', () => {
  it('emits one bold label per speaker turn, not per segment', () => {
    const text = '[speaker_0] Erstens. [speaker_0] Zweitens. [speaker_1] Einspruch.';

    expect(transcriptToMarkdown(text)).toBe(
      '**Sprecher*in 1:** Erstens. Zweitens.\n\n**Sprecher*in 2:** Einspruch.'
    );
  });

  it('resolves labels through the speaker map, including user corrections', () => {
    const text = '[speaker_0] Hallo.';
    expect(transcriptToMarkdown(text, { speaker_0: 'Marianne Birthler' })).toBe(
      '**Marianne Birthler:** Hallo.'
    );
  });

  it('passes non-diarized text through untouched so a Protokoll survives it', () => {
    const protokoll = '# Sitzungsprotokoll\n\n**Beschluss:** angenommen.';
    expect(transcriptToMarkdown(protokoll)).toBe(protokoll);
  });

  it('returns an empty string for empty input', () => {
    expect(transcriptToMarkdown('')).toBe('');
  });
});
