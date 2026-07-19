// Split from the tour modules so done-checks don't pull driver.js into page
// chunks. Every tour shows exactly once (flag set at START, not completion, so
// an abandoned tour never auto-replays); /profile offers a reset.
export type TourId = 'workplace' | 'docs' | 'sheets' | 'presentations' | 'canvas' | 'studio';

const TOUR_KEYS: Record<TourId, string> = {
  workplace: 'gruenerator-workplace-tour-v1',
  docs: 'gruenerator-tour-docs-v1',
  sheets: 'gruenerator-tour-sheets-v1',
  presentations: 'gruenerator-tour-presentations-v1',
  canvas: 'gruenerator-tour-canvas-v1',
  studio: 'gruenerator-tour-studio-v1',
};

export function isTourDone(id: TourId): boolean {
  try {
    return localStorage.getItem(TOUR_KEYS[id]) === 'done';
  } catch {
    return true;
  }
}

export function markTourDone(id: TourId): void {
  try {
    localStorage.setItem(TOUR_KEYS[id], 'done');
  } catch {
    // private mode — the tour will simply offer itself again next visit
  }
}

export function resetAllTours(): void {
  try {
    for (const key of Object.values(TOUR_KEYS)) {
      localStorage.removeItem(key);
    }
  } catch {
    // private mode — nothing to reset
  }
}
