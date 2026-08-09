import { describe, expect, it } from 'vitest';

import {
  mayExceedChunkLimit,
  mergeResults,
  offsetResult,
  remapChunkSpeakers,
  type TranscriptionResult,
} from '../transcriptionRouterService.js';

const result = (overrides: Partial<TranscriptionResult> = {}): TranscriptionResult => ({
  text: 'hallo welt',
  hasTimestamps: false,
  ...overrides,
});

describe('remapChunkSpeakers', () => {
  it('leaves a chunk without speaker markers untouched and reports no ids', () => {
    const { result: remapped, maxIdSeen } = remapChunkSpeakers(result(), 3);
    expect(remapped.text).toBe('hallo welt');
    expect(maxIdSeen).toBe(-1);
  });

  it('shifts every marker by the offset and keeps sparse ids sparse', () => {
    const { result: remapped, maxIdSeen } = remapChunkSpeakers(
      result({ text: '[speaker_0] a\n[speaker_2] b\n[speaker_0] c' }),
      5
    );
    expect(remapped.text).toBe('[speaker_5] a\n[speaker_7] b\n[speaker_5] c');
    expect(maxIdSeen).toBe(2);
  });

  it('produces globally unique labels across consecutive chunks', () => {
    let offset = 0;
    const chunk1 = remapChunkSpeakers(result({ text: '[speaker_0] a [speaker_1] b' }), offset);
    offset += chunk1.maxIdSeen + 1;
    const chunk2 = remapChunkSpeakers(result({ text: '[speaker_0] c [speaker_1] d' }), offset);
    expect(chunk1.result.text).toBe('[speaker_0] a [speaker_1] b');
    expect(chunk2.result.text).toBe('[speaker_2] c [speaker_3] d');
  });
});

describe('offsetResult', () => {
  it('returns the input unchanged for offset 0 or missing segments', () => {
    const withSegments = result({
      segments: [{ start: 1, end: 2, text: 'a' }],
      hasTimestamps: true,
    });
    const noSegments = result();
    expect(offsetResult(withSegments, 0)).toBe(withSegments);
    expect(offsetResult(noSegments, 120)).toBe(noSegments);
  });

  it('shifts segment start and end by the chunk offset', () => {
    const shifted = offsetResult(
      result({
        segments: [
          { start: 0, end: 4, text: 'a' },
          { start: 4, end: 9, text: 'b' },
        ],
        hasTimestamps: true,
      }),
      7200
    );
    expect(shifted.segments).toEqual([
      { start: 7200, end: 7204, text: 'a' },
      { start: 7204, end: 7209, text: 'b' },
    ]);
  });
});

describe('mergeResults', () => {
  it('throws on an empty result set', () => {
    expect(() => mergeResults([])).toThrow('empty transcription result set');
  });

  it('returns a single result as-is', () => {
    const single = result({ segments: [{ start: 0, end: 1, text: 'a' }], hasTimestamps: true });
    expect(mergeResults([single])).toBe(single);
  });

  it('concatenates text and segments when every chunk has timestamps', () => {
    const merged = mergeResults([
      result({ text: 'a', segments: [{ start: 0, end: 1, text: 'a' }], hasTimestamps: true }),
      result({ text: 'b', segments: [{ start: 7200, end: 7201, text: 'b' }], hasTimestamps: true }),
    ]);
    expect(merged.text).toBe('a\nb');
    expect(merged.hasTimestamps).toBe(true);
    expect(merged.segments).toHaveLength(2);
  });

  it('degrades to hasTimestamps: false without segments when any chunk lacks them', () => {
    const merged = mergeResults([
      result({ text: 'a', segments: [{ start: 0, end: 1, text: 'a' }], hasTimestamps: true }),
      result({ text: 'b', hasTimestamps: false }),
    ]);
    expect(merged.hasTimestamps).toBe(false);
    expect(merged.segments).toBeUndefined();
    expect(merged.text).toBe('a\nb');
  });
});

describe('mayExceedChunkLimit', () => {
  it('skips the probe for buffers that cannot reach the chunk threshold', () => {
    expect(mayExceedChunkLimit(Buffer.alloc(1024))).toBe(false);
  });

  it('requires the probe for buffers large enough to exceed it', () => {
    expect(mayExceedChunkLimit(Buffer.alloc(8 * 1024 * 1024))).toBe(true);
  });
});
