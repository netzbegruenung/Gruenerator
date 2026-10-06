import { type MenuAction } from '@expo/ui/community/menu';

export type ModerationMenuId = 'report' | 'hide';

/** The options behind a post's or comment's "…" button; empty when neither applies. */
export function buildModerationActions(canReport: boolean, canHide: boolean): MenuAction[] {
  const actions: MenuAction[] = [];
  if (canReport) actions.push({ id: 'report', title: 'Melden' });
  if (canHide) actions.push({ id: 'hide', title: 'Person ausblenden' });
  return actions;
}
