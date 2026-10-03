import { Link, Navigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../../components/common/PageContainer';
import { MonitorPageHeader } from '../components/MonitorPageHeader';
import { UmfragenView } from '../components/UmfragenView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';
import { umfragenRegion } from '../umfragenRegion';

/** /umfragen — Sonntagsfrage + Ländertrends als Choropleth.
 * Land richtet sich automatisch nach dem Profil-Locale (kein DE/AT-Umschalter).
 * /umfragen/:land zeigt dasselbe für ein einzelnes Parlament (Einstieg aus den
 * Landesverband-Notebooks). */
function MonitorUmfragenPage() {
  const { locale } = useMonitorLocaleParam();
  const { land } = useParams<{ land: string }>();
  const region = land ? umfragenRegion(land) : null;

  if (land && !region) return <Navigate to="/umfragen" replace />;

  return (
    <PageContainer maxWidth="lg">
      <MonitorPageHeader
        current="umfragen"
        title={region ? `Umfragen · ${region.label}` : 'Umfragen'}
        right={
          region && (
            <Link
              to="/umfragen"
              className="text-[0.9rem] font-semibold text-[#52907a] no-underline hover:underline dark:text-[#7fae9c]"
            >
              Alle Umfragen
            </Link>
          )
        }
      />
      <UmfragenView locale={locale} region={region} />
    </PageContainer>
  );
}

export default withAuthRequired(MonitorUmfragenPage, { title: 'Umfragen' });
