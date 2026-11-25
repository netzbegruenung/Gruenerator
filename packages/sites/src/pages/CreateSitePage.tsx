import { CreateFlow } from '../create/CreateFlow';
import { useSiteList } from '../hooks/useSite';

import { useBackToOverview } from './useBackToOverview';

/** `/sites/neu`: back leads to the overview once there is a site, else out of Sites. */
export function CreateSitePage({ onBack }: { onBack?: () => void }) {
  const { sites } = useSiteList();
  const backToOverview = useBackToOverview();
  const hasSites = sites !== null && sites.length > 0;
  return (
    <CreateFlow
      onBack={hasSites ? backToOverview : onBack}
      ownHandles={sites?.map((site) => site.subdomain)}
    />
  );
}
