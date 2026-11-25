import { SectionHeader, Skeleton } from '@gruenerator/ui';

import { LoadErrorState } from '../components/common/LoadErrorState';
import { SiteTile } from '../components/SiteTile';
import { CreateFlow } from '../create/CreateFlow';
import { useSiteList } from '../hooks/useSite';
import { useAuth, useSitesPaths } from '../SitesContext';

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:gap-4';

function firstName(displayName: string | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || null;
}

/**
 * `/sites`: create and overview on one page, like Projekte and Office — a heading, the create
 * composer, then the own sites as tiles. Without a site the composer is the whole page.
 */
export function SitesOverviewPage() {
  const { user } = useAuth();
  const { sites, publicOrigin, limit, isLoading, error, refetch } = useSiteList();
  const paths = useSitesPaths();
  const locale = user?.locale ?? 'de-DE';
  const name = firstName(user?.display_name);
  const hasSites = !!sites && sites.length > 0;
  const full = !!sites && sites.length >= limit;

  const title = hasSites
    ? name
      ? `Deine Websites, ${name}`
      : 'Deine Websites'
    : 'Deine Kandidat*innen-Seite';

  const header = (
    <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4">
      <h1 className="mb-2 text-center font-[Raleway,PT_Sans,Arial,sans-serif] text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading [text-wrap:balance] [overflow-wrap:anywhere] max-sm:text-[21px]">
        {title}
      </h1>
      <p className="mb-8 text-center text-[15px] text-grey-600 [text-wrap:balance] dark:text-grey-400 max-sm:text-sm">
        Beschreib dich oder lade einen Flyer hoch, die KI baut daraus deine Website.
      </p>
    </div>
  );

  return (
    <div className="min-h-dvh bg-[image:radial-gradient(ellipse_55%_45%_at_50%_30%,#EAF3F8_0%,#F5F9FB_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_30%,#111D24_0%,#0C1418_55%,#080D10_100%)]">
      <CreateFlow
        className="mx-auto w-full max-w-[1200px] px-lg pb-xl pt-8 max-md:px-md max-md:pt-sm"
        header={header}
        ownHandles={sites?.map((s) => s.subdomain)}
        disabledReason={
          full
            ? `Du hast die Höchstzahl von ${limit} Websites erreicht. Lösche eine, um eine neue anzulegen.`
            : null
        }
      >
        {isLoading ? (
          <section aria-label="Websites werden geladen" aria-busy="true" className="mt-12">
            <Skeleton className="mb-4 h-7 w-44 bg-grey-200 dark:bg-grey-700" />
            <div className={GRID}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64 rounded-2xl bg-grey-200 dark:bg-grey-700" />
              ))}
            </div>
          </section>
        ) : error || !sites ? (
          <LoadErrorState
            title="Deine Websites konnten nicht geladen werden"
            onRetry={() => void refetch()}
          />
        ) : hasSites ? (
          <section className="mt-12">
            <SectionHeader
              title="Deine Websites"
              actions={
                <span className="text-sm text-grey-600 dark:text-grey-400">
                  {sites.length} von {limit}
                </span>
              }
            />
            <ul className={`m-0 list-none p-0 ${GRID}`}>
              {sites.map((site) => (
                <li key={site.id}>
                  <SiteTile
                    site={site}
                    href={paths.site(site.subdomain)}
                    publicOrigin={publicOrigin}
                    locale={locale}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CreateFlow>
    </div>
  );
}
