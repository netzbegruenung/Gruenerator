import { CreateSitePage, EditPage, SiteMediaPicker, SitesOverviewPage } from '@gruenerator/sites';
import { Navigate, useLocation, useParams } from 'react-router-dom';

import { useHostAwareBack } from '../../hooks/useHostAwareBack';

import { SitesProviderWeb } from './SitesProviderWeb';

/**
 * `/sites` is the overview, `/sites/erstellen` creates a site, `/sites/<handle>` edits one.
 * `/sites/neu` was the create path until 11/2026; old links land on the create page.
 */
export function SitesEditPage() {
  const back = useHostAwareBack('/');
  const { handle } = useParams<{ handle: string }>();
  const state: unknown = useLocation().state;
  if (handle === 'neu') return <Navigate to="/sites/erstellen" replace state={state} />;
  return (
    <SitesProviderWeb>
      {!handle ? (
        <SitesOverviewPage />
      ) : handle === 'erstellen' ? (
        <CreateSitePage onBack={back} />
      ) : (
        <EditPage handle={handle} />
      )}
      <SiteMediaPicker />
    </SitesProviderWeb>
  );
}

export default SitesEditPage;
