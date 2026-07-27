import { beforeEach, describe, expect, it } from 'vitest';

import {
  selectActiveSegment,
  selectActiveSegmentId,
  selectFormattedCurrentTime,
  selectFormattedDuration,
  selectIsEditing,
  useSubtitleEditorStore,
} from './subtitleEditorStore';

import type { SubtitleSegment } from '@gruenerator/shared/subtitle-editor';

/**
 * Dirty tracking is the load-bearing part here: `hasUnsavedChanges` gates the
 * "Änderungen verwerfen?" prompt on back-navigation. A false negative loses the
 * user's edits silently — the class of bug behind `5059d6458 subtitle editor
 * state hygiene + export validation`.
 */

const state = () => useSubtitleEditorStore.getState();

// Storage format is "MM:SS.F - MM:SS.F\nText" (parseSubtitlesText); segment ids
// are the block index, so these parse to ids 0 and 1.
const SUBTITLES = ['0:00.0 - 0:01.5\nErster Satz', '0:01.5 - 0:03.0\nZweiter Satz'].join('\n\n');

const load = (): void => {
  state().loadProject('proj-1', 'upload-1', SUBTITLES, 'shadow', 'tief', 30);
};

beforeEach(() => {
  state().reset();
});

describe('loadProject', () => {
  it('parses subtitles and starts clean', () => {
    load();

    expect(state().projectId).toBe('proj-1');
    expect(state().uploadId).toBe('upload-1');
    expect(state().segments).toHaveLength(2);
    expect(state().duration).toBe(30);
    expect(state().hasUnsavedChanges).toBe(false);
  });

  it('snapshots the originals as a separate array, not the same reference', () => {
    // Sharing the reference would make every edit compare equal to itself and
    // hasUnsavedChanges would never flip.
    load();

    expect(state().originalSegments).toEqual(state().segments);
    expect(state().originalSegments).not.toBe(state().segments);
    expect(state().originalSegments[0]).not.toBe(state().segments[0]);
  });

  it('handles a project with no subtitles yet', () => {
    state().loadProject('proj-1', 'upload-1', null, 'shadow', 'tief', 30);

    expect(state().segments).toEqual([]);
    expect(state().hasUnsavedChanges).toBe(false);
  });

  it('clears selection and error state from a previous project', () => {
    load();
    state().startEditing(0);

    state().loadProject('proj-2', 'upload-2', SUBTITLES, 'clean', 'standard', 12);

    expect(state().editingSegmentId).toBeNull();
    expect(state().selectedSegmentId).toBeNull();
    expect(state().currentTime).toBe(0);
    expect(state().error).toBeNull();
  });
});

describe('dirty tracking', () => {
  it('flags an edited segment as unsaved', () => {
    load();
    const first = state().segments[0];

    state().updateSegmentText(first.id, 'Geänderter Satz');

    expect(state().hasUnsavedChanges).toBe(true);
  });

  it('clears the flag again when the text is edited back', () => {
    load();
    const first = state().segments[0];
    const original = first.text;

    state().updateSegmentText(first.id, 'Etwas anderes');
    state().updateSegmentText(first.id, original);

    expect(state().hasUnsavedChanges).toBe(false);
  });

  it('stays clean when setSegments is handed an equal array', () => {
    load();

    state().setSegments(state().segments.map((s) => ({ ...s })));

    expect(state().hasUnsavedChanges).toBe(false);
  });

  it('flags a removed segment', () => {
    load();

    state().setSegments(state().segments.slice(0, 1));

    expect(state().hasUnsavedChanges).toBe(true);
  });

  it('flags a retimed segment even when the text is unchanged', () => {
    load();
    const segments: SubtitleSegment[] = state().segments.map((s, i) =>
      i === 0 ? { ...s, endTime: s.endTime + 0.5 } : s
    );

    state().setSegments(segments);

    expect(state().hasUnsavedChanges).toBe(true);
  });

  it('ignores an update for an unknown segment id', () => {
    load();

    state().updateSegmentText(9999, 'nirgends');

    expect(state().hasUnsavedChanges).toBe(false);
  });

  it('treats a style change as unsaved', () => {
    load();
    state().setStylePreference('tanne');
    expect(state().hasUnsavedChanges).toBe(true);
  });

  it('treats a height change as unsaved', () => {
    load();
    state().setHeightPreference('standard');
    expect(state().hasUnsavedChanges).toBe(true);
  });

  it('markAsSaved re-baselines so a later identical edit is not flagged', () => {
    load();
    const first = state().segments[0];
    state().updateSegmentText(first.id, 'Neuer Text');

    state().markAsSaved();

    expect(state().hasUnsavedChanges).toBe(false);
    expect(state().isSaving).toBe(false);
    expect(state().originalSegments).toEqual(state().segments);
    expect(state().originalSegments).not.toBe(state().segments);
  });

  it('markAsSaved snapshots by value, so a later edit still flips the flag', () => {
    load();
    state().markAsSaved();

    const first = state().segments[0];
    state().updateSegmentText(first.id, 'Noch was');

    expect(state().hasUnsavedChanges).toBe(true);
  });
});

