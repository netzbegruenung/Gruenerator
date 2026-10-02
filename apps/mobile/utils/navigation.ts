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

/**
 * Home — the Chat | Arbeiten pager — with everything above it dismissed.
 *
 * Not `router.replace('/start')`: from inside `(focused)` or `(fullscreen)` the
 * root stack is where the paths diverge, and a replace there stacks a second
 * home on top of the first (`[(tabs), (focused), (tabs)]`), so back from home
 * walked into the screens the user just left. `dismissTo` pops to the home
 * that is there, and replaces only when there is none (a cold link, sign-in).
 */
export function goHome(): void {
  router.dismissTo('/start');
}
