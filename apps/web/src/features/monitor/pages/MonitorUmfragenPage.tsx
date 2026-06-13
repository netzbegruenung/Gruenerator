import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { MonitorShell } from '../components/MonitorShell';
import { UmfragenView } from '../components/UmfragenView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** /monitor/umfragen — Sonntagsfrage, Ländertrends, Meinungsbild. */
function MonitorUmfragenPage() {
  const { locale } = useMonitorLocaleParam();

  return (
    <MonitorShell section="umfragen">
      <UmfragenView locale={locale} />
    </MonitorShell>
  );
}

export default withAuthRequired(MonitorUmfragenPage, { title: 'Monitor' });
