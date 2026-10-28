import {
  type BundestagAuftrag,
  type BundestagFilter,
  type BundestagPlanResponse,
  bundestagDrucksachetypSchema,
  bundestagUrheberSchema,
} from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';

import { useBundestagAnswer, useBundestagPlan } from './useBundestagQa';

const MAX_REFS = 12;
const TYPEN = bundestagDrucksachetypSchema.options;
const URHEBER = bundestagUrheberSchema.options;

const fieldClass =
  'rounded-md border border-border bg-background px-sm py-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

/** Leere Listen/Strings weglassen: DIP liest `[]` sonst als „kein Filter". */
function cleanFilters(f: BundestagFilter): BundestagFilter {
  const out: BundestagFilter = {};
  if (f.wahlperiode?.length) out.wahlperiode = f.wahlperiode;
  if (f.drucksachetyp?.length) out.drucksachetyp = f.drucksachetyp;
  if (f.urheber?.length) out.urheber = f.urheber;
  if (f.datumVon) out.datumVon = f.datumVon;
  if (f.datumBis) out.datumBis = f.datumBis;
  if (f.deskriptor?.length) out.deskriptor = f.deskriptor;
  if (f.dokumentnummer?.length) out.dokumentnummer = f.dokumentnummer;
  if (f.titel) out.titel = f.titel;
  if (f.mitBeratung) out.mitBeratung = true;
  return out;
}

