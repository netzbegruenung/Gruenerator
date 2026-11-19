import { EditPage, SiteMediaPicker } from '@gruenerator/sites';

import { useHostAwareBack } from '../../hooks/useHostAwareBack';

import { SitesProviderWeb } from './SitesProviderWeb';

export function SitesEditPage() {
  const back = useHostAwareBack('/');
  return (
    <SitesProviderWeb>
      <EditPage onBack={back} />
      <SiteMediaPicker />
    </SitesProviderWeb>
  );
}

export default SitesEditPage;
