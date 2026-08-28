import { cn } from '@gruenerator/ui';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { BlueskyGrid } from '../components/BlueskyGrid';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
import { MONITOR_HEADING, MONITOR_MUTED } from '../components/theme';
import { WhatHappenedView } from '../components/WhatHappenedView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/**
 * /feed — die beiden Beitragsströme an einem Ort: die Posts des grünen
 * Bluesky-Accounts und die neuen Beiträge aus den Landesverbands-Notebooks
 * (`landesverbaende_documents`, nach Erscheinungstag gruppiert).
 */
function MonitorFeedPage() {
  const { locale } = useMonitorLocaleParam();

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="feed"
        title="Feed"
        right={
          <p className={cn('m-0 max-w-[280px] text-right text-[0.9rem]', MONITOR_MUTED)}>
            Neues von Bluesky und aus den Landesverbänden
          </p>
        }
      />

      <BlueskyGrid locale={locale} className="mb-12" />

      <section>
        <h2
          className={cn(
            'm-0 mb-1 text-[1.35rem] font-semibold tracking-[-0.01em]',
            MONITOR_HEADING
          )}
        >
          Aus den Landesverbänden
        </h2>
        <p className={cn('m-0 mb-5 text-[0.9rem]', MONITOR_MUTED)}>
          Neu veröffentlichte Beiträge aus den Landesverbands-Notebooks, nach Tag gruppiert.
        </p>
        <WhatHappenedView locale={locale} />
      </section>
    </PageContainer>
  );
}

/** Unwrapped for component tests — the default export gates on auth. */
export { MonitorFeedPage as MonitorFeedContent };

export default withAuthRequired(MonitorFeedPage, { title: 'Feed' });
