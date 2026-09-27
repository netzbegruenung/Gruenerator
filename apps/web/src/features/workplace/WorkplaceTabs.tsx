import { memo } from 'react';

import GlassTabBar, { type GlassTab } from '@/components/common/GlassTabBar';
import { ARBEITEN_PATH, CHAT_PATH } from '@/utils/startpage';

export type WorkplaceTab = 'chat' | 'arbeiten';

const TABS: ReadonlyArray<GlassTab<WorkplaceTab>> = [
  { id: 'chat', label: 'Chat', path: CHAT_PATH, tone: 'neutral' },
  { id: 'arbeiten', label: 'Arbeiten', path: ARBEITEN_PATH, tone: 'green' },
];

export function workplaceTabFromPathname(pathname: string): WorkplaceTab {
  // Präfix-Vergleich wäre hier falsch: `/startseite` beginnt ebenfalls mit
  // `/start`, ist aber die öffentliche Landeseite.
  return pathname === CHAT_PATH ? 'chat' : 'arbeiten';
}

const WorkplaceTabs = memo(({ active }: { active: WorkplaceTab }) => (
  <GlassTabBar
    tabs={TABS}
    active={active}
    ariaLabel="Workplace-Bereiche"
    layoutId="workplace-tab-pill"
    dataTour="workplace-tabs"
  />
));
WorkplaceTabs.displayName = 'WorkplaceTabs';

export default WorkplaceTabs;
