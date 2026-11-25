import { EditPage, SiteMediaPicker, SitesOverviewPage } from '@gruenerator/sites';
import { Navigate, useParams } from 'react-router-dom';

import { SitesProviderWeb } from './SitesProviderWeb';

/**
 * `/sites` is the overview and creates sites, `/sites/<handle>` edits one. `/sites/neu` was the
 * separate create page; old links land on the overview.
 */
export function SitesEditPage() {
  const { handle } = useParams<{ handle: string }>();
  if (handle === 'neu') return <Navigate to="/sites" replace />;
  return (
    <SitesProviderWeb>
      {!handle ? <SitesOverviewPage /> : <EditPage handle={handle} />}
      <SiteMediaPicker />
    </SitesProviderWeb>
  );
}

export default SitesEditPage;
