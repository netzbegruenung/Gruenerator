import { type StartPage } from '@gruenerator/contracts';
import { memo } from 'react';

import GlassTabBar, { type GlassTab } from '@/components/common/GlassTabBar';
import { startTabLink } from '@/utils/startpage';

/** The tab ids are the `default_startpage` values, so the setting names a tab. */
export type WorkplaceTab = StartPage;

const TABS: ReadonlyArray<GlassTab<WorkplaceTab>> = [
  { id: 'chat', label: 'Chat', path: startTabLink('chat'), tone: 'neutral' },
  { id: 'arbeiten', label: 'Arbeiten', path: startTabLink('arbeiten'), tone: 'green' },
];

const WorkplaceTabs = memo(({ active }: { active: WorkplaceTab }) => (
  <GlassTabBar
    tabs={TABS}
    active={active}
    ariaLabel="Workplace-Bereiche"
    dataTour="workplace-tabs"
  />
));
WorkplaceTabs.displayName = 'WorkplaceTabs';

export default WorkplaceTabs;
