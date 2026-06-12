import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { MonitorShell } from '../components/MonitorShell';
import {
  BlueskySection,
  HotTopicSection,
  SonntagsfrageSection,
  TopArticlesSection,
  TopThemenSection,
  WhatHappenedSection,
} from '../sections';

/** /monitor — the feed home, composed from self-contained sections. */
function MonitorUebersichtPage() {
  return (
    <MonitorShell section="uebersicht">
      <HotTopicSection />
      <TopArticlesSection />
      <BlueskySection />
      <TopThemenSection />
      <SonntagsfrageSection />
      <WhatHappenedSection />
    </MonitorShell>
  );
}

export default withAuthRequired(MonitorUebersichtPage, { title: 'Monitor' });
