import {
  findActiveSegment,
  findActiveSegmentIndex,
  validateSubtitleSegments,
} from '@gruenerator/shared/subtitle-editor';
import { describe, expect, it } from 'vitest';

const segment = (id: number, startTime: number, endTime: number, text = `Text ${id}`) => ({
  id,
  startTime,
  endTime,
  text,
});

describe('findActiveSegment boundary semantics', () => {
  const segments = [segment(0, 0, 5), segment(1, 5, 10)];

  it('matches exactly one segment at an adjacent boundary', () => {
    expect(findActiveSegment(segments, 5)?.id).toBe(1);
    expect(findActiveSegmentIndex(segments, 5)).toBe(1);
  });

  it('matches the segment containing the time', () => {
    expect(findActiveSegment(segments, 2.5)?.id).toBe(0);
    expect(findActiveSegment(segments, 9.99)?.id).toBe(1);
  });

  it('returns null/-1 outside all segments', () => {
    expect(findActiveSegment(segments, 10)).toBeNull();
    expect(findActiveSegment(segments, -1)).toBeNull();
    expect(findActiveSegmentIndex(segments, 10)).toBe(-1);
  });
});

describe('validateSubtitleSegments', () => {
  it('returns no issues for a clean segment list', () => {
    const result = validateSubtitleSegments([segment(0, 0, 2), segment(1, 2, 4)], 10);
    expect(result.issues).toEqual([]);
    expect(result.allEmpty).toBe(false);
  });

  it('flags empty text and reports allEmpty when every text is blank', () => {
    const result = validateSubtitleSegments([segment(0, 0, 2, '  '), segment(1, 2, 4, '')]);
    expect(result.allEmpty).toBe(true);
    expect(result.issues.filter((i) => i.type === 'empty-text')).toHaveLength(2);
  });

  it('does not report allEmpty when at least one segment has text', () => {
    const result = validateSubtitleSegments([segment(0, 0, 2, ''), segment(1, 2, 4, 'Hallo')]);
    expect(result.allEmpty).toBe(false);
    expect(result.issues.filter((i) => i.type === 'empty-text')).toHaveLength(1);
  });

  it('flags non-positive durations and negative start times', () => {
    const result = validateSubtitleSegments([segment(0, 3, 3), segment(1, -1, 2)]);
    const types = result.issues.map((i) => i.type);
    expect(types.filter((t) => t === 'invalid-times')).toHaveLength(2);
  });

  it('flags overlapping neighbours regardless of input order', () => {
    const result = validateSubtitleSegments([segment(1, 4, 8), segment(0, 0, 5)]);
    expect(result.issues.some((i) => i.type === 'overlap')).toBe(true);
  });

  it('does not flag back-to-back segments as overlapping', () => {
    const result = validateSubtitleSegments([segment(0, 0, 5), segment(1, 5, 10)]);
    expect(result.issues.some((i) => i.type === 'overlap')).toBe(false);
  });

  it('flags segments ending past the video duration', () => {
    const result = validateSubtitleSegments([segment(0, 0, 12)], 10);
    expect(result.issues.some((i) => i.type === 'exceeds-duration')).toBe(true);
  });

  it('skips the duration check when duration is unknown', () => {
    const result = validateSubtitleSegments([segment(0, 0, 12)], null);
    expect(result.issues.some((i) => i.type === 'exceeds-duration')).toBe(false);
  });

  it('returns allEmpty=false for an empty list', () => {
    const result = validateSubtitleSegments([]);
    expect(result.allEmpty).toBe(false);
    expect(result.issues).toEqual([]);
  });
});