function CheckGroup<T extends string>(props: {
  legend: string;
  options: readonly T[];
  selected: T[] | undefined;
  onToggle: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-xs font-medium text-foreground-heading">{props.legend}</legend>
      <div className="flex flex-col gap-xs">
        {props.options.map((o) => (
          <label key={o} className="flex items-center gap-xs text-sm">
            <input
              type="checkbox"
              checked={props.selected?.includes(o) ?? false}
              onChange={() => props.onToggle(o)}
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Der Antworttext bleibt Text; `[n]` mit passendem Beleg wird zum Sprung-Knopf. */
function AnswerText({ text, known }: { text: string; known: Set<number> }) {
  const jump = (n: number) => {
    const el = document.getElementById(`beleg-${n}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  };
  const parts: ReactNode[] = [];
  text.split(/(\[\d+\])/).forEach((part, i) => {
    const m = /^\[(\d+)\]$/.exec(part);
    const n = m ? Number(m[1]) : null;
    if (n !== null && known.has(n)) {
      parts.push(
        <button
          key={i}
          type="button"
          onClick={() => jump(n)}
          aria-label={`Zu Beleg ${n} springen`}
          className="mx-0.5 rounded-sm text-primary-600 underline focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          [{n}]
        </button>
      );
    } else {
      parts.push(<Fragment key={i}>{part}</Fragment>);
    }
  });
  return <p className="whitespace-pre-wrap leading-relaxed">{parts}</p>;
}

export function BundestagQaPage() {
  const plan = useBundestagPlan();
  const answer = useBundestagAnswer();

  const [question, setQuestion] = useState('');
  const [filters, setFilters] = useState<BundestagFilter>({});
  const [periodeText, setPeriodeText] = useState('');
  const [deskriptorInput, setDeskriptorInput] = useState('');
  const [planData, setPlanData] = useState<BundestagPlanResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [auftrag, setAuftrag] = useState<BundestagAuftrag>('frage');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  // Laufzeit der Antwort (30–150 s) sichtbar machen.
  useEffect(() => {
    if (!answer.isPending) return;
    startedAt.current = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [answer.isPending]);

  const runPlan = () => {
    answer.reset();
    plan.mutate(
      { question, ...(planData ? { filters: cleanFilters(filters) } : {}) },
      {
        onSuccess: (data) => {
          setPlanData(data);
          setFilters(data.filters);
          setPeriodeText((data.filters.wahlperiode ?? []).join(', '));
          setSelected(data.candidates.slice(0, MAX_REFS).map((c) => c.ref));
        },
      }
    );
  };

  const runAnswer = () => {
    setElapsed(0);
    answer.mutate({
      question,
      filters: cleanFilters(filters),
      refs: selected,
      auftrag,
    });
  };

  const setPeriode = (text: string) => {
    setPeriodeText(text);
    const nums = text
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 30)
      .slice(0, 3);
    setFilters((f) => ({ ...f, wahlperiode: nums }));
  };

  const addDeskriptor = () => {
    const v = deskriptorInput.trim();
    if (v.length >= 2 && (filters.deskriptor?.length ?? 0) < 4) {
      setFilters((f) => ({ ...f, deskriptor: toggle(f.deskriptor, v) }));
    }
    setDeskriptorInput('');
  };

  const toggleRef = (ref: string) => setSelected((s) => toggle(s, ref));
  const overLimit = selected.length > MAX_REFS;
  const result = answer.data;
  const knownCitations = new Set(result?.citations.map((c) => c.n) ?? []);

  return (
    <PageContainer maxWidth="lg">
      <div className="flex flex-col gap-lg pb-xl pt-md">
        <header>
          <h1 className="text-3xl font-semibold text-foreground-heading">
            Bundestag-Fragen (Labor)
          </h1>
          <p className="mt-xs text-foreground-muted">
            Interne Testseite: Frage stellen, Kandidaten prüfen, Dokumente lesen und belegt
            beantworten.
          </p>
        </header>

        <section aria-labelledby="frage-h" className="flex flex-col gap-sm">
          <h2 id="frage-h" className="text-xl font-semibold text-foreground-heading">
            1. Frage
          </h2>
          <label htmlFor="bt-frage" className="font-medium">
            Frage an den Bundestag
          </label>
          <textarea
            id="bt-frage"
            className={fieldClass}
            rows={3}
            maxLength={1000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div>
            <Button
              onClick={runPlan}
              disabled={question.trim().length < 3 || plan.isPending || answer.isPending}
            >
              {plan.isPending
                ? 'Suche läuft …'
                : planData
                  ? 'Mit diesen Filtern neu suchen'
                  : 'Kandidaten suchen'}
            </Button>
          </div>
          {plan.isError && (
            <p role="alert" className="text-error">
              {plan.error.message}
            </p>
          )}
        </section>

        {planData && (
          <>
            <section aria-labelledby="filter-h" className="flex flex-col gap-md">
              <h2 id="filter-h" className="text-xl font-semibold text-foreground-heading">
                2. Filter
              </h2>
              <p>
                {planData.totals.vorgaenge} Vorgänge, {planData.totals.drucksachen} Drucksachen,
                gezeigt {planData.candidates.length}
              </p>
              {planData.notes.length > 0 && (
                <ul className="list-disc pl-lg text-foreground-muted">
                  {planData.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <div className="grid gap-md md:grid-cols-2">
                <CheckGroup
                  legend="Typ"
                  options={TYPEN}
                  selected={filters.drucksachetyp}
                  onToggle={(v) =>
                    setFilters((f) => ({ ...f, drucksachetyp: toggle(f.drucksachetyp, v) }))
                  }
                />
                <CheckGroup
                  legend="Urheber"
                  options={URHEBER}
                  selected={filters.urheber}
                  onToggle={(v) => setFilters((f) => ({ ...f, urheber: toggle(f.urheber, v) }))}
                />
              </div>
              <div className="grid gap-md md:grid-cols-3">
                <div className="flex flex-col gap-xs">
                  <label htmlFor="bt-periode" className="font-medium">
                    Wahlperiode (kommagetrennt)
                  </label>
                  <input
                    id="bt-periode"
                    className={fieldClass}
                    value={periodeText}
                    onChange={(e) => setPeriode(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label htmlFor="bt-von" className="font-medium">
                    Datum von
                  </label>
                  <input
                    id="bt-von"
                    type="date"
                    className={fieldClass}
                    value={filters.datumVon ?? ''}
                    onChange={(e) => setFilters((f) => ({ ...f, datumVon: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label htmlFor="bt-bis" className="font-medium">
                    Datum bis
                  </label>
                  <input
                    id="bt-bis"
                    type="date"
                    className={fieldClass}
                    value={filters.datumBis ?? ''}
                    onChange={(e) => setFilters((f) => ({ ...f, datumBis: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-xs">
                <label htmlFor="bt-deskriptor" className="font-medium">
                  Deskriptor hinzufügen (höchstens 4)
                </label>
                <div className="flex gap-xs">
                  <input
                    id="bt-deskriptor"
                    className={`${fieldClass} flex-1`}
                    value={deskriptorInput}
                    onChange={(e) => setDeskriptorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDeskriptor();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addDeskriptor}>
                    Hinzufügen
                  </Button>
                </div>
                <ul className="flex flex-wrap gap-xs" aria-label="Gewählte Deskriptoren">
                  {(filters.deskriptor ?? []).map((d) => (
                    <li key={d}>
                      <button
                        type="button"
                        aria-label={`Deskriptor ${d} entfernen`}
                        onClick={() =>
                          setFilters((f) => ({ ...f, deskriptor: toggle(f.deskriptor, d) }))
                        }
                        className="rounded-full border border-border bg-muted px-sm py-0.5 text-sm focus-visible:outline-2 focus-visible:outline-primary-500"
                      >
                        {d} ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <label className="flex items-center gap-xs">
                <input
                  type="checkbox"
                  checked={filters.mitBeratung ?? false}
                  onChange={(e) => setFilters((f) => ({ ...f, mitBeratung: e.target.checked }))}
                />
                Plenardebatte einbeziehen
              </label>
            </section>

            <section aria-labelledby="kand-h" className="flex flex-col gap-sm">
              <h2 id="kand-h" className="text-xl font-semibold text-foreground-heading">
                3. Kandidaten
              </h2>
              {planData.candidates.length === 0 ? (
                <p>Keine Treffer.</p>
              ) : (
                <ul className="flex flex-col gap-xs">
                  {planData.candidates.map((c) => (
                    <li key={c.ref} className="rounded-md border border-border p-sm">
                      <label className="flex items-start gap-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selected.includes(c.ref)}
                          onChange={() => toggleRef(c.ref)}
                        />
                        <span>
                          <span className="font-medium">{c.ref}</span> · {c.drucksachetyp} ·{' '}
                          {c.datum}
                          <br />
                          {c.titel}
                        </span>
                      </label>
                      {c.pdfUrl && (
                        <a
                          href={c.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-lg text-sm text-primary-600 underline focus-visible:outline-2 focus-visible:outline-primary-500"
                        >
                          PDF öffnen<span className="sr-only"> ({c.ref}, neues Fenster)</span>
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {overLimit && (
                <p role="alert" className="text-error">
                  Höchstens {MAX_REFS} Dokumente auswählen.
                </p>
              )}
              <fieldset className="mt-sm">
                <legend className="mb-xs font-medium text-foreground-heading">Auftrag</legend>
                <div className="flex gap-md">
                  <label className="flex items-center gap-xs">
                    <input
                      type="radio"
                      name="auftrag"
                      checked={auftrag === 'frage'}
                      onChange={() => setAuftrag('frage')}
                    />
                    Frage beantworten
                  </label>
                  <label className="flex items-center gap-xs">
                    <input
                      type="radio"
                      name="auftrag"
                      checked={auftrag === 'zusammenfassung'}
                      onChange={() => setAuftrag('zusammenfassung')}
                    />
                    Zusammenfassen
                  </label>
                </div>
              </fieldset>
              <div>
                <Button
                  onClick={runAnswer}
                  disabled={
                    selected.length === 0 || overLimit || answer.isPending || plan.isPending
                  }
                >
                  {answer.isPending
                    ? `Dokumente werden gelesen … ${elapsed} s`
                    : auftrag === 'frage'
                      ? 'Frage beantworten'
                      : 'Zusammenfassen'}
                </Button>
              </div>
              {answer.isPending && (
                <p role="status" className="text-foreground-muted">
                  Das Lesen dauert meist 30 bis 150 Sekunden ({elapsed} s vergangen).
                </p>
              )}
              {answer.isError && (
                <p role="alert" className="text-error">
                  {answer.error.message}
                </p>
              )}
            </section>
          </>
        )}

        {result && (
          <section aria-labelledby="antwort-h" className="flex flex-col gap-md">
            <h2 id="antwort-h" className="text-xl font-semibold text-foreground-heading">
              4. Antwort
            </h2>
            <AnswerText text={result.answer} known={knownCitations} />
            {result.notes.length > 0 && (
              <ul className="list-disc pl-lg text-foreground-muted">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}

            <h3 className="text-lg font-semibold text-foreground-heading">Belege</h3>
            <ol className="flex flex-col gap-sm">
              {result.citations.map((c) => (
                <li
                  key={c.n}
                  id={`beleg-${c.n}`}
                  tabIndex={-1}
                  className="rounded-md border border-border p-sm focus:outline-2 focus:outline-primary-500"
                >
                  <p className="font-medium">
                    [{c.n}] {c.ref} · {c.drucksachetyp} · {c.datum}
                  </p>
                  <p className="text-sm text-foreground-muted">{c.titel}</p>
                  <p className="mt-xs">{c.aussage}</p>
                  <blockquote className="mt-xs border-l-2 border-border pl-sm italic">
                    {c.zitat}
                  </blockquote>
                  {c.pdfUrl && (
                    <a
                      href={c.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 underline focus-visible:outline-2 focus-visible:outline-primary-500"
                    >
                      PDF öffnen<span className="sr-only"> (Beleg {c.n}, neues Fenster)</span>
                    </a>
                  )}
                </li>
              ))}
            </ol>

            <h3 className="text-lg font-semibold text-foreground-heading">Diagnose je Dokument</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm [&_td]:p-xs [&_th]:p-xs">
                <caption className="sr-only">Diagnose je gelesenem Dokument</caption>
                <thead>
                  <tr>
                    <th scope="col">Ref</th>
                    <th scope="col">Typ</th>
                    <th scope="col">Quelle</th>
                    <th scope="col">Relevant</th>
                    <th scope="col">Punkte</th>
                    <th scope="col">Verworfen</th>
                    <th scope="col">Fenster</th>
                    <th scope="col">Übersprungen</th>
                  </tr>
                </thead>
                <tbody>
                  {result.documents.map((d) => (
                    <tr key={d.ref} className="border-t border-border">
                      <th scope="row">{d.ref}</th>
                      <td>{d.drucksachetyp}</td>
                      <td>{d.textSource}</td>
                      <td>{d.relevant ? 'ja' : 'nein'}</td>
                      <td>{d.points.length}</td>
                      <td>{d.droppedPoints}</td>
                      <td>
                        {d.windowsRead}/{d.windowsTotal}
                      </td>
                      <td>{d.skipped ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-semibold text-foreground-heading">Werte</h3>
            <dl className="grid grid-cols-2 gap-xs text-sm md:grid-cols-3">
              <dt>Gesamtdauer</dt>
              <dd>{(result.stats.msTotal / 1000).toFixed(1)} s</dd>
              <dt>Lesedauer</dt>
              <dd>{(result.stats.msRead / 1000).toFixed(1)} s</dd>
              <dt>Gelesene Zeichen</dt>
              <dd>{result.stats.charsRead}</dd>
              <dt>Belegte Aussagen</dt>
              <dd>{result.stats.pointsVerified}</dd>
              <dt>Verworfene Aussagen</dt>
              <dd>{result.stats.pointsDropped}</dd>
              <dt>Ungültige Verweise</dt>
              <dd>{result.stats.invalidCitations}</dd>
            </dl>
          </section>
        )}
      </div>
    </PageContainer>
  );
}

export default withAuthRequired(BundestagQaPage);
