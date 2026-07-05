import {
  computeReisekosten,
  validateReisekosten,
  VERANSTALTUNGEN,
} from '@gruenerator/shared/reisekosten';
import { useEffect, useMemo, useState } from 'react';

import { useProfileStore } from '../../stores/profileStore';

import { generatePdf, validateReise } from './api';
import BelegUpload from './BelegUpload';
import { useReisekostenStore } from './store';
import { Checkbox, eur, Field, NumberInput, Section, Select, TextInput } from './ui';

import type { ExtractBelegResponse, Finding, ReisekostenState } from '@gruenerator/contracts';

const STEPS = ['Reise', 'Fahrt', 'Verpflegung', 'Übernachtung', 'Prüfen & Export'];

export default function ReisekostenPage() {
  const { step, state, belege, setStep, update, setStammdaten, setReise, setVerpflegungAbzug, addBeleg } =
    useReisekostenStore();
  const profile = useProfileStore((s) => s.profile);

  // Prefill name/email from the user profile on first visit.
  useEffect(() => {
    if (!profile) return;
    const name =
      profile.display_name ||
      [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
    if (name && !state.stammdaten.name) setStammdaten({ name });
    if (profile.email && !state.stammdaten.email) setStammdaten({ email: profile.email });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const computed = useMemo(() => computeReisekosten(state), [state]);
  const clientFindings = useMemo(() => validateReisekosten(state), [state]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-lg p-lg">
      <header className="flex flex-col gap-xs">
        <h1 className="text-2xl font-bold text-primary">Fahrtkosten-Grünerator</h1>
        <p className="text-sm text-grey-400">
          Reisekostenabrechnung erstellen, Belege automatisch auswerten und prüfen lassen.
        </p>
      </header>

      <Stepper step={step} onStep={setStep} />

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-lg">
          {step === 0 && <ReiseStep state={state} setReise={setReise} setStammdaten={setStammdaten} />}
          {step === 1 && <FahrtStep state={state} update={update} onBeleg={addBeleg} />}
          {step === 2 && (
            <VerpflegungStep state={state} onToggle={setVerpflegungAbzug} computedTage={computed.verpflegung.tage} />
          )}
          {step === 3 && <UebernachtungStep state={state} update={update} onBeleg={addBeleg} />}
          {step === 4 && <PruefenStep state={state} belege={belege} update={update} clientFindings={clientFindings} />}

          <div className="flex justify-between">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
              className="rounded-lg border border-grey-200 px-lg py-sm text-sm font-medium disabled:opacity-40 dark:border-grey-700"
            >
              Zurück
            </button>
            {step < STEPS.length - 1 && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-lg bg-primary px-lg py-sm text-sm font-medium text-white hover:opacity-90"
              >
                Weiter
              </button>
            )}
          </div>
        </div>

        <SummarySidebar computed={computed} findingCount={clientFindings.filter((f) => f.level === 'error').length} />
      </div>
    </div>
  );
}

function Stepper({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  return (
    <ol className="flex flex-wrap gap-sm">
      {STEPS.map((label, i) => (
        <li key={label}>
          <button
            type="button"
            onClick={() => onStep(i)}
            className={`rounded-full px-md py-xs text-xs font-medium transition-colors ${
              i === step
                ? 'bg-primary text-white'
                : 'border border-grey-200 text-grey-400 hover:border-primary dark:border-grey-700'
            }`}
          >
            {i + 1}. {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

// ── Step 1: Reise + Stammdaten ────────────────────────────────────────────────

function ReiseStep({
  state,
  setReise,
  setStammdaten,
}: {
  state: ReisekostenState;
  setReise: (p: Partial<ReisekostenState['reise']>) => void;
  setStammdaten: (p: Partial<ReisekostenState['stammdaten']>) => void;
}) {
  const s = state.stammdaten;
  return (
    <>
      <Section title="Reise">
        <Field label="Veranstaltung (Vorlage)" hint="Füllt Anlass und Ziel automatisch aus.">
          <Select
            value=""
            onChange={(id) => {
              const v = VERANSTALTUNGEN.find((x) => x.id === id);
              if (v) setReise({ anlass: v.anlass, ziel: v.ziel });
            }}
            options={[{ value: '', label: '– auswählen –' }, ...VERANSTALTUNGEN.map((v) => ({ value: v.id, label: v.label }))]}
          />
        </Field>
        <Field label="Anlass der Reise">
          <TextInput value={state.reise.anlass} onChange={(v) => setReise({ anlass: v })} placeholder="z.B. Länderrat" />
        </Field>
        <Field label="Ziel der Reise">
          <TextInput value={state.reise.ziel} onChange={(v) => setReise({ ziel: v })} placeholder="Anschrift" />
        </Field>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <Field label="Reisebeginn">
            <TextInput type="datetime-local" value={state.reise.reisebeginn} onChange={(v) => setReise({ reisebeginn: v })} />
          </Field>
          <Field label="Rückkehr">
            <TextInput type="datetime-local" value={state.reise.rueckkehr} onChange={(v) => setReise({ rueckkehr: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Antragsteller*in">
        <Field label="Name">
          <TextInput value={s.name} onChange={(v) => setStammdaten({ name: v })} />
        </Field>
        <div className="grid grid-cols-[1fr_100px] gap-md">
          <Field label="Straße">
            <TextInput value={s.strasse} onChange={(v) => setStammdaten({ strasse: v })} />
          </Field>
          <Field label="Nr.">
            <TextInput value={s.hausnr} onChange={(v) => setStammdaten({ hausnr: v })} />
          </Field>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-md">
          <Field label="PLZ">
            <TextInput value={s.plz} onChange={(v) => setStammdaten({ plz: v })} />
          </Field>
          <Field label="Ort">
            <TextInput value={s.ort} onChange={(v) => setStammdaten({ ort: v })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
          <Field label="E-Mail">
            <TextInput type="email" value={s.email} onChange={(v) => setStammdaten({ email: v })} />
          </Field>
          <Field label="Telefon">
            <TextInput value={s.telefon ?? ''} onChange={(v) => setStammdaten({ telefon: v })} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-md sm:grid-cols-[1fr_140px]">
          <Field label="IBAN" hint="Wird nur lokal in deinem Browser gespeichert.">
            <TextInput value={s.iban} onChange={(v) => setStammdaten({ iban: v })} />
          </Field>
          <Field label="BIC">
            <TextInput value={s.bic ?? ''} onChange={(v) => setStammdaten({ bic: v })} />
          </Field>
        </div>
      </Section>
    </>
  );
}

// ── Step 2: Fahrtkosten ───────────────────────────────────────────────────────

function FahrtStep({
  state,
  update,
  onBeleg,
}: {
  state: ReisekostenState;
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  onBeleg: (b: ExtractBelegResponse) => void;
}) {
  const f = state.fahrt;
  const setFahrt = (patch: Partial<ReisekostenState['fahrt']>) =>
    update((s) => ({ ...s, fahrt: { ...s.fahrt, ...patch } }));

  return (
    <>
      <Section title="Fahrtkosten – Reisearten wählen">
        <div className="flex flex-wrap gap-md">
          <Checkbox
            label="Bahn"
            checked={f.bahn !== null}
            onChange={(on) => setFahrt({ bahn: on ? { betrag: 0, belegVorhanden: false } : null })}
          />
          <Checkbox
            label="ÖPNV"
            checked={f.oepnv !== null}
            onChange={(on) => setFahrt({ oepnv: on ? { betrag: 0, belegVorhanden: false } : null })}
          />
          <Checkbox
            label="Kfz"
            checked={f.kfz !== null}
            onChange={(on) =>
              setFahrt({ kfz: on ? { km: 0, fahrzeug: 'pkw', routenplanerVorhanden: false, dbFlexpreis: null } : null })
            }
          />
          <Checkbox
            label="Mietwagen / Carsharing"
            checked={f.miete !== null}
            onChange={(on) => setFahrt({ miete: on ? { betrag: 0, dbFlexpreis: null, belegVorhanden: false } : null })}
          />
          <Checkbox
            label="Taxi (optional)"
            checked={f.taxi !== null}
            onChange={(on) => setFahrt({ taxi: on ? { betrag: 0, begruendung: '' } : null })}
          />
          <Checkbox
            label="Sonstiges (optional)"
            checked={f.sonstiges !== null}
            onChange={(on) => setFahrt({ sonstiges: on ? { betrag: 0, beschreibung: '' } : null })}
          />
        </div>
      </Section>

      {f.bahn && (
        <Section title="Bahn">
          <BelegUpload
            belegType="bahn"
            label="Bahnticket hochladen"
            onExtracted={(b) => {
              onBeleg(b);
              setFahrt({ bahn: { betrag: b.betrag ?? f.bahn?.betrag ?? 0, belegVorhanden: true } });
            }}
          />
          <Field label="Betrag">
            <NumberInput
              value={f.bahn.betrag || null}
              onChange={(v) => setFahrt({ bahn: { betrag: v ?? 0, belegVorhanden: f.bahn!.belegVorhanden } })}
            />
          </Field>
          <Checkbox
            label="Originalbeleg liegt vor"
            checked={f.bahn.belegVorhanden}
            onChange={(on) => setFahrt({ bahn: { betrag: f.bahn!.betrag, belegVorhanden: on } })}
          />
        </Section>
      )}

      {f.oepnv && (
        <Section title="ÖPNV">
          <BelegUpload
            belegType="oepnv"
            label="ÖPNV-Beleg hochladen"
            onExtracted={(b) => {
              onBeleg(b);
              setFahrt({ oepnv: { betrag: b.betrag ?? f.oepnv?.betrag ?? 0, belegVorhanden: true } });
            }}
          />
          <Field label="Betrag">
            <NumberInput
              value={f.oepnv.betrag || null}
              onChange={(v) => setFahrt({ oepnv: { betrag: v ?? 0, belegVorhanden: f.oepnv!.belegVorhanden } })}
            />
          </Field>
        </Section>
      )}

      {f.kfz && (
        <Section title="Kfz">
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            <Field label="Kilometer (kürzeste Strecke)" hint="Routenplaner-Ausdruck beifügen.">
              <NumberInput
                value={f.kfz.km || null}
                onChange={(v) => setFahrt({ kfz: { ...f.kfz!, km: v ?? 0 } })}
              />
            </Field>
            <Field label="Fahrzeug">
              <Select
                value={f.kfz.fahrzeug}
                onChange={(v) => setFahrt({ kfz: { ...f.kfz!, fahrzeug: v as 'pkw' | 'motorrad' } })}
                options={[
                  { value: 'pkw', label: 'Pkw (0,30 €/km)' },
                  { value: 'motorrad', label: 'Motorrad/Roller (0,20 €/km)' },
                ]}
              />
            </Field>
          </div>
          <Checkbox
            label="Routenplaner-Ausdruck liegt bei"
            checked={f.kfz.routenplanerVorhanden}
            onChange={(on) => setFahrt({ kfz: { ...f.kfz!, routenplanerVorhanden: on } })}
          />
          {f.kfz.km > 400 && (
            <Field label="DB-Flexpreis 2. Kl. (Pflicht > 400 km)" hint="Ab 400 km ist nur der DB-Flexpreis erstattungsfähig.">
              <NumberInput
                value={f.kfz.dbFlexpreis}
                onChange={(v) => setFahrt({ kfz: { ...f.kfz!, dbFlexpreis: v } })}
              />
            </Field>
          )}
        </Section>
      )}

      {f.miete && (
        <Section title="Mietwagen / Carsharing">
          <BelegUpload
            belegType="miete"
            label="Rechnung hochladen"
            onExtracted={(b) => {
              onBeleg(b);
              setFahrt({ miete: { ...f.miete!, betrag: b.betrag ?? f.miete?.betrag ?? 0, belegVorhanden: true } });
            }}
          />
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            <Field label="Betrag">
              <NumberInput value={f.miete.betrag || null} onChange={(v) => setFahrt({ miete: { ...f.miete!, betrag: v ?? 0 } })} />
            </Field>
            <Field label="DB-Flexpreis (Obergrenze)">
              <NumberInput value={f.miete.dbFlexpreis} onChange={(v) => setFahrt({ miete: { ...f.miete!, dbFlexpreis: v } })} />
            </Field>
          </div>
        </Section>
      )}

      {f.taxi && (
        <Section title="Taxi">
          <Field label="Betrag">
            <NumberInput value={f.taxi.betrag || null} onChange={(v) => setFahrt({ taxi: { ...f.taxi!, betrag: v ?? 0 } })} />
          </Field>
          <Field label="Begründung (Pflicht)">
            <TextInput value={f.taxi.begruendung} onChange={(v) => setFahrt({ taxi: { ...f.taxi!, begruendung: v } })} />
          </Field>
        </Section>
      )}

      {f.sonstiges && (
        <Section title="Sonstiges">
          <Field label="Betrag">
            <NumberInput value={f.sonstiges.betrag || null} onChange={(v) => setFahrt({ sonstiges: { ...f.sonstiges!, betrag: v ?? 0 } })} />
          </Field>
          <Field label="Beschreibung" hint="z.B. Teilnahmebeitrag, Parkgebühr (keine Bewirtung).">
            <TextInput value={f.sonstiges.beschreibung} onChange={(v) => setFahrt({ sonstiges: { ...f.sonstiges!, beschreibung: v } })} />
          </Field>
        </Section>
      )}
    </>
  );
}

// ── Step 3: Verpflegung ───────────────────────────────────────────────────────

function VerpflegungStep({
  state,
  onToggle,
  computedTage,
}: {
  state: ReisekostenState;
  onToggle: (datum: string, patch: { fruehstueck?: boolean; mittagessen?: boolean; abendessen?: boolean }) => void;
  computedTage: ReturnType<typeof computeReisekosten>['verpflegung']['tage'];
}) {
  if (!state.reise.reisebeginn || !state.reise.rueckkehr) {
    return (
      <Section title="Verpflegungsmehraufwand">
        <p className="text-sm text-grey-400">Bitte zuerst Reisebeginn und Rückkehr angeben.</p>
      </Section>
    );
  }
  return (
    <Section title="Verpflegungsmehraufwand (automatisch berechnet)">
      <p className="text-sm text-grey-400">
        Pauschalen ergeben sich aus den Reisezeiten. Hake gestellte Mahlzeiten an – die werden vom Tagessatz abgezogen.
      </p>
      <div className="flex flex-col gap-sm">
        {computedTage.map((t) => {
          const abz = state.verpflegungAbzuege.find((a) => a.datum === t.datum);
          return (
            <div key={t.datum} className="flex flex-col gap-xs rounded-lg border border-grey-200 p-md dark:border-grey-700">
              <div className="flex justify-between text-sm font-medium">
                <span>{t.datum} · {t.typ}</span>
                <span>{eur(t.summe)}{t.abzug ? ` (−${eur(t.abzug)})` : ''}</span>
              </div>
              <div className="flex flex-wrap gap-md">
                <Checkbox label="Frühstück" checked={abz?.fruehstueck ?? false} onChange={(on) => onToggle(t.datum, { fruehstueck: on })} />
                <Checkbox label="Mittagessen" checked={abz?.mittagessen ?? false} onChange={(on) => onToggle(t.datum, { mittagessen: on })} />
                <Checkbox label="Abendessen" checked={abz?.abendessen ?? false} onChange={(on) => onToggle(t.datum, { abendessen: on })} />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── Step 4: Übernachtung ──────────────────────────────────────────────────────

function UebernachtungStep({
  state,
  update,
  onBeleg,
}: {
  state: ReisekostenState;
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  onBeleg: (b: ExtractBelegResponse) => void;
}) {
  const u = state.uebernachtung;
  const setU = (patch: Partial<NonNullable<ReisekostenState['uebernachtung']>>) =>
    update((s) => ({ ...s, uebernachtung: s.uebernachtung ? { ...s.uebernachtung, ...patch } : null }));

  return (
    <Section title="Übernachtung (optional)">
      <Checkbox
        label="Übernachtung anfügen"
        checked={u !== null}
        onChange={(on) =>
          update((s) => ({ ...s, uebernachtung: on ? { modus: 'pauschal', betrag: null, naechte: 1 } : null }))
        }
      />
      {u && (
        <>
          <Field label="Art">
            <Select
              value={u.modus}
              onChange={(v) => setU({ modus: v as NonNullable<ReisekostenState['uebernachtung']>['modus'] })}
              options={[
                { value: 'pauschal', label: 'Pauschal (20 €/Nacht, privat)' },
                { value: 'beleg', label: 'Laut Beleg' },
                { value: 'lv_bezahlt', label: 'Vom Landesverband bezahlt' },
              ]}
            />
          </Field>
          {u.modus === 'pauschal' && (
            <Field label="Nächte">
              <NumberInput value={u.naechte} onChange={(v) => setU({ naechte: v })} />
            </Field>
          )}
          {u.modus === 'beleg' && (
            <>
              <BelegUpload
                belegType="hotel"
                label="Hotelrechnung hochladen"
                onExtracted={(b) => {
                  onBeleg(b);
                  setU({ betrag: b.betrag ?? u.betrag });
                }}
              />
              <Field label="Betrag">
                <NumberInput value={u.betrag} onChange={(v) => setU({ betrag: v })} />
              </Field>
            </>
          )}
        </>
      )}
    </Section>
  );
}

// ── Step 5: Prüfen & Export ───────────────────────────────────────────────────

function PruefenStep({
  state,
  belege,
  update,
  clientFindings,
}: {
  state: ReisekostenState;
  belege: ExtractBelegResponse[];
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  clientFindings: Finding[];
}) {
  const [serverFindings, setServerFindings] = useState<Finding[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findings = serverFindings ?? clientFindings;
  const hasError = findings.some((f) => f.level === 'error');

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await validateReise(state, belege);
      setServerFindings(res.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prüfung fehlgeschlagen');
    } finally {
      setChecking(false);
    }
  };

  const download = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { filename, blob } = await generatePdf(state);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF-Erstellung fehlgeschlagen');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Section title="Spende (optional)">
        <p className="text-sm text-grey-400">
          Bei der Steuererklärung werden 50 % der Spende zurückerstattet.
        </p>
        <Field label="Spende an BÜNDNIS 90 / DIE GRÜNEN">
          <NumberInput value={state.spende || null} onChange={(v) => update((s) => ({ ...s, spende: v ?? 0 }))} />
        </Field>
      </Section>

      <Section title="Prüfung">
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={checking}
          className="w-fit rounded-lg border border-grey-200 px-lg py-sm text-sm font-medium hover:border-primary disabled:opacity-60 dark:border-grey-700"
        >
          {checking ? 'Prüfe…' : '🔍 Mit KI prüfen (Belege abgleichen)'}
        </button>
        <div className="flex flex-col gap-xs">
          {findings.length === 0 && <span className="text-sm text-green-600">✓ Keine Beanstandungen.</span>}
          {findings.map((f) => (
            <div
              key={`${f.level}-${f.field}-${f.message}`}
              className={`rounded-lg border px-md py-sm text-sm ${
                f.level === 'error'
                  ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950'
                  : f.level === 'warn'
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950'
                    : 'border-grey-200 text-grey-500 dark:border-grey-700'
              }`}
            >
              {f.level === 'error' ? '⛔' : f.level === 'warn' ? '⚠️' : 'ℹ️'} {f.message}
            </div>
          ))}
        </div>
      </Section>

      <button
        type="button"
        onClick={() => void download()}
        disabled={generating || hasError}
        className="rounded-lg bg-primary px-lg py-md text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {generating ? 'PDF wird erstellt…' : '📄 PDF erzeugen'}
      </button>
      {hasError && <span className="text-sm text-red-600">Bitte zuerst die Fehler (⛔) beheben.</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function SummarySidebar({
  computed,
  findingCount,
}: {
  computed: ReturnType<typeof computeReisekosten>;
  findingCount: number;
}) {
  const row = (label: string, value: number, bold = false) => (
    <div className={`flex justify-between ${bold ? 'font-semibold text-foreground' : 'text-grey-500'}`}>
      <span>{label}</span>
      <span>{eur(value)}</span>
    </div>
  );
  return (
    <aside className="h-fit rounded-xl border border-grey-200 p-lg text-sm lg:sticky lg:top-lg dark:border-grey-700">
      <h2 className="mb-md text-base font-semibold text-primary">Zusammenfassung</h2>
      <div className="flex flex-col gap-xs">
        {row('Fahrtkosten', computed.fahrtkosten.summe)}
        {row('Verpflegung', computed.verpflegung.summe)}
        {row('Übernachtung', computed.uebernachtung.summe)}
        <div className="my-sm border-t border-grey-200 dark:border-grey-700" />
        {row('Gesamt', computed.gesamt, true)}
        {computed.spende > 0 && row('Spende', computed.spende)}
        {computed.spende > 0 && row('Auszahlung', computed.auszahlung, true)}
      </div>
      {findingCount > 0 && (
        <p className="mt-md text-xs text-red-600">{findingCount} Fehler zu beheben</p>
      )}
    </aside>
  );
}
