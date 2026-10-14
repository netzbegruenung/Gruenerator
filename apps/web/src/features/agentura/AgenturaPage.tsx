import { Navigate, useSearchParams } from 'react-router-dom';

import { GrueneratorenView } from './GrueneratorenPage';
import { legacyAgenturaRedirect } from './hooks/useMarketFilters';

import withAuthRequired from '@/components/common/LoginRequired/withAuthRequired';

/**
 * `/agentura` — die Übersicht mit offenem Agentura-Popup. Eine eigene Adresse,
 * damit Links aus Chat-Antworten, Menüs und Lesezeichen den Shop öffnen. Alte
 * Links, die noch die frühere Übersicht meinten, gehen vorher weiter.
 */
function AgenturaRoute() {
  const [params] = useSearchParams();
  const redirect = legacyAgenturaRedirect(params);
  if (redirect) return <Navigate to={redirect} replace />;
  return <GrueneratorenView marketOpen />;
}

export default withAuthRequired(AgenturaRoute, { title: 'Agentura' });
