/**
 * Settings tab „Umfragen" — the polls the Grünerator created for the person on
 * nuudel.digitalcourage.de, with the participation link to share and the admin
 * link to edit, export or delete the poll there.
 *
 * "Aus der Liste entfernen" deletes our row only: the Grünerator then forgets
 * the admin link and can no longer read the result. The poll stays on nuudel
 * until it expires or the person deletes it on its admin page.
 */
import { type NuudelPoll } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { HiCalendar, HiExternalLink, HiViewList } from 'react-icons/hi';

import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';
import { nuudelPollsQuery, useForgetNuudelPoll, useNuudelPolls } from '../hooks/useNuudelPolls';

function formatCreated(poll: NuudelPoll): string {
  const d = new Date(poll.createdAt);
  const kind = poll.kind === 'date' ? 'Terminfindung' : 'Auswahl';
  return Number.isNaN(d.getTime())
    ? kind
    : `${kind} · angelegt am ${d.toLocaleDateString('de-DE')}`;
}

// One flat list row per poll (settings list pattern: no card, hairline between rows).
function PollRow({ poll }: { poll: NuudelPoll }) {
  const forget = useForgetNuudelPoll();
  const [confirmForget, setConfirmForget] = useState(false);
  const Icon = poll.kind === 'date' ? HiCalendar : HiViewList;

  return (
    <li className="flex flex-col gap-sm py-3">
      <div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-md gap-y-sm sm:grid-cols-[30px_minmax(0,1fr)_auto]">
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200"
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground" title={poll.pollUrl}>
            {poll.title}
          </div>
          <div className="mt-0.5 text-xs text-grey-500">{formatCreated(poll)}</div>
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-xs sm:col-start-3">
          <Button asChild variant="outline" size="sm">
            <a href={poll.pollUrl} target="_blank" rel="noopener noreferrer">
              <HiExternalLink size={12} aria-hidden />
              Öffnen
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={poll.adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${poll.title} bei nuudel verwalten`}
            >
              Verwalten
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={confirmForget}
            onClick={() => setConfirmForget((v) => !v)}
          >
            Aus der Liste entfernen
          </Button>
        </div>
      </div>

      {confirmForget && (
        <div
          role="group"
          aria-label={`${poll.title} aus der Liste entfernen`}
          className="flex flex-col gap-sm rounded-lg bg-background-alt p-sm text-xs text-grey-600 dark:text-grey-300"
        >
          <p className="m-0">
            Der Grünerator vergisst danach den Admin-Link und kann das Ergebnis nicht mehr lesen.
            Die Umfrage selbst bleibt bei nuudel bestehen, bis sie abläuft oder du sie unter
            „Verwalten“ löschst.
          </p>
          <div className="flex flex-wrap items-center gap-xs">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={forget.isPending}
              onClick={() => forget.mutate(poll.id)}
            >
              {forget.isPending ? 'Wird entfernt …' : 'Entfernen'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmForget(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(nuudelPollsQuery);
};

export default function NuudelTab() {
  const { data, isPending, isError } = useNuudelPolls();
  const polls = data?.polls ?? [];

  if (isPending) return <SettingsCardsSkeleton cards={2} />;

  return (
    // Settings design: no tab title, the section heading carries the name.
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-sm gap-y-xs pb-1">
        <h2 className="m-0 font-[Raleway] text-[15px] font-semibold text-foreground-heading">
          Umfragen
        </h2>
        <span className="self-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-200">
          Experimentell
        </span>
      </div>

      <div className="flex max-w-[64ch] flex-col gap-xs pb-sm text-sm text-grey-500">
        <p className="m-0">
          Umfragen und Terminfindungen, die der Grünerator für dich auf nuudel.digitalcourage.de
          angelegt hat. Im Chat kann er ihr Ergebnis lesen, zum Beispiel welcher Termin am besten
          passt.
        </p>
        <p className="m-0 text-xs">
          Beim Anlegen gehen dein Name und deine E-Mail-Adresse an nuudel (Digitalcourage e.V.);
          nuudel schickt dir Teilnahme- und Admin-Link. Der Grünerator speichert Titel und beide
          Links.
          {data && ` Höchstens ${data.limitPerDay} neue Umfragen in 24 Stunden.`}
        </p>
      </div>

      {isError ? (
        <p className="m-0 border-t border-grey-200 py-md text-sm text-grey-500 dark:border-grey-800">
          Umfragen konnten nicht geladen werden.
        </p>
      ) : polls.length === 0 ? (
        <p className="m-0 border-t border-grey-200 py-md text-sm text-grey-500 dark:border-grey-800">
          Noch keine Umfrage. Schreib im Chat zum Beispiel: „Mach eine Terminumfrage für unser
          nächstes Ortsverbandstreffen, Dienstag oder Donnerstag ab 19 Uhr.“
        </p>
      ) : (
        <ul className="m-0 list-none divide-y divide-grey-200 border-t border-grey-200 p-0 dark:divide-grey-800 dark:border-grey-800">
          {polls.map((poll) => (
            <PollRow key={poll.id} poll={poll} />
          ))}
        </ul>
      )}
    </div>
  );
}
