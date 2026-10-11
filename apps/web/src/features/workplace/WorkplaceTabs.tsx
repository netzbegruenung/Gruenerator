import { type StartPage } from '@gruenerator/contracts';
import { memo } from 'react';

import GlassTabBar, { type GlassTab } from '@/components/common/GlassTabBar';

/** The tab ids are the `default_startpage` values, so the setting names a tab. */
export type WorkplaceTab = StartPage;

export const WORKPLACE_TABS_LAYOUT_ID = 'workplace-tab-pill';

const TABS: ReadonlyArray<GlassTab<WorkplaceTab>> = [
  { id: 'chat', label: 'Chat', tone: 'neutral' },
  { id: 'arbeiten', label: 'Arbeiten', tone: 'green' },
];

const WorkplaceTabs = memo(
  ({ active, onSelect }: { active: WorkplaceTab; onSelect: (tab: WorkplaceTab) => void }) => (
    <GlassTabBar
      tabs={TABS}
      active={active}
      onSelect={onSelect}
      ariaLabel="Workplace-Bereiche"
      layoutId={WORKPLACE_TABS_LAYOUT_ID}
      dataTour="workplace-tabs"
    />
  )
);
WorkplaceTabs.displayName = 'WorkplaceTabs';

export default WorkplaceTabs;