describe('selection and editing', () => {
  it('selecting a segment stops any in-progress edit', () => {
    load();
    state().startEditing(0);

    state().selectSegment(1);

    expect(state().selectedSegmentId).toBe(1);
    expect(state().editingSegmentId).toBeNull();
  });

  it('startEditing also selects', () => {
    load();
    state().startEditing(1);

    expect(state().editingSegmentId).toBe(1);
    expect(state().selectedSegmentId).toBe(1);
    expect(selectIsEditing(state())).toBe(true);
  });

  it('stopEditing keeps the selection', () => {
    load();
    state().startEditing(1);

    state().stopEditing();

    expect(state().editingSegmentId).toBeNull();
    expect(state().selectedSegmentId).toBe(1);
  });
});

describe('active-segment selectors', () => {
  it('treats the end boundary as exclusive so adjacent segments never both match', () => {
    load();
    const [first, second] = state().segments;

    state().setCurrentTime(first.endTime);

    expect(selectActiveSegment(state())?.id).toBe(second.id);
    expect(selectActiveSegmentId(state())).toBe(second.id);
  });

  it('treats the start boundary as inclusive', () => {
    load();
    const first = state().segments[0];

    state().setCurrentTime(first.startTime);

    expect(selectActiveSegmentId(state())).toBe(first.id);
  });

  it('returns null past the last segment', () => {
    load();
    state().setCurrentTime(999);

    expect(selectActiveSegment(state())).toBeNull();
    expect(selectActiveSegmentId(state())).toBeNull();
  });
});

describe('time formatting', () => {
  it.each([
    [0, '0:00'],
    [9, '0:09'],
    [61, '1:01'],
    [125.9, '2:05'],
    [600, '10:00'],
  ])('formats %ss as %s', (seconds, expected) => {
    state().setCurrentTime(seconds);
    state().setDuration(seconds);

    expect(selectFormattedCurrentTime(state())).toBe(expected);
    expect(selectFormattedDuration(state())).toBe(expected);
  });
});

describe('reset', () => {
  it('returns every field to its initial value', () => {
    load();
    state().startEditing(0);
    state().setStylePreference('tanne');
    state().setCurrentTime(5);

    state().reset();

    expect(state().projectId).toBeNull();
    expect(state().uploadId).toBeNull();
    expect(state().segments).toEqual([]);
    expect(state().originalSegments).toEqual([]);
    expect(state().currentTime).toBe(0);
    expect(state().duration).toBe(0);
    expect(state().editingSegmentId).toBeNull();
    expect(state().selectedSegmentId).toBeNull();
    expect(state().hasUnsavedChanges).toBe(false);
    expect(state().stylePreference).toBe('shadow');
    expect(state().heightPreference).toBe('tief');
  });
});
