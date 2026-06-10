/**
 * Wire-format tests for the subtitle text format "M:SS.F - M:SS.F\nText\n\n…".
 *
 * Phase A of the precision migration: all parsers accept 1–2 fractional
 * digits (tenths or centiseconds, extra digits truncated) while every
 * formatter still emits exactly ONE digit. The 1-digit tolerance tests
 * are permanent — old DB rows and old mobile clients write tenths forever.
 */
import {
  formatSubtitlesToText,
  formatTimeWithFraction,
  parseSubtitlesText,
} from '@gruenerator/shared/subtitle-editor';
import { describe, expect, it } from 'vitest';

import { processSubtitleSegments } from '../downloadUtils.js';
import { parseSubtitleSegments } from '../exportService.js';
import { formatTime } from '../manualSubtitleGeneratorService.js';

const block = (start: string, end: string, text = 'Hallo Welt') => `${start} - ${end}\n${text}`;

describe('parser tolerance matrix (shared / downloadUtils / exportService)', () => {
  const parsers = [
    {
      name: 'shared parseSubtitlesText',
      parse: (s: string) =>
        parseSubtitlesText(s).map(({ startTime, endTime }) => [startTime, endTime]),
    },
    {
      name: 'downloadUtils processSubtitleSegments',
      parse: (s: string) =>
        processSubtitleSegments(s).map(({ startTime, endTime }) => [startTime, endTime]),
    },
    {
      name: 'exportService parseSubtitleSegments',
      parse: (s: string) =>
        parseSubtitleSegments(s).map(({ startTime, endTime }) => [startTime, endTime]),
    },
  ];

  for (const { name, parse } of parsers) {
    describe(name, () => {
      it('parses 1-digit fractions (legacy tenths)', () => {
        expect(parse(block('0:05.3', '0:07.1'))).toEqual([[5.3, 7.1]]);
      });

      it('parses 2-digit fractions (centiseconds)', () => {
        expect(parse(block('0:05.38', '0:07.12'))).toEqual([[5.38, 7.12]]);
      });

      it('handles a leading zero in the fraction correctly', () => {
        expect(parse(block('0:05.05', '0:07.50'))).toEqual([[5.05, 7.5]]);
      });

      it('truncates 3+ fractional digits to centiseconds', () => {
        expect(parse(block('0:05.389', '0:07.124'))).toEqual([[5.38, 7.12]]);
      });

      it('handles mixed precision within one range line', () => {
        expect(parse(block('0:05.3', '0:07.12'))).toEqual([[5.3, 7.12]]);
      });

      it('carries minutes (1:23.4 = 83.4s)', () => {
        expect(parse(block('1:23.4', '1:28.55'))).toEqual([[83.4, 88.55]]);
      });
    });
  }

  it('shared parser rejects timestamps without a fractional part', () => {
    expect(parseSubtitlesText(block('0:05', '0:07'))).toEqual([]);
  });

  it('shared parser rejects non-numeric fractions', () => {
    expect(parseSubtitlesText(block('0:05.x', '0:07.1'))).toEqual([]);
  });

  it('exportService parser drops blocks without a fractional part', () => {
    expect(parseSubtitleSegments(block('0:05', '0:07'))).toEqual([]);
  });

  it('downloadUtils parser throws when no block is parseable', () => {
    expect(() => processSubtitleSegments(block('0:05', '0:07'))).toThrow();
  });
});

describe('formatters stay at one fractional digit (Phase A invariant)', () => {
  const ONE_DIGIT = /^\d+:\d{2}\.\d$/;

  it('shared formatTimeWithFraction emits one digit with proper carry', () => {
    expect(formatTimeWithFraction(5.3)).toBe('00:05.3');
    // Carry bug fixed: old Math.round((s % 1) * 10) emitted "00:05.10"
    expect(formatTimeWithFraction(5.96)).toBe('00:06.0');
    expect(formatTimeWithFraction(59.99)).toBe('01:00.0');
    expect(formatTimeWithFraction(59.96)).toBe('01:00.0');
    expect(formatTimeWithFraction(0.999)).toBe('00:01.0');
    expect(formatTimeWithFraction(3599.96)).toBe('60:00.0');

    for (const value of [0, 0.04, 5.96, 59.99, 61.2, 754.5, 3599.96]) {
      expect(formatTimeWithFraction(value)).toMatch(ONE_DIGIT);
    }
  });

  it('api formatTime emits one digit (floor, unchanged in Phase A)', () => {
    expect(formatTime(5.96)).toBe('0:05.9');
    expect(formatTime(83.4)).toBe('1:23.4');
    for (const value of [0, 0.04, 5.96, 59.99, 754.5]) {
      expect(formatTime(value)).toMatch(ONE_DIGIT);
    }
  });
});

describe('round-trip: format → parse stays within tenth-second rounding', () => {
  it('single timestamps survive the round trip within 0.05s', () => {
    // Epsilon absorbs float artifacts in the difference itself
    // (e.g. |1.0 - 1.05| evaluates to 0.050000000000000044).
    const TOLERANCE = 0.05 + 1e-9;
    for (const value of [0, 0.05, 0.949, 5.96, 59.99, 61.2, 754.5, 3599.9]) {
      const segments = [{ id: 0, startTime: value, endTime: value + 1, text: 'Roundtrip' }];
      const parsed = parseSubtitlesText(formatSubtitlesToText(segments));
      expect(parsed).toHaveLength(1);
      expect(Math.abs(parsed[0].startTime - value)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(parsed[0].endTime - (value + 1))).toBeLessThanOrEqual(TOLERANCE);
      expect(parsed[0].text).toBe('Roundtrip');
    }
  });

  it('multi-segment documents round-trip block structure and text', () => {
    const segments = [
      { id: 0, startTime: 0, endTime: 2.1, text: 'Erste Zeile' },
      { id: 1, startTime: 2.1, endTime: 4.85, text: 'Zwei\nZeilen' },
    ];
    const parsed = parseSubtitlesText(formatSubtitlesToText(segments));
    expect(parsed).toHaveLength(2);
    expect(parsed[1].text).toBe('Zwei\nZeilen');
  });

  it('future 2-digit input survives a shared-parser pass losslessly', () => {
    const parsed = parseSubtitlesText(block('0:05.38', '0:07.12', 'Vorwärtskompatibel'));
    expect(parsed[0].startTime).toBeCloseTo(5.38, 10);
    expect(parsed[0].endTime).toBeCloseTo(7.12, 10);
  });
});
