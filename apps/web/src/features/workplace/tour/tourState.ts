// Split from workplaceTour.ts so the autostart check doesn't pull driver.js
// into the page chunk.
const TOUR_DONE_KEY = 'gruenerator-workplace-tour-v1';

export function isWorkplaceTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_DONE_KEY) === 'done';
  } catch {
    return true;
  }
}

export function markWorkplaceTourDone(): void {
  try {
    localStorage.setItem(TOUR_DONE_KEY, 'done');
  } catch {
    // private mode — the tour will simply offer itself again next visit
  }
}
