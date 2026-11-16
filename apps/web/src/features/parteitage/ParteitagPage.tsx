import { type ConventionDetail, type ConventionSpeechPublic } from '@gruenerator/contracts';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';
import { useState } from 'react';
import {
  HiOutlineCalendar,
  HiOutlineChevronDown,
  HiOutlineDocumentText,
  HiOutlineMapPin,
  HiOutlineBuildingOffice,
  HiOutlinePlay,
} from 'react-icons/hi2';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PageHero, PageShell } from '../../components/common/PageHero';

import { SpeechDetail } from './components/SpeechDetail';
import { SpeechFilterBar, SpeechGrid, type SpeechToolbarFilters } from './components/SpeechGrid';
import { UnlockDialog } from './components/UnlockDialog';
import { formatDateRange } from './formatDateRange';
import { useConvention, useUnlockConvention } from './hooks/useParteitage';
import { ParteitagStats } from './stats/ParteitagStats';
import { useParteitagFilters } from './stats/useParteitagFilters';

import type { ReactNode } from 'react';

const NO_TOOLBAR_FILTERS: SpeechToolbarFilters = {
  search: '',
  day: null,
  kv: null,
  seatType: null,
};

export function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Brotkrumen">
      <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-sm text-foreground-muted">
        <li>
          <Link to="/parteitage" className="text-foreground-muted underline underline-offset-2">
            Parteitage
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}

function MetaItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="flex text-base">
        {icon}
      </span>
      {children}
    </span>
  );
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-sm text-foreground-muted">
      <strong className="text-base font-bold text-foreground-heading tabular-nums">{value}</strong>{' '}
      {label}
    </span>
  );
}

function ConventionHeader({ convention }: { convention: ConventionDetail }) {
  const days = new Set(convention.speeches.map((s) => s.day)).size;
  const places = new Set(convention.speeches.map((s) => s.listPlace)).size;
  return (
    <header className="flex flex-col gap-sm">
      <Breadcrumb current={convention.shortTitle} />
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-sm">
          <h1 className="m-0 text-[clamp(1.375rem,3vw,1.75rem)] leading-tight font-bold text-balance text-foreground-heading">
            {convention.title}
          </h1>
          <p className="m-0 flex flex-wrap gap-x-md gap-y-1 text-sm text-foreground-muted">
            <MetaItem icon={<HiOutlineBuildingOffice />}>{convention.organizer}</MetaItem>
            <MetaItem icon={<HiOutlineMapPin />}>{convention.location}</MetaItem>
            <MetaItem icon={<HiOutlineCalendar />}>
              {formatDateRange(convention.startsOn, convention.endsOn)}
            </MetaItem>
          </p>
          <p className="m-0 flex flex-wrap gap-x-md gap-y-1">
            <Figure value={convention.speechCount} label="Reden" />
            <Figure value={days} label={days === 1 ? 'Tag' : 'Tage'} />
            <Figure value={places} label="Listenplätze mit Reden" />
          </p>
        </div>
        {convention.reportUrl || convention.sourceLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-xs">
            {convention.sourceLinks.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="brand-outline" size="brand-sm">
                    <HiOutlinePlay aria-hidden="true" />
                    Livestreams
                    <HiOutlineChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {convention.sourceLinks.map((link) => (
                    <DropdownMenuItem key={link.url} asChild>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {convention.reportUrl ? (
              <Button asChild variant="brand-outline" size="brand-sm">
                <a href={`${convention.reportUrl}?download=1`}>
                  <HiOutlineDocumentText aria-hidden="true" />
                  Bericht (PDF)
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default function ParteitagPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useConvention(slug);
  const unlock = useUnlockConvention(slug);
  const navigate = useNavigate();
  const [toolbar, setToolbar] = useState<SpeechToolbarFilters>(NO_TOOLBAR_FILTERS);
  const [statFilters, setStatFilters] = useParteitagFilters();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<ConventionSpeechPublic | null>(null);
  const tab = params.get('ansicht') === 'statistik' ? 'statistik' : 'reden';

  const setTab = (next: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'statistik') p.set('ansicht', 'statistik');
        else p.delete('ansicht');
        return p;
      },
      { replace: true }
    );

  if (isLoading) {
    return (
      <PageShell wide>
        <PageHero title="Parteitag" />
        <p className="m-0 text-sm text-foreground-muted">Lädt …</p>
      </PageShell>
    );
  }

  if (isError || !data) {
    return (
      <PageShell wide>
        <PageHero title="Parteitag" />
        <p role="alert" className="m-0 text-sm text-foreground-muted">
          Dieser Parteitag ist nicht verfügbar.
        </p>
        <Link to="/parteitage">Zurück zu den Parteitagen</Link>
      </PageShell>
    );
  }

  if (data.locked) {
    return (
      <PageShell wide>
        <Breadcrumb current="Gesperrt" />
        <PageHero title="Parteitag" />
        <UnlockDialog
          title="Dieser Parteitag ist geschützt"
          busy={unlock.isPending}
          onUnlock={(password) => unlock.mutateAsync(password).catch(() => 'error' as const)}
          onCancel={() => navigate('/parteitage')}
        />
      </PageShell>
    );
  }

  const { convention } = data;
  return (
    <PageShell wide>
      <ConventionHeader convention={convention} />
      <Tabs value={tab} onValueChange={setTab} className="gap-md">
        <TabsList
          variant="line"
          className="h-10 w-full justify-start border-b border-grey-200 dark:border-grey-700"
        >
          <TabsTrigger value="reden" className="flex-none px-3 text-base">
            Reden{' '}
            <span className="text-foreground-muted tabular-nums">{convention.speechCount}</span>
          </TabsTrigger>
          <TabsTrigger value="statistik" className="flex-none px-3 text-base">
            Statistik
          </TabsTrigger>
        </TabsList>
        <TabsContent value="reden" className="flex flex-col gap-md">
          <SpeechFilterBar
            speeches={convention.speeches}
            value={toolbar}
            onChange={setToolbar}
            stats={statFilters}
            onResetStats={() =>
              setStatFilters({
                area: null,
                seatType: null,
                topic: null,
                day: null,
                outcome: null,
                kreis: null,
              })
            }
          />
          <SpeechGrid
            speeches={convention.speeches}
            filters={{ ...toolbar, stats: statFilters }}
            onSelect={setSelected}
          />
        </TabsContent>
        <TabsContent value="statistik">
          <ParteitagStats
            stats={convention.stats}
            speeches={convention.speeches}
            filters={statFilters}
            onFilter={setStatFilters}
          />
        </TabsContent>
      </Tabs>
      <SpeechDetail speech={selected} onClose={() => setSelected(null)} />
    </PageShell>
  );
}
