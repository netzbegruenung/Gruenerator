import { PiPaletteFill } from 'react-icons/pi';

import { readSharepicSource } from '../../collab/sharepicSource';

import type { SidebarTab } from '@ggraphic/editor/sidebar';

interface SourcePage {
  id: string;
  configId: string;
  state: Record<string, unknown>;
}

/**
 * The „Design" tab: the creator looks of a sharepic or carousel (navigation,
 * page number, numbering, colour …), the options the Studio offered on a
 * finished draft. It acts on a whole deck, so the editor adds it itself.
 */
export const designTab: SidebarTab = {
  id: 'design',
  icon: PiPaletteFill,
  label: 'Design',
  ariaLabel: 'Design: Navigation, Seitenzahl und Look des Sharepics ändern',
};

/** Right after „Vorlagen"; first where there is none. */
export const designTabIndex = (tabs: readonly SidebarTab[]): number =>
  tabs.findIndex((t) => t.id === 'vorlagen') + 1;

/**
 * The deck the tab works on: the active page's, else the first one in the
 * document; null when no page came from the creator.
 */
export function designDeckOf(
  pages: readonly SourcePage[],
  activePageId: string | null
): string | null {
  const active = pages.find((p) => p.id === activePageId);
  const own = active ? readSharepicSource(active) : null;
  if (own) return own.deck;
  for (const page of pages) {
    const source = readSharepicSource(page);
    if (source) return source.deck;
  }
  return null;
}
