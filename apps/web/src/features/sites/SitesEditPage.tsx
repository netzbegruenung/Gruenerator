import { CreateSitePage, EditPage, SiteMediaPicker, SitesOverviewPage } from '@gruenerator/sites';
import { useParams } from 'react-router-dom';

import { useHostAwareBack } from '../../hooks/useHostAwareBack';

import { SitesProviderWeb } from './SitesProviderWeb';

/** `/sites` is the overview, `/sites/neu` creates a site, `/sites/<handle>` edits one. */
export function SitesEditPage() {
  const back = useHostAwareBack('/');
  const { handle } = useParams<{ handle: string }>();
  return (
    <SitesProviderWeb>
      {!handle ? (
        <SitesOverviewPage onBack={back} />
      ) : handle === 'neu' ? (
        <CreateSitePage onBack={back} />
      ) : (
        <EditPage handle={handle} />
      )}
      <SiteMediaPicker />
    </SitesProviderWeb>
  );
}

export default SitesEditPage;
