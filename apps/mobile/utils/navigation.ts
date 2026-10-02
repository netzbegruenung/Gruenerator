import { router, type Href } from 'expo-router';

/**
 * Back, or — when there is nothing to go back to (the screen was opened by a
 * cold link or a notification) — to `fallback`, the place the screen is
 * normally reached from. A bare `router.back()` there does nothing and strands
 * the user.
 */
export function goBackOr(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
