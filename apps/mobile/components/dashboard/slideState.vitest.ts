import { describe, expect, it } from 'vitest';

import { activeIndex, initialSlideState, slideReducer, type SlideState } from './slideState';

const at = (index: number, rest: Partial<SlideState> = {}): SlideState => ({
  ...initialSlideState,
  index,
  ...rest,
});

describe('slideReducer', () => {
  it('advances on tick and wraps at the end', () => {
    expect(slideReducer(at(0), { type: 'tick', count: 3 }).index).toBe(1);
    expect(slideReducer(at(2), { type: 'tick', count: 3 }).index).toBe(0);
  });

  it('stays on 0 with a single slide', () => {
    expect(slideReducer(at(0), { type: 'tick', count: 1 }).index).toBe(0);
  });

  it('ignores ticks and selects without slides', () => {
    expect(slideReducer(at(0), { type: 'tick', count: 0 })).toEqual(at(0));
    expect(slideReducer(at(0), { type: 'select', index: 2, count: 0 })).toEqual(at(0));
  });

  it('select stops the rotation and marks the change as manual', () => {
    expect(slideReducer(at(0), { type: 'select', index: 2, count: 4 })).toEqual({
      index: 2,
      stopped: true,
      manual: true,
    });
  });

  it('select wraps in both directions', () => {
    expect(slideReducer(at(0), { type: 'select', index: -1, count: 4 }).index).toBe(3);
    expect(slideReducer(at(3), { type: 'select', index: 4, count: 4 }).index).toBe(0);
  });

  it('step moves one slide by hand, wraps, and starts from a valid index', () => {
    expect(slideReducer(at(0), { type: 'step', delta: 1, count: 3 })).toEqual({
      index: 1,
      stopped: true,
      manual: true,
    });
    expect(slideReducer(at(0), { type: 'step', delta: -1, count: 3 }).index).toBe(2);
    expect(slideReducer(at(5), { type: 'step', delta: 1, count: 3 }).index).toBe(0);
  });

  it('toggle flips stopped and keeps the slide', () => {
    const stopped = slideReducer(at(2, { stopped: true, manual: true }), { type: 'toggle' });
    expect(stopped).toEqual(at(2, { stopped: false, manual: true }));
    expect(slideReducer(stopped, { type: 'toggle' }).stopped).toBe(true);
  });
});

describe('activeIndex', () => {
  it('keeps the index valid when fewer slides arrive', () => {
    expect(activeIndex(at(5), 3)).toBe(2);
  });

  it('is 0 without slides', () => {
    expect(activeIndex(at(5), 0)).toBe(0);
  });
});
