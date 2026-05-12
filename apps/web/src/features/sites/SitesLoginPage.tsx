import { LoginPage } from '@gruenerator/sites';

import { SitesProviderWeb } from './SitesProviderWeb';

export function SitesLoginPage() {
  return (
    <SitesProviderWeb>
      <LoginPage />
    </SitesProviderWeb>
  );
}

export default SitesLoginPage;
