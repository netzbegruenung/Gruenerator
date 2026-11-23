import { type StartPage } from '@gruenerator/contracts';
import { memo, useMemo } from 'react';

import GlassTabBar, { type GlassTab } from '@/components/common/GlassTabBar';
import { startTabPath } from '@/utils/startpage';

/** The tab ids are the `default_startpage` values, so the setting names a tab. */
export type WorkplaceTab = StartPage;

const TABS: ReadonlyArray<Omit<GlassTab<WorkplaceTab>, 'path'>> = [
  { id: 'chat', label: 'Chat' },
  { id: 'arbeiten', label: 'Arbeiten' },
];

const WorkplaceTabs = memo(({ active, home }: { active: WorkplaceTab; home: WorkplaceTab }) => {
  const tabs = useMemo(
    () => TABS.map((tab) => ({ ...tab, path: startTabPath(tab.id, home) })),
    [home]
  );
  return (
    <GlassTabBar
      tabs={tabs}
      active={active}
      ariaLabel="Workplace-Bereiche"
      dataTour="workplace-tabs"
    />
  );
});
WorkplaceTabs.displayName = 'WorkplaceTabs';

export default WorkplaceTabs;
