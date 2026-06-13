import {
  parseStoredSubtitles,
  serializeStoredSubtitles,
} from '@gruenerator/shared/subtitle-editor';
import { describe, it, expect } from 'vitest';

import { validateReelOps, applyReelOps } from './reelEditOps.js';

const TEXT_BLOB =
  '00:00.0 - 00:02.4\nHallo zusammen!\n\n00:02.4 - 00:05.1\nHeute gehts um die Wärmewende.\n\n00:05.1 - 00:07.9\nBis bald!';

const JSON_BLOB = JSON.stringify([
  { text: 'Hallo zusammen!', startTime: 0, endTime: 2.4 },
  { text: 'Heute gehts um die Wärmewende.', startTime: 2.4, endTime: 5.1 },
  { text: 'Bis bald!', startTime: 5.1, endTime: 7.9 },
]);

describe('validateReelOps', () => {
  it('rejects out-of-range indices', () => {
    const { byIndex, rejected } = validateReelOps(
      [
        { segmentIndex: 5, newText: 'x' },
        { segmentIndex: -1, newText: 'x' },
      ],
      3
    );
    expect(byIndex.size).toBe(0);
    expect(rejected).toHaveLength(2);
  });

  it('rejects empty/whitespace text', () => {
    const { byIndex, rejected } = validateReelOps([{ segmentIndex: 0, newText: '   ' }], 3);
    expect(byIndex.size).toBe(0);
    expect(rejected).toHaveLength(1);
  });

  it('collapses duplicate indices, last wins', () => {
    const { byIndex } = validateReelOps(
      [
        { segmentIndex: 1, newText: 'erster Versuch' },
        { segmentIndex: 1, newText: 'zweiter Versuch' },
      ],
      3
    );
    expect(byIndex.get(1)).toBe('zweiter Versuch');
  });
});

describe('applyReelOps', () => {
  it('changes only targeted segments and reports changed indices', () => {
    const { segments } = parseStoredSubtitles(TEXT_BLOB);
    const { byIndex } = validateReelOps([{ segmentIndex: 1, newText: 'Neuer Text.' }], 3);
    const applied = applyReelOps(segments, byIndex);
    expect(applied.changedIndices).toEqual([1]);
    expect(applied.segments[1].text).toBe('Neuer Text.');
    expect(applied.segments[0]).toBe(segments[0]);
    expect(applied.segments[1].startTime).toBe(segments[1].startTime);
    expect(applied.segments[1].endTime).toBe(segments[1].endTime);
  });

  it('does not count no-op text as changed', () => {
    const { segments } = parseStoredSubtitles(TEXT_BLOB);
    const { byIndex } = validateReelOps([{ segmentIndex: 0, newText: 'Hallo zusammen!' }], 3);
    const applied = applyReelOps(segments, byIndex);
    expect(applied.changedIndices).toEqual([]);
  });
});

describe('parse → apply → serialize roundtrip', () => {
  it('keeps time lines byte-identical for unchanged segments (text format)', () => {
    const { segments, format } = parseStoredSubtitles(TEXT_BLOB);
    expect(format).toBe('text');
    const { byIndex } = validateReelOps([{ segmentIndex: 1, newText: 'Geändert.' }], 3);
    const out = serializeStoredSubtitles(applyReelOps(segments, byIndex).segments, format);

    const inTimeLines = TEXT_BLOB.split('\n\n').map((b) => b.split('\n')[0]);
    const outTimeLines = out.split('\n\n').map((b) => b.split('\n')[0]);
    expect(outTimeLines).toEqual(inTimeLines);
    expect(out).toContain('Geändert.');
    expect(out).toContain('Hallo zusammen!');
  });

  it('preserves the JSON storage format with exact timestamps', () => {
    const { segments, format } = parseStoredSubtitles(JSON_BLOB);
    expect(format).toBe('json');
    expect(segments).toHaveLength(3);
    const { byIndex } = validateReelOps([{ segmentIndex: 2, newText: 'Tschüss!' }], 3);
    const out = serializeStoredSubtitles(applyReelOps(segments, byIndex).segments, format);

    const parsed = JSON.parse(out) as Array<{
      text: string;
      startTime: number;
      endTime: number;
    }>;
    expect(parsed[2].text).toBe('Tschüss!');
    expect(parsed[1]).toEqual({
      text: 'Heute gehts um die Wärmewende.',
      startTime: 2.4,
      endTime: 5.1,
    });
  });

  it('handles malformed blobs by yielding zero segments', () => {
    expect(parseStoredSubtitles('kein gültiges format').segments).toHaveLength(0);
    expect(parseStoredSubtitles('[{"kaputt": true}]').segments).toHaveLength(0);
    expect(parseStoredSubtitles(null).segments).toHaveLength(0);
  });
});
