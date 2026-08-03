import { describe, expect, it } from 'vitest';

import { selectStatusLabel, selectStatusLineView } from './statusLineView';

import type { ProgressStep } from '../hooks/useChatGraphStream';

function step(over: Partial<ProgressStep> = {}): ProgressStep {
  return { stage: 'searching', label: 'Suche läuft', status: 'in-progress', ...over };
}

describe('selectStatusLineView', () => {
  const base = { hasOwnDetail: false, hasText: false, hasProgress: true } as const;

  it('shows the label for a plain answer turn (the direct-intent regression)', () => {
    // `intent: 'direct'` puts the turn straight into `generating`. Mobile used to
    // gate exactly this combination out and fell back to the dots for the whole
    // turn — the bug this module exists to make impossible to reintroduce.
    expect(selectStatusLineView({ ...base, stage: 'generating' })).toBe('progress');
  });

  it('shows the dots while classifying', () => {
    expect(selectStatusLineView({ ...base, stage: 'classifying' })).toBe('typing');
  });

  it('shows the dots before any progress metadata arrives', () => {
    expect(selectStatusLineView({ ...base, stage: undefined, hasProgress: false })).toBe('typing');
  });

  it('keeps narrating alongside streaming prose when the turn has no detail', () => {
    expect(selectStatusLineView({ ...base, stage: 'generating', hasText: true })).toBe('progress');
  });

  it('stays quiet once text arrives with nothing concrete to say', () => {
    expect(selectStatusLineView({ ...base, stage: 'classifying', hasText: true })).toBe('none');
  });

  it('retires the line as soon as a detailed turn starts its answer', () => {
    const detail = { ...base, hasOwnDetail: true, stage: 'searching' } as const;
    expect(selectStatusLineView(detail)).toBe('progress');
    expect(selectStatusLineView({ ...detail, hasText: true })).toBe('none');
  });

  it('never shows the dots on a turn that has a card or reasoning', () => {
    // The card carries its own affordance; dots above it would double up.
    expect(selectStatusLineView({ ...base, hasOwnDetail: true, stage: 'classifying' })).toBe(
      'none'
    );
  });

  it('leaves an image turn with a card to its card alone', () => {
    // generating_image is concrete, but a sharepic card already says so.
    expect(selectStatusLineView({ ...base, stage: 'generating_image' })).toBe('progress');
    expect(selectStatusLineView({ ...base, stage: 'generating_image', hasOwnDetail: true })).toBe(
      'none'
    );
  });

  it('stays quiet on the terminal stages', () => {
    expect(selectStatusLineView({ ...base, stage: 'complete', hasText: true })).toBe('none');
    expect(selectStatusLineView({ ...base, stage: 'idle', hasText: true })).toBe('none');
  });
});

describe('selectStatusLabel', () => {
  it('prioritises a failed step over any in-progress one', () => {
    const result = selectStatusLabel({
      steps: [step({ label: 'Läuft noch' }), step({ status: 'failed', label: 'Fehlgeschlagen' })],
    });
    expect(result).toEqual({ label: 'Fehlgeschlagen', failed: true });
  });

  it('prefers planner prose over the retrieval step and the stage word', () => {
    expect(
      selectStatusLabel({
        steps: [step({ label: 'Durchsuche …' })],
        pendingNarration: ['Zuerst das Wahlprogramm.', 'Jetzt die Beschlüsse.'],
        toolStatus: 'Websuche „Klimageld"',
      })
    ).toEqual({ label: 'Jetzt die Beschlüsse.', failed: false });
  });

  it('prefers the retrieval step over the stage word', () => {
    expect(
      selectStatusLabel({ steps: [step({ label: 'Durchsuche …' })], toolStatus: 'Websuche „X"' })
    ).toEqual({ label: 'Websuche „X"', failed: false });
  });

  it('falls back to the stage word', () => {
    expect(selectStatusLabel({ steps: [step({ label: 'Formuliere …' })] })).toEqual({
      label: 'Formuliere …',
      failed: false,
    });
  });

  it('stays quiet when nothing is in flight', () => {
    expect(
      selectStatusLabel({ steps: [step({ status: 'completed', label: 'Fertig' })] })
    ).toBeNull();
  });

  it('falls back to the raw message for adapters that stream no steps', () => {
    // The notebook adapter has no step list; without this it would go silent.
    expect(selectStatusLabel({ message: 'Suche läuft…' })).toEqual({
      label: 'Suche läuft…',
      failed: false,
    });
  });

  it('returns null rather than an empty label', () => {
    expect(selectStatusLabel({})).toBeNull();
    expect(selectStatusLabel({ steps: [step({ label: '' })] })).toBeNull();
  });
});
