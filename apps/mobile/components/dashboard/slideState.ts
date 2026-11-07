/**
 * Folienstand der Dashboard-Karten, als reine Logik — ohne React, ohne Timer.
 * Der Hook {@link useAutoAdvance} und die Animation hängen nur dran.
 */
export interface SlideState {
  index: number;
  /** Das Durchwechseln steht (von Hand gewählt oder per Pause-Knopf angehalten). */
  stopped: boolean;
  /** Mindestens einmal von Hand gewechselt — erst dann wird angesagt. */
  manual: boolean;
}

export type SlideAction =
  | { type: 'tick'; count: number }
  | { type: 'select'; index: number; count: number }
  /** Von Hand eine Folie vor oder zurück (Wischen). */
  | { type: 'step'; delta: 1 | -1; count: number }
  | { type: 'toggle' };

export const initialSlideState: SlideState = { index: 0, stopped: false, manual: false };

export function slideReducer(state: SlideState, action: SlideAction): SlideState {
  switch (action.type) {
    case 'tick':
      if (action.count < 1) return state;
      return { ...state, index: (state.index + 1) % action.count };
    case 'select':
      if (action.count < 1) return state;
      return {
        index: ((action.index % action.count) + action.count) % action.count,
        stopped: true,
        manual: true,
      };
    case 'step': {
      if (action.count < 1) return state;
      const current = state.index % action.count;
      return slideReducer(state, {
        type: 'select',
        index: current + action.delta,
        count: action.count,
      });
    }
    case 'toggle':
      return { ...state, stopped: !state.stopped };
  }
}

/** Kommen weniger Folien als vorher, bleibt der Index gültig. */
export function activeIndex(state: SlideState, count: number): number {
  return count > 0 ? state.index % count : 0;
}
