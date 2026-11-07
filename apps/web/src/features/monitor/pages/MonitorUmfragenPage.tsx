import { umfragenRegion } from '@gruenerator/shared/monitor';
import { Link, Navigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { UmfragenView } from '../components/UmfragenView';
import { useMonitorLocaleParam } from '../hooks/useMonitorLocaleParam';

import { DashboardPage, DASH_PAGE_TITLE } from '@/components/dashboard/DashboardPage';
import { DASH_LINK } from '@/components/dashboard/dashboardStyles';

/** /umfragen — eigene Seite im Dashboard-Stil wie /briefing: Sonntagsfrage + Ländertrends als Choropleth.
 * Land richtet sich automatisch nach dem Profil-Locale (kein DE/AT-Umschalter).
 * /umfragen/:land zeigt dasselbe für ein einzelnes Parlament (Einstieg aus den
 * Landesverband-Notebooks). */
function MonitorUmfragenPage() {
  const { locale } = useMonitorLocaleParam();
  const { land } = useParams<{ land: string }>();
  const region = land ? umfragenRegion(land) : null;

  if (land && !region) return <Navigate to="/umfragen" replace />;

  return (
    <DashboardPage>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <h1 className={DASH_PAGE_TITLE}>{region ? `Umfragen · ${region.label}` : 'Umfragen'}</h1>
        {region && (
          <Link to="/umfragen" className={DASH_LINK}>
            Alle Umfragen
          </Link>
        )}
      </div>
      <UmfragenView locale={locale} region={region} />
    </DashboardPage>
  );
}

export default withAuthRequired(MonitorUmfragenPage, { title: 'Umfragen' });
