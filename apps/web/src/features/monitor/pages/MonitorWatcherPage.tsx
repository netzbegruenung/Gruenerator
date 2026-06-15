import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { MonitorShell } from '../components/MonitorShell';
import { WatcherView } from '../components/WatcherView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** /monitor/watcher — Berichterstattung über die Grünen im Blick. */
function MonitorWatcherPage() {
  const { locale } = useMonitorLocaleParam();

  return (
    <MonitorShell section="watcher">
      <WatcherView locale={locale} />
    </MonitorShell>
  );
}

export default withAuthRequired(MonitorWatcherPage, { title: 'Monitor' });
