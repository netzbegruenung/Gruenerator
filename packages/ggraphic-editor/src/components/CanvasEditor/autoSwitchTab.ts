// SPDX-License-Identifier: MPL-2.0
import { type SidebarTabId } from '../../sidebar/types';

/**
 * The sidebar tab after the selection changed: a selected element opens its
 * properties tab (`target`) and deselecting restores the tab it replaced
 * (`prev`). The chat stays open — the person selects elements to talk about them.
 * So do the Ebenen: selecting there is the point, the list must not swap away.
 */
export function autoSwitchTab(
  current: SidebarTabId | null,
  target: SidebarTabId | null,
  prev: SidebarTabId | null
): { tab: SidebarTabId | null; prev: SidebarTabId | null } {
  if (current === 'chat' || current === 'layers') return { tab: current, prev: null };
  if (target) return { tab: target, prev: current !== target ? current : prev };
  if (prev !== null && current !== prev) return { tab: prev, prev: null };
  return { tab: current, prev };
}
