import { type SiteListItem, type SiteSummary } from '@gruenerator/contracts';
import { Badge, Button, Skeleton } from '@gruenerator/ui';
import { useEffect } from 'react';
import { FiPlus } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';

import { BackButton } from '../components/common/BackButton';
import { LoadErrorState } from '../components/common/LoadErrorState';
import { useSiteList } from '../hooks/useSite';
import { FROM_OVERVIEW_STATE, useSitesPaths } from '../SitesContext';
import { formatAddress } from '../utils/siteAddress';

/** Shaped like the card grid below, so the list lands in place. */
function OverviewSkeleton() {
  return (
    <div
      role="status"
      aria-label="Websites werden geladen"
      aria-busy="true"
      className="min-h-full px-md py-xl lg:px-xl"
    >
      <div className="mx-auto w-full max-w-[960px]">
        <div className="mb-lg flex items-center gap-sm">
          <Skeleton className="h-8 flex-1 max-w-56 bg-grey-200 dark:bg-grey-700" />
          <Skeleton className="ml-auto h-9 w-36 bg-grey-200 dark:bg-grey-700" />
        </div>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg bg-grey-200 dark:bg-grey-700" />
          ))}
        </div>
      </div>
    </div>
  );
}

function statusLabel(site: SiteSummary): string {
  if (site.moderation !== 'ok') return 'Ausgeblendet';
  return site.is_published ? 'Veröffentlicht' : 'Entwurf';
}

function editedLabel(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Zuletzt bearbeitet am ${date.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

function SiteCard({ site, publicOrigin }: { site: SiteListItem; publicOrigin: string | null }) {
  const paths = useSitesPaths();
  const edited = editedLabel(site.updated_at);
  return (
    <li>
      <Link
        to={paths.site(site.subdomain)}
        state={FROM_OVERVIEW_STATE}
        className="flex h-full flex-col gap-xs rounded-lg border border-grey-200 bg-background p-md text-inherit no-underline transition-colors hover:border-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 dark:border-grey-700"
      >
        <span className="flex items-start justify-between gap-sm">
          <span className="text-base font-semibold text-foreground">{site.site_title}</span>
          <Badge variant={site.is_published ? 'default' : 'secondary'}>{statusLabel(site)}</Badge>
        </span>
        <span className="break-all text-sm text-grey-600 dark:text-grey-400">
          {formatAddress(publicOrigin, site.subdomain)}
        </span>
        {site.group && (
          <span className="text-xs text-grey-600 dark:text-grey-400">{site.group.name}</span>
        )}
        {edited && (
          <span className="mt-auto text-xs text-grey-600 dark:text-grey-400">{edited}</span>
        )}
      </Link>
    </li>
  );
}

/**
 * Own sites (no project, I am admin), project sites, and the rest shared with me. The list item
 * does not say who created a site, so an own-account admin site counts as "Meine Websites".
 */
function groupSites(sites: SiteListItem[]) {
  const mine = sites.filter((s) => s.group === null && s.role === 'admin');
  const projects = sites.filter((s) => s.group !== null);
  const shared = sites.filter((s) => s.group === null && s.role !== 'admin');
  return [
    { id: 'sites-mine', title: 'Meine Websites', sites: mine },
    { id: 'sites-projects', title: 'Projekte', sites: projects },
    { id: 'sites-shared', title: 'Mit mir geteilt', sites: shared },
  ].filter((section) => section.sites.length > 0);
}

export function SitesOverviewPage({ onBack }: { onBack?: () => void }) {
  const { sites, publicOrigin, limit, isLoading, error, refetch } = useSiteList();
  const navigate = useNavigate();
  const paths = useSitesPaths();

  // Without any site the overview has nothing to show: the first visit starts creating.
  const empty = sites !== null && sites.length === 0;
  useEffect(() => {
    if (empty) void navigate(paths.create, { replace: true });
  }, [empty, navigate, paths]);

  if (isLoading || empty) return <OverviewSkeleton />;
  if (error || !sites) {
    return (
      <LoadErrorState
        title="Deine Websites konnten nicht geladen werden"
        onRetry={() => void refetch()}
      />
    );
  }

  const sections = groupSites(sites);
  const ownCount = sites.filter((site) => site.group === null && site.role === 'admin').length;
  const full = ownCount >= limit;

  return (
    <div className="min-h-full px-md py-xl lg:px-xl">
      <div className="mx-auto w-full max-w-[960px]">
        <div className="mb-lg flex flex-wrap items-center gap-sm">
          {onBack && <BackButton onBack={onBack} />}
          <h1 className="m-0 flex-1 text-[length:var(--font-size-2xl)] font-semibold text-primary-800 dark:text-primary-300">
            Deine Websites
          </h1>
          <span className="text-sm text-grey-600 dark:text-grey-400">
            {ownCount} von {limit}
          </span>
          <Button
            onClick={() => void navigate(paths.create, { state: FROM_OVERVIEW_STATE })}
            disabled={full}
          >
            <FiPlus aria-hidden="true" />
            Neue Website
          </Button>
        </div>
        {full && (
          <p className="mb-md text-sm text-grey-600 dark:text-grey-400">
            Du hast die Höchstzahl an Websites erreicht. Lösche eine, um eine neue anzulegen.
          </p>
        )}

        {sections.map((section) => (
          <section key={section.title} aria-labelledby={section.id} className="mb-xl">
            <h2
              id={section.id}
              className="mb-sm text-lg font-semibold text-primary-800 dark:text-primary-300"
            >
              {section.title}
            </h2>
            <ul className="m-0 grid list-none grid-cols-1 gap-md p-0 sm:grid-cols-2 lg:grid-cols-3">
              {section.sites.map((site) => (
                <SiteCard key={site.id} site={site} publicOrigin={publicOrigin} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
