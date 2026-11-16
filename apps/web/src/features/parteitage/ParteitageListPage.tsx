import { HiLockClosed } from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import { PageHero, PageShell } from '../../components/common/PageHero';

import { useConventions } from './hooks/useParteitage';

export default function ParteitageListPage() {
  const { data, isLoading, isError } = useConventions();

  return (
    <PageShell wide>
      <PageHero
        title="Parteitage"
        description={
          <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
            Reden von Parteitagen als Reels, zum Untertiteln und Schneiden.
          </p>
        }
      />
      {isLoading ? (
        <p className="m-0 text-sm text-grey-500">Lädt …</p>
      ) : isError || !data ? (
        <p role="alert" className="m-0 text-sm text-grey-500">
          Die Parteitage konnten nicht geladen werden.
        </p>
      ) : data.length === 0 ? (
        <p className="m-0 text-sm text-grey-500">Noch keine Parteitage vorhanden.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-md p-0">
          {data.map((c) => (
            <li key={c.id}>
              <Link
                to={`/parteitage/${c.slug}`}
                className="flex h-full flex-col gap-xs rounded-md bg-background-alt p-md text-foreground no-underline"
              >
                <span className="text-base font-semibold">{c.title}</span>
                <span className="text-sm text-grey-500 dark:text-grey-400">
                  {c.organizer} · {c.location}
                </span>
                <span className="flex items-center gap-xs text-xs text-grey-500 dark:text-grey-400">
                  {c.locked ? (
                    <>
                      <HiLockClosed aria-hidden="true" /> Passwort nötig
                    </>
                  ) : (
                    `${c.speechCount} Reden`
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
