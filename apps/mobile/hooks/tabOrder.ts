import { isWorkplaceLayout } from '../config/navLayout';
import { type AppRoute } from '../types/routes';

const CLASSIC_TAB_ORDER = [
  '/start',
  '/(tabs)/(arbeiten)',
  '/(tabs)/(studio)',
  '/(tabs)/(recherche)',
] as const satisfies readonly AppRoute[];

export type TabRoute = (typeof CLASSIC_TAB_ORDER)[number];

/**
 * The tabs, left to right. One list, because the swipe neighbours are derived
 * from it: wiring each screen to its neighbours by hand meant four places that
 * could disagree with the bar — and did, since only two of the four screens had
 * a gesture at all.
 *
 * Must stay in the same order as the `Tabs.Screen`s in `ClassicTabLayout` /
 * `NativeTabLayout`; a swipe that lands on a different tab than the bar's
 * neighbour is worse than no swipe.
 *
 * Empty in the workplace shell: Chat and Arbeiten are pages of one native
 * pager there (`WorkplacePager`), which owns the swipe, so no route is in a row.
 */
export const TAB_ORDER: readonly TabRoute[] = isWorkplaceLayout ? [] : CLASSIC_TAB_ORDER;

/**
 * Left and right neighbour of `current` in `order`. A screen outside the row
 * (Studio and Wissen in the workplace shell) has neither: with `indexOf` at -1,
 * `index + 1` would otherwise send it to the first tab.
 */
export function tabNeighbours(order: readonly TabRoute[], current: TabRoute) {
  const index = order.indexOf(current);
  const inRow = index >= 0;
  return {
    inRow,
    next: inRow ? order[index + 1] : undefined,
    previous: index > 0 ? order[index - 1] : undefined,
  };
}
