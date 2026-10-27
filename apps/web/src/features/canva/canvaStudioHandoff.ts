/**
 * What the Studio composer hands to `/studio/canva` (new tab: `?handoff=`,
 * same tab: router state). Its own module so the Studio landing does not pull
 * in the lazily loaded page.
 */
export interface CanvaStudioHandoff {
  prompt: string;
}
