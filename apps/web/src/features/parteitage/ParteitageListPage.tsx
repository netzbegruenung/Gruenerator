import {
  HiCalendar,
  HiChevronRight,
  HiLockClosed,
  HiLockOpen,
  HiOutlineBuildingOffice,
  HiOutlineMapPin,
  HiOutlinePlay,
} from 'react-icons/hi2';
import { Link } from 'react-router-dom';

import { PageHero, PageShell } from '../../components/common/PageHero';

import { formatDateRange } from './formatDateRange';
import { useConventions } from './hooks/useParteitage';

import type { ConventionSummary } from '@gruenerator/contracts';
import type { ReactNode } from 'react';

const todayIso = () => new Date().toISOString().slice(0, 10);

function statusOf(c: ConventionSummary): { label: string; icon: ReactNode } {
  if (c.locked) return { label: 'Gesperrt', icon: <HiLockClosed aria-hidden="true" /> };
  if (c.speechCount === 0 && c.startsOn > todayIso()) {
    return { label: 'Steht bevor', icon: <HiCalendar aria-hidden="true" /> };
  }
  return { label: 'Entsperrt', icon: <HiLockOpen aria-hidden="true" /> };
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-foreground-muted">
      <span aria-hidden="true" className="flex shrink-0 text-base">
        {icon}
      </span>
      {children}
    </li>
  );
}

function ConventionTile({ c }: { c: ConventionSummary }) {
  const status = statusOf(c);
  const upcoming = status.label === 'Steht bevor';
  const cta = c.locked ? 'Passwort eingeben' : 'Reden öffnen';
  return (
    <li>
      <Link
        to={`/parteitage/${c.slug}`}
        className="flex h-full flex-col overflow-hidden rounded-lg border border-grey-200 bg-background text-foreground no-underline transition-colors duration-150 hover:border-primary-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:border-grey-700"
      >
        <span className="flex items-start justify-between gap-sm border-b border-grey-200 bg-primary-500/10 px-md py-sm dark:border-grey-700">
          <span className="flex flex-col">
            <span className="text-lg leading-tight font-bold text-foreground-heading">
              {c.shortTitle}
            </span>
            <span className="text-sm text-foreground-muted">
              {formatDateRange(c.startsOn, c.endsOn)}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-grey-200 bg-background px-2 py-0.5 text-xs font-medium text-foreground dark:border-grey-700">
            {status.icon}
            {status.label}
          </span>
        </span>
        <span className="flex flex-1 flex-col gap-sm p-md">
          <span className="text-base font-semibold text-foreground">{c.title}</span>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            <Fact icon={<HiOutlineBuildingOffice />}>{c.organizer}</Fact>
            <Fact icon={<HiOutlineMapPin />}>{c.location}</Fact>
            <Fact icon={<HiOutlinePlay />}>
              {c.locked
                ? 'Reden nach Passwort'
                : c.speechCount > 0
                  ? `${c.speechCount} Reden`
                  : 'Noch keine Reden'}
            </Fact>
          </ul>
          {upcoming ? (
            <span className="text-sm text-foreground-muted">
              Die Reels erscheinen kurz nach dem Parteitag.
            </span>
          ) : null}
          <span className="mt-auto flex items-center justify-between pt-sm text-sm font-semibold text-primary-600 dark:text-primary-300">
            {cta}
            <HiChevronRight aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function ParteitageListPage() {
  const { data, isLoading, isError } = useConventions();

  return (
    <PageShell wide>
      <PageHero
        title="Parteitage"
        description={
          <p className="m-0 text-sm text-foreground-muted">
            Reden von Parteitagen als Reels, zum Untertiteln und Schneiden.
          </p>
        }
      />
      {isLoading ? (
        <p className="m-0 text-sm text-foreground-muted">Lädt …</p>
      ) : isError || !data ? (
        <p role="alert" className="m-0 text-sm text-foreground-muted">
          Die Parteitage konnten nicht geladen werden.
        </p>
      ) : data.length === 0 ? (
        <p className="m-0 text-sm text-foreground-muted">Noch keine Parteitage vorhanden.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-md p-0">
          {data.map((c) => (
            <ConventionTile key={c.id} c={c} />
          ))}
        </ul>
      )}
    </PageShell>
  );
}
