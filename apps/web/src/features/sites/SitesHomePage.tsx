import { HomePage } from '@gruenerator/sites';

import { SitesProviderWeb } from './SitesProviderWeb';

export function SitesHomePage() {
  return (
    <SitesProviderWeb>
      <HomePage />
    </SitesProviderWeb>
  );
}

export default SitesHomePage;
