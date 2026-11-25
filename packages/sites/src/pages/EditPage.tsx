import { Button } from '@gruenerator/ui';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { LoadErrorState } from '../components/common/LoadErrorState';
import { EditorSkeleton } from '../editor/EditorSkeleton';
import { SiteEditor } from '../editor/SiteEditor';
import { CurrentSiteProvider, useSiteByHandle } from '../hooks/useSite';
import { useSitesPaths } from '../SitesContext';

import { useBackToOverview } from './useBackToOverview';

interface EditPageProps {
  /** The address (or id) from the URL `/sites/<handle>`. */
  handle: string;
}

export function EditPage({ handle }: EditPageProps) {
  const { site, role, publicOrigin, isLoading, error, refetch } = useSiteByHandle(handle);
  const navigate = useNavigate();
  const routeState: unknown = useLocation().state;
  const paths = useSitesPaths();
  const back = useBackToOverview();

  // An address change (or an id in the URL) moves the editor to the site's current address.
  const canonical = site && site.subdomain !== handle ? site.subdomain : null;
  useEffect(() => {
    if (canonical) void navigate(paths.site(canonical), { replace: true, state: routeState });
  }, [canonical, navigate, paths, routeState]);

  if (isLoading) return <EditorSkeleton label="Seite wird geladen" />;

  if (error) {
    return <LoadErrorState onRetry={() => void refetch()} />;
  }

  if (!site || !role) {
    return (
      <div
        role="alert"
        className="flex min-h-full flex-col items-center justify-center gap-md p-lg text-center"
      >
        <h2 className="m-0 text-lg text-foreground">Website nicht gefunden</h2>
        <p className="m-0 text-grey-600 dark:text-grey-400">
          Unter dieser Adresse hast du keine Website.
        </p>
        <Button onClick={() => void navigate(paths.overview)}>Zu deinen Websites</Button>
      </div>
    );
  }

  return (
    <CurrentSiteProvider value={{ site, role, public_origin: publicOrigin }}>
      <SiteEditor key={site.id} site={site} role={role} onBack={back} />
    </CurrentSiteProvider>
  );
}
