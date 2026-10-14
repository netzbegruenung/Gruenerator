/**
 * Step 2: the claim as a classic desktop form in the order of the paper form,
 * with the belege and the checklist in a sidebar and the payout plus the
 * export actions in a bar pinned to the bottom.
 */
import {
  BELEG_FINDING_FIELDS,
  computeReisekosten,
  pruefliste,
  validateReisekosten,
} from '@gruenerator/shared/reisekosten';
import {
  Alert,
  AlertDescription,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import {
  PiArrowLeft,
  PiCalendarBlank,
  PiCaretUp,
  PiEnvelopeSimple,
  PiFilePdf,
} from 'react-icons/pi';
import { Link, useParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';

import { useAbrechnung, useFormular } from './api';
import { BelegPanel } from './belege/BelegPanel';
import { DatumKachel } from './components/DatumKachel';
import { ExperimentHinweis } from './components/ExperimentHinweis';
import { ExportDialog } from './components/ExportDialog';
import { Pruefliste } from './components/Pruefliste';
import { SendMailDialog } from './components/SendMailDialog';
import { useAbrechnungEditor, type SaveStatus } from './hooks/useAbrechnungEditor';
import { AnmerkungenSection } from './sections/AnmerkungenSection';
import { AntragstellerSection } from './sections/AntragstellerSection';
import { FahrtkostenSection } from './sections/FahrtkostenSection';
import { ReiseSection } from './sections/ReiseSection';
import { SummeSection, UebernachtungSection } from './sections/UebernachtungSection';
import { VerpflegungSection } from './sections/VerpflegungSection';
import { eur, ortVon, zeitraumMitOrt } from './utils/format';

import type { Abrechnung } from '@gruenerator/contracts';

const SAVE_LABEL: Record<SaveStatus, string> = {
  gespeichert: 'Automatisch gespeichert',
  speichert: 'Speichert …',
  fehler: 'Nicht gespeichert – Verbindung prüfen',
};

function Editor({ abrechnung }: { abrechnung: Abrechnung }) {
  const editor = useAbrechnungEditor(abrechnung);
  const { state, update, belege } = editor;
  const formular = useFormular(state.rateKey);
  const [exportOpen, setExportOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);

  const computed = useMemo(() => computeReisekosten(state), [state]);
  const findings = useMemo(
    () => validateReisekosten(state).filter((f) => !BELEG_FINDING_FIELDS.has(f.field)),
    [state]
  );
  const punkte = useMemo(() => pruefliste(state, belege), [state, belege]);

  const offen =
    findings.filter((f) => f.level === 'error').length +
    punkte.filter((p) => p.status === 'fehlt').length;
  const erledigt = punkte.filter((p) => p.status === 'ok').length;
  const pruefGesamt = offen + erledigt;
  const { reise } = state;

  return (
    <div className="flex w-full flex-col items-center">
      <div className="flex w-full max-w-[1180px] flex-col gap-7 px-[clamp(1rem,4vw,2rem)] pt-[clamp(1.5rem,5vw,3.5rem)] pb-10 max-md:pt-14">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Link
              to="/reisekosten"
              aria-label="Zurück zu meinen Abrechnungen"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-grey-100 text-foreground transition-colors hover:bg-grey-200 dark:bg-grey-800 dark:hover:bg-grey-700"
            >
              <PiArrowLeft aria-hidden className="size-[18px]" />
            </Link>
            <h1 className="m-0 text-[clamp(28px,3.4vw,36px)] leading-[1.15] font-extrabold tracking-[-0.02em] text-foreground-heading">
              Reisekostenabrechnung
            </h1>
          </div>
          <span
            role="status"
            className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
          >
            <span
              aria-hidden
              className={
                editor.saveStatus === 'fehler'
                  ? 'size-[7px] rounded-full bg-destructive'
                  : 'size-[7px] rounded-full bg-primary'
              }
            />
            {editor.status === 'eingereicht' ? 'Eingereicht · ' : ''}
            {SAVE_LABEL[editor.saveStatus]}
          </span>
        </header>

        {formular.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Das offizielle Formular ist auf diesem Server nicht hinterlegt – du kannst alles
              ausfüllen, aber noch kein PDF erstellen.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21.25rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <AntragstellerSection state={state} update={update} />
            <ReiseSection state={state} update={update} />
            <FahrtkostenSection state={state} update={update} computed={computed} belege={belege} />
            <VerpflegungSection state={state} update={update} computed={computed} />
            <UebernachtungSection
              state={state}
              update={update}
              computed={computed}
              belege={belege}
            />
            <SummeSection state={state} update={update} computed={computed} />
            <AnmerkungenSection state={state} update={update} />
          </div>

          <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pb-md">
            <BelegPanel
              belege={belege}
              uploads={editor.uploads}
              lokaleDateien={editor.lokaleDateien}
              onFiles={(files) => void editor.addFiles(files)}
              onChange={editor.updateBeleg}
              onRemove={editor.removeBeleg}
              onReplace={(belegId, file) => void editor.replaceBelegFile(belegId, file)}
              onDismissUpload={editor.dismissUpload}
            />

            <section aria-label="Prüfliste" className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between">
                <h2 className="m-0 text-[17px] font-bold text-foreground-heading">Prüfliste</h2>
                {pruefGesamt > 0 && (
                  <span className="text-[13px] text-muted-foreground">
                    {erledigt} von {pruefGesamt}
                  </span>
                )}
              </div>
              {pruefGesamt > 0 && (
                <div
                  role="progressbar"
                  aria-label="Fortschritt der Prüfliste"
                  aria-valuemin={0}
                  aria-valuemax={pruefGesamt}
                  aria-valuenow={erledigt}
                  className="h-1.5 overflow-hidden rounded-full bg-grey-100 dark:bg-grey-800"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${Math.round((erledigt / pruefGesamt) * 100)}%` }}
                  />
                </div>
              )}
              {pruefGesamt > 0 && offen === 0 && (
                <span className="text-sm font-bold text-primary-700 dark:text-primary-300">
                  Alles ausgefüllt – bereit zum Einreichen.
                </span>
              )}
              <Pruefliste punkte={punkte} findings={findings} />
            </section>
          </aside>
        </div>

        <ExperimentHinweis />
      </div>

      <div className="sticky bottom-0 z-10 w-full bg-background-pure px-[clamp(1rem,4vw,2rem)] py-3.5 shadow-[0_-1px_0_rgba(20,40,30,.06),0_-8px_24px_rgba(20,40,30,.06)] dark:shadow-[0_-1px_0_var(--color-grey-700)]">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-5">
          <div className="flex min-w-0 flex-[1_1_280px] items-center gap-3">
            <DatumKachel
              klein
              {...(reise.reisebeginn ? { iso: reise.reisebeginn } : {})}
              icon={<PiCalendarBlank className="size-5" />}
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] leading-snug font-bold">
                {reise.anlass || 'Eigene Reise'}
              </span>
              <span className="truncate text-[13px] text-muted-foreground">
                {zeitraumMitOrt(
                  { beginn: reise.reisebeginn, ende: reise.rueckkehr },
                  ortVon(reise.ziel)
                ) || 'Reisezeitraum noch offen'}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex flex-col items-end px-1">
              <span className="text-xs text-muted-foreground">Auszahlung</span>
              <span className="font-[Raleway,sans-serif] text-2xl leading-[1.1] font-extrabold tracking-[-0.01em] tabular-nums text-primary-700 dark:text-primary-300">
                {eur(computed.auszahlung)}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="brand" disabled={!formular.data}>
                  Abschließen <PiCaretUp aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={10}
                className="min-w-60 rounded-[14px] p-1.5"
              >
                <DropdownMenuItem
                  onSelect={() => setExportOpen(true)}
                  className="gap-3 rounded-[10px] px-3 py-2.5 text-[15px]"
                >
                  <PiFilePdf aria-hidden className="size-[18px] text-primary" /> PDF herunterladen …
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setMailOpen(true)}
                  className="gap-3 rounded-[10px] px-3 py-2.5 text-[15px]"
                >
                  <PiEnvelopeSimple aria-hidden className="size-[18px] text-primary" /> Per E-Mail
                  einreichen …
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Mounted on open, so each opening starts from the current belege. */}
      {exportOpen && (
        <ExportDialog
          open
          onOpenChange={setExportOpen}
          abrechnungId={abrechnung.id}
          formular={formular.data}
          state={state}
          belege={belege}
          lokaleDateien={editor.lokaleDateien}
          tage={computed.verpflegung.tage.length}
        />
      )}
      {mailOpen && (
        <SendMailDialog
          open
          onOpenChange={setMailOpen}
          abrechnungId={abrechnung.id}
          formular={formular.data}
          state={state}
          computed={computed}
          belege={belege}
          lokaleDateien={editor.lokaleDateien}
          onGesendet={() => editor.setStatus('eingereicht')}
        />
      )}
    </div>
  );
}

function AbrechnungPageInner() {
  const { slug = '' } = useParams();
  const { data, isLoading, isError } = useAbrechnung(slug);

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-md p-lg">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-xl p-lg">
        <Alert variant="destructive">
          <AlertDescription>
            Diese Abrechnung gibt es nicht (mehr). <Link to="/reisekosten">Zur Übersicht</Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  // Keyed by id: a different Abrechnung gets a fresh editor state.
  return <Editor key={data.id} abrechnung={data} />;
}

export default withAuthRequired(AbrechnungPageInner, { title: 'Reisekostenabrechnung' });
