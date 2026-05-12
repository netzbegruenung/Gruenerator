import { EditPage, SiteMediaPicker } from '@gruenerator/sites';

import { SitesProviderWeb } from './SitesProviderWeb';

export function SitesEditPage() {
  return (
    <SitesProviderWeb>
      <EditPage />
      <SiteMediaPicker />
    </SitesProviderWeb>
  );
}

export default SitesEditPage;
