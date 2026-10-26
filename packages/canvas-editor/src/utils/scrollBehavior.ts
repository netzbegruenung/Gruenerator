/**
 * `behavior` für JS-Scrolls (`scrollIntoView`, `scrollBy`): sanft, außer die
 * Person wünscht weniger Bewegung — per Systemeinstellung oder per Schalter
 * (`html[data-reduce-motion="true"]`).
 */
export function scrollBehavior(): ScrollBehavior {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reduceMotion === 'true') {
    return 'auto';
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return 'auto';
  }
  return 'smooth';
}
