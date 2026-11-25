import { type SiteListItem, type SiteSummary } from '@gruenerator/contracts';
import { Button, SectionHeader, Skeleton } from '@gruenerator/ui';
import { useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { LoadErrorState } from '../components/common/LoadErrorState';
import { SitesSearch } from '../components/SitesSearch';
import { SiteTile } from '../components/SiteTile';
import { useSiteList } from '../hooks/useSite';
import { useSiteProjects } from '../hooks/useSiteSharing';
import { FROM_OVERVIEW_STATE, useAuth, useSitesPaths } from '../SitesContext';

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:gap-4';

function firstName(displayName: string | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

/** Shaped like the page below, so the list lands in place. */
function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Websites werden geladen" aria-busy="true">
      <Skeleton className="mx-auto mt-10 h-9 w-72 bg-grey-200 dark:bg-grey-700" />
      <Skeleton className="mx-auto mt-10 h-[60px] w-full max-w-[760px] rounded-full bg-grey-200 dark:bg-grey-700" />
      <Skeleton className="mb-4 mt-12 h-7 w-44 bg-grey-200 dark:bg-grey-700" />
      <div className={GRID}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-2xl bg-grey-200 dark:bg-grey-700" />
        ))}
      </div>
    </div>
  );
}

/** Sites I created (the personal quota counts these), project sites, and the rest shared with me. */
function groupSites(sites: SiteListItem[]) {
  const mine = sites.filter((s) => s.group === null && s.is_creator);
  const projects = sites.filter((s) => s.group !== null);
  const shared = sites.filter((s) => s.group === null && !s.is_creator);
  return [
    { id: 'sites-mine', title: 'Meine Websites', sites: mine },
    { id: 'sites-projects', title: 'Projekte', sites: projects },
    { id: 'sites-shared', title: 'Mit mir geteilt', sites: shared },
  ].filter((section) => section.sites.length > 0);
}

/**
 * `/sites`, built like Projekte: a greeting, a search over the own sites, then the sites as
 * tiles. Creating happens on its own page (`/sites/erstellen`); without any site that page opens
 * straight away.
 */
export function SitesOverviewPage() {
  const { user } = useAuth();
  const { sites, publicOrigin, limit, isLoading, error, refetch } = useSiteList();
  const projects = useSiteProjects();
  const navigate = useNavigate();
  const paths = useSitesPaths();
  const locale = user?.locale ?? 'de-DE';
  const name = firstName(user?.display_name);

  // Without any site the overview has nothing to show: the first visit starts creating.
  const empty = sites !== null && sites.length === 0;
  useEffect(() => {
    if (empty) void navigate(paths.create, { replace: true });
  }, [empty, navigate, paths]);

  const ownCount = (sites ?? []).filter((site) => site.group === null && site.is_creator).length;
  const canCreateInProject = (projects.data ?? []).some((p) => p.isAdmin);
  // A full personal quota still leaves project sites to project admins.
  const full = !!sites && ownCount >= limit && !canCreateInProject;
  const create = full ? null : () => void navigate(paths.create, { state: FROM_OVERVIEW_STATE });
  const open = (site: SiteSummary) =>
    void navigate(paths.site(site.subdomain), { state: FROM_OVERVIEW_STATE });

  let body;
  if (isLoading || empty) {
    body = <OverviewSkeleton />;
  } else if (error || !sites) {
    body = (
      <LoadErrorState
        title="Deine Websites konnten nicht geladen werden"
        onRetry={() => void refetch()}
      />
    );
  } else {
    const sections = groupSites(sites);
    body = (
      <>
        <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4">
          <h1 className="m-0 text-center font-[Raleway,PT_Sans,Arial,sans-serif] text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading [text-wrap:balance] [overflow-wrap:anywhere] max-sm:text-[21px]">
            {name ? `Deine Websites, ${name}` : 'Deine Websites'}
          </h1>
          <SitesSearch sites={sites} publicOrigin={publicOrigin} onOpen={open} onCreate={create} />
        </div>

        {sections.map((section, index) => (
          <section key={section.id} aria-label={section.title} className="mt-12">
            <SectionHeader
              title={section.title}
              actions={
                index === 0 ? (
                  <div className="flex items-center gap-xs">
                    <span className="text-sm text-grey-600 dark:text-grey-400">
                      {ownCount} von {limit}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Neue Website"
                      title={full ? 'Höchstzahl erreicht' : 'Neue Website'}
                      onClick={() => create?.()}
                      disabled={full}
                    >
                      <FiPlus aria-hidden className="size-[18px]" />
                    </Button>
                  </div>
                ) : undefined
              }
            />
            {index === 0 && full && (
              <p className="mb-md text-sm text-grey-600 dark:text-grey-400">
                Du hast die Höchstzahl an Websites erreicht. Lösche eine, um eine neue anzulegen.
              </p>
            )}
            <ul className={`m-0 list-none p-0 ${GRID}`}>
              {section.sites.map((site) => (
                <li key={site.id}>
                  <SiteTile
                    site={site}
                    href={paths.site(site.subdomain)}
                    publicOrigin={publicOrigin}
                    locale={locale}
                  />
                  {site.group && (
                    <span className="mt-xs block text-xs text-grey-600 dark:text-grey-400">
                      {site.group.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-[image:radial-gradient(ellipse_55%_45%_at_50%_30%,#EAF3F8_0%,#F5F9FB_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_30%,#111D24_0%,#0C1418_55%,#080D10_100%)]">
      <div className="mx-auto w-full max-w-[1200px] px-lg pb-xl pt-8 max-md:px-md max-md:pt-sm">
        {body}
      </div>
    </div>
  );
}
