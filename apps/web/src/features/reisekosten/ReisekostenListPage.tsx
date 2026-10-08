import { computeReisekosten, emptyReisekostenState } from '@gruenerator/shared/reisekosten';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  toast,
} from '@gruenerator/ui';
import { PiPlus, PiReceipt, PiTrash } from 'react-icons/pi';
import { Link, useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';

import { useAbrechnungen, useDeleteAbrechnung } from './api';
import { ExperimentHinweis } from './components/ExperimentHinweis';
import { eur } from './utils/format';

import type { Abrechnung } from '@gruenerator/contracts';

function auszahlung(a: Abrechnung): number {
  // Totals need no private data; the empty address/IBAN do not change them.
  const leer = emptyReisekostenState().stammdaten;
  return computeReisekosten({ ...a.state, stammdaten: { ...leer, ...a.state.stammdaten } })
    .auszahlung;
}

function zeitraum(a: Abrechnung): string {
  const d = a.state.reise.reisebeginn.slice(0, 10);
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString('de-DE') : 'ohne Datum';
}

function ReisekostenListPageInner() {
  const navigate = useNavigate();
  const { data, isLoading } = useAbrechnungen();
  const remove = useDeleteAbrechnung();

  const neu = (
    <Button variant="brand" onClick={() => void navigate('/reisekosten/neu')}>
      <PiPlus aria-hidden /> Neue Abrechnung
    </Button>
  );

  return (
    <PageContainer
      maxWidth="md"
      title="Reisekosten"
      subtitle="Abrechnungen nach dem Formular des Landesverbands NRW – mit Belegen, Prüfliste und fertigem PDF."
    >
      <div className="flex flex-col gap-md">
        <ExperimentHinweis />
        <div className="flex justify-end">{neu}</div>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {data && data.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PiReceipt aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Noch keine Abrechnungen</EmptyTitle>
              <EmptyDescription>
                Wähle eine Veranstaltung, den Rest füllen wir so weit wie möglich vor.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {data && data.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-sm p-0">
            {data.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-md rounded-[14px] border border-grey-200 p-md dark:border-grey-700"
              >
                <Link to={`/reisekosten/${a.slug}`} className="min-w-0 flex-1 no-underline">
                  <span className="block truncate font-semibold text-foreground">
                    {a.titel || 'Ohne Anlass'}
                  </span>
                  <span className="block text-sm text-grey-600 dark:text-grey-400">
                    {zeitraum(a)}
                    {a.state.reise.ziel ? ` · ${a.state.reise.ziel}` : ''}
                  </span>
                </Link>
                <span
                  className={
                    a.status === 'eingereicht'
                      ? 'rounded-full bg-primary-50 px-sm py-xxs text-xs font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-100'
                      : 'rounded-full bg-background-alt px-sm py-xxs text-xs font-semibold text-grey-700 dark:text-grey-300'
                  }
                >
                  {a.status === 'eingereicht' ? 'Eingereicht' : 'Entwurf'}
                </span>
                <span className="w-24 text-right font-semibold tabular-nums">
                  {eur(auszahlung(a))}
                </span>
                <button
                  type="button"
                  aria-label={`${a.titel || 'Abrechnung'} in den Papierkorb`}
                  onClick={() =>
                    remove.mutate(a.id, {
                      onSuccess: () => toast.success('In den Papierkorb verschoben'),
                    })
                  }
                  className="rounded-md p-xs text-grey-500 hover:bg-background-alt hover:text-foreground"
                >
                  <PiTrash aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

export default withAuthRequired(ReisekostenListPageInner, { title: 'Reisekosten' });
