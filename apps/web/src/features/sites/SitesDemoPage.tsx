import { DemoPage } from '@gruenerator/sites';

import { SitesProviderWeb } from './SitesProviderWeb';

export function SitesDemoPage() {
  return (
    <SitesProviderWeb>
      <DemoPage />
    </SitesProviderWeb>
  );
}

export default SitesDemoPage;
