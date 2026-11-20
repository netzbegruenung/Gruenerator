import { useLocation, useNavigate } from 'react-router-dom';

import { useSitesPaths } from '../SitesContext';

/**
 * Back from the editor or the create page: a step back when the overview opened it,
 * otherwise to the overview in place of this entry, so back never ping-pongs.
 */
export function useBackToOverview(): () => void {
  const navigate = useNavigate();
  const state: unknown = useLocation().state;
  const paths = useSitesPaths();
  const fromOverview = (state as { fromOverview?: unknown } | null)?.fromOverview === true;
  return () => {
    if (fromOverview) void navigate(-1);
    else void navigate(paths.overview, { replace: true });
  };
}
