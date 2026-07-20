import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
import { UmfragenView } from '../components/UmfragenView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** /experiments/monitor/umfragen — Sonntagsfrage + Ländertrends als Choropleth.
 * Land richtet sich automatisch nach dem Profil-Locale (kein DE/AT-Umschalter). */
function MonitorUmfragenPage() {
  const { locale } = useMonitorLocaleParam();

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader current="umfragen" title="Umfragen" />
      <UmfragenView locale={locale} />
    </PageContainer>
  );
}

export default withAuthRequired(MonitorUmfragenPage, { title: 'Umfragen' });
