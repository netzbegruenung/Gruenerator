import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { MonitorShell } from '../components/MonitorShell';
import {
  BlueskySection,
  HotTopicSection,
  SonntagsfrageSection,
  TopArticlesSection,
  TopThemenSection,
  WatcherSection,
  WhatHappenedSection,
} from '../sections';

/** /monitor — the feed home; one headed section per former tab. */
function MonitorUebersichtPage() {
  return (
    <MonitorShell section="uebersicht">
      <HotTopicSection />
      <TopArticlesSection />
      <BlueskySection />
      <TopThemenSection />
      <SonntagsfrageSection />
      <WatcherSection />
      <WhatHappenedSection />
    </MonitorShell>
  );
}

export default withAuthRequired(MonitorUebersichtPage, { title: 'Monitor' });
