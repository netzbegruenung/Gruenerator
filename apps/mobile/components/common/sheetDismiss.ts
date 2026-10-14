/**
 * Where a flick would come to rest if it kept decelerating — UIScrollView's
 * exponential decay, so a short fast flick travels as far as iOS would carry it.
 */
function projectedTravel(velocity: number): number {
  'worklet';
  const rate = 0.998;
  return ((velocity / 1000) * rate) / (1 - rate);
}

/** Past this share of its height — measured where the flick was headed — the sheet goes. */
const DISMISS_FRACTION = 0.35;

/**
 * Whether a released drag dismisses the sheet. Distance OR momentum: a long
 * slow drag goes, and so does a short flick; a drag that is flicked back up
 * stays, however far it had travelled.
 */
export function shouldDismissSheet(translation: number, velocity: number, height: number): boolean {
  'worklet';
  return translation + projectedTravel(velocity) > height * DISMISS_FRACTION;
}
