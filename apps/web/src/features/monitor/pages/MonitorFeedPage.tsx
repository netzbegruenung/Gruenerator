import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { MonitorShell } from '../components/MonitorShell';
import { WhatHappenedView } from '../components/WhatHappenedView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** /monitor/feed — neue Inhalte aus grünen Quellen, tagesweise gruppiert. */
function MonitorFeedPage() {
  const { locale } = useMonitorLocaleParam();

  return (
    <MonitorShell section="feed">
      <WhatHappenedView locale={locale} />
    </MonitorShell>
  );
}

export default withAuthRequired(MonitorFeedPage, { title: 'Monitor' });
