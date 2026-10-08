/**
 * Step 2: the claim as a classic desktop form in the order of the paper form,
 * with the belege, the checklist and the totals in a sticky sidebar.
 */
import {
  BELEG_FINDING_FIELDS,
  computeReisekosten,
  pruefliste,
  validateReisekosten,
} from '@gruenerator/shared/reisekosten';
import { Alert, AlertDescription, Button, Skeleton } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { PiArrowLeft, PiEnvelopeSimple, PiFilePdf } from 'react-icons/pi';
import { Link, useParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';

import { useAbrechnung, useFormular } from './api';
import { BelegPanel } from './belege/BelegPanel';
import { ExperimentHinweis } from './components/ExperimentHinweis';
import { ExportDialog } from './components/ExportDialog';
import { Pruefliste } from './components/Pruefliste';
import { SendMailDialog } from './components/SendMailDialog';
import { useAbrechnungEditor, type SaveStatus } from './hooks/useAbrechnungEditor';
import { AntragstellerSection } from './sections/AntragstellerSection';
import { FahrtkostenSection } from './sections/FahrtkostenSection';
import { ReiseSection } from './sections/ReiseSection';
import { SummeSection, UebernachtungSection } from './sections/UebernachtungSection';
import { VerpflegungSection } from './sections/VerpflegungSection';
import { eur } from './utils/format';

import type { Abrechnung } from '@gruenerator/contracts';

const SAVE_LABEL: Record<SaveStatus, string> = {
  gespeichert: 'Gespeichert',
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

  return (
    <div className="flex w-full justify-center px-[clamp(1rem,4vw,2.5rem)] pt-[clamp(1rem,4vw,2rem)] pb-14 max-md:pt-14">
      <div className="flex w-full max-w-[72rem] flex-col gap-md">
        <header className="flex flex-col gap-xs">
          <Link
            to="/reisekosten"
            className="inline-flex w-fit items-center gap-xs text-sm text-grey-600 hover:text-foreground dark:text-grey-400"
          >
            <PiArrowLeft aria-hidden /> Meine Abrechnungen
          </Link>
          <div className="flex flex-wrap items-baseline justify-between gap-sm">
            <h1 className="m-0 text-[clamp(1.375rem,3vw,1.75rem)] leading-tight font-bold text-balance text-foreground-heading">
              Reisekostenabrechnung{state.reise.anlass ? `: ${state.reise.anlass}` : ''}
            </h1>
            <span role="status" className="text-xs text-grey-600 dark:text-grey-400">
              {editor.status === 'eingereicht' ? 'Eingereicht · ' : ''}
              {SAVE_LABEL[editor.saveStatus]}
            </span>
          </div>
        </header>

        <ExperimentHinweis />

        {formular.isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Das offizielle Formular ist auf diesem Server nicht hinterlegt – du kannst alles
              ausfüllen, aber noch kein PDF erstellen.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid items-start gap-lg lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-md">
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
          </div>

          <aside className="flex flex-col gap-lg lg:sticky lg:top-md lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pb-md">
            <div className="flex flex-col gap-sm rounded-[14px] bg-primary-50 p-md dark:bg-primary-950">
              <div className="flex items-baseline justify-between gap-sm">
                <span className="text-sm font-semibold">Auszahlung</span>
                <span className="text-2xl font-bold tabular-nums text-primary-800 dark:text-primary-100">
                  {eur(computed.auszahlung)}
                </span>
              </div>
              <div className="flex flex-col gap-xs">
                <Button
                  variant="brand"
                  onClick={() => setExportOpen(true)}
                  disabled={!formular.data}
                >
                  <PiFilePdf aria-hidden /> PDF herunterladen …
                </Button>
                <Button
                  variant="brand-outline"
                  onClick={() => setMailOpen(true)}
                  disabled={!formular.data}
                >
                  <PiEnvelopeSimple aria-hidden /> Per E-Mail einreichen …
                </Button>
              </div>
            </div>

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

            <section aria-label="Prüfliste" className="flex flex-col gap-sm">
              <h2 className="m-0 text-base font-semibold text-foreground-heading">Prüfliste</h2>
              <Pruefliste punkte={punkte} findings={findings} />
            </section>
          </aside>
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
