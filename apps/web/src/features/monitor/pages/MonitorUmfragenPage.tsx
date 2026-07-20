import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorLocaleToggle, MonitorPageHeader } from '../components/MonitorPageHeader';
import { UmfragenView } from '../components/UmfragenView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

/** /experiments/monitor/umfragen — Sonntagsfrage + Ländertrends als Choropleth. */
function MonitorUmfragenPage() {
  const { locale, setLocale } = useMonitorLocaleParam();

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="umfragen"
        title="Umfragen"
        right={<MonitorLocaleToggle locale={locale} onChange={setLocale} />}
      />
      <UmfragenView locale={locale} />
    </PageContainer>
  );
}

export default withAuthRequired(MonitorUmfragenPage, { title: 'Umfragen' });
