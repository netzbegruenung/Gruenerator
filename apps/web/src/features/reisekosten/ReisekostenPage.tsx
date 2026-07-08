import {
  computeReisekosten,
  getRate,
  validateReisekosten,
  VERANSTALTUNGEN,
} from '@gruenerator/shared/reisekosten';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { useProfileStore } from '../../stores/profileStore';

import { generatePdf, validateReise } from './api';
import BelegUpload from './BelegUpload';
import { useReisekostenStore } from './store';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  eur,
  Field,
  NumberInput,
  Select,
  Switch,
  TextInput,
} from './ui';

import type { ExtractBelegResponse, Finding, ReisekostenState } from '@gruenerator/contracts';

const STEPS = ['Reise', 'Person', 'Fahrt', 'Verpflegung & Übernachtung', 'Prüfen & Export'];

/** Maps a finding's dot-path to the wizard step that owns it. */
function stepForField(field: string): number {
  if (field.startsWith('stammdaten.')) return 1;
  if (field.startsWith('fahrt.')) return 2;
  if (field.startsWith('uebernachtung') || field.startsWith('verpflegung')) return 3;
  return 0; // reise.* and anything else
}

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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-lg px-lg pb-3xl pt-lg">
      <header className="flex flex-col gap-xs">
        <h1 className="text-3xl font-bold text-primary-700">Fahrtkosten-Grünerator</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Reisekostenabrechnung erstellen, Belege automatisch auswerten und prüfen lassen.
        </p>
      </header>

      <Stepper step={step} onStep={setStep} />

      <main className="flex flex-col gap-lg">
        {step === 0 && <ReiseStep state={state} setReise={setReise} />}
        {step === 1 && <PersonStep state={state} setStammdaten={setStammdaten} />}
        {step === 2 && <FahrtStep state={state} update={update} onBeleg={addBeleg} />}
        {step === 3 && (
          <VerpflegungUebernachtungStep
            state={state}
            update={update}
            onToggle={setVerpflegungAbzug}
            onBeleg={addBeleg}
            computed={computed}
          />
        )}
        {step === 4 && (
          <PruefenStep
            state={state}
            belege={belege}
            update={update}
            setStep={setStep}
            computed={computed}
            clientFindings={clientFindings}
          />
        )}

        <div className="flex justify-between gap-md">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Zurück
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 && (
            <Button variant="brand" onClick={() => setStep(step + 1)}>
              Weiter
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Stepper ─────────────────────────────────────────────────────────────────────

function Stepper({ step, onStep }: { step: number; onStep: (n: number) => void }) {
  return (
    <div className="flex items-start overflow-x-auto pb-xs">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <div key={label} className="flex flex-1 items-start">
            {i > 0 && (
              <span
                className={`mt-4 h-0.5 flex-1 rounded-full ${
                  i <= step ? 'bg-primary-300' : 'bg-border'
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => onStep(i)}
              aria-current={current ? 'step' : undefined}
              className="flex max-w-[150px] flex-col items-center gap-xs px-sm text-center"
            >
              <span
                className={`flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold transition-all ${
                  current
                    ? 'bg-primary text-white shadow-md'
                    : done
                      ? 'bg-primary-50 text-primary-700'
                      : 'bg-background-alt text-muted-foreground'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className={`text-xs leading-tight ${
                  current
                    ? 'font-bold text-primary-700'
                    : done
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Reise ─────────────────────────────────────────────────────────────

function ReiseStep({
  state,
  setReise,
}: {
  state: ReisekostenState;
  setReise: (p: Partial<ReisekostenState['reise']>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reise</CardTitle>
        <CardDescription>Anlass, Ziel und Zeitraum der Dienstreise</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-md">
          <Field label="Veranstaltung (Vorlage)" hint="Füllt Anlass und Ziel automatisch aus.">
            <Select
              value=""
              onChange={(id) => {
                const v = VERANSTALTUNGEN.find((x) => x.id === id);
                if (v) setReise({ anlass: v.anlass, ziel: v.ziel });
              }}
              options={[
                { value: '', label: '– auswählen –' },
                ...VERANSTALTUNGEN.map((v) => ({ value: v.id, label: v.label })),
              ]}
            />
          </Field>
          <Field label="Anlass der Reise *">
            <TextInput
              value={state.reise.anlass}
              onChange={(v) => setReise({ anlass: v })}
              placeholder="z. B. Länderrat"
            />
          </Field>
          <Field label="Ziel der Reise *">
            <TextInput value={state.reise.ziel} onChange={(v) => setReise({ ziel: v })} placeholder="Anschrift" />
          </Field>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            <Field label="Reisebeginn *">
              <TextInput
                type="datetime-local"
                value={state.reise.reisebeginn}
                onChange={(v) => setReise({ reisebeginn: v })}
              />
            </Field>
            <Field label="Rückkehr *">
              <TextInput
                type="datetime-local"
                value={state.reise.rueckkehr}
                onChange={(v) => setReise({ rueckkehr: v })}
              />
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Step 2: Person ────────────────────────────────────────────────────────────

function PersonStep({
  state,
  setStammdaten,
}: {
  state: ReisekostenState;
  setStammdaten: (p: Partial<ReisekostenState['stammdaten']>) => void;
}) {
  const s = state.stammdaten;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Antragsteller*in</CardTitle>
        <CardDescription>Kontaktdaten und Bankverbindung für die Erstattung</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-md">
          <Field label="Name *">
            <TextInput value={s.name} onChange={(v) => setStammdaten({ name: v })} />
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-md">
            <Field label="Straße *">
              <TextInput value={s.strasse} onChange={(v) => setStammdaten({ strasse: v })} />
            </Field>
            <Field label="Nr.">
              <TextInput value={s.hausnr} onChange={(v) => setStammdaten({ hausnr: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-md">
            <Field label="PLZ *">
              <TextInput value={s.plz} onChange={(v) => setStammdaten({ plz: v })} inputMode="numeric" />
            </Field>
            <Field label="Ort *">
              <TextInput value={s.ort} onChange={(v) => setStammdaten({ ort: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
            <Field label="E-Mail *">
              <TextInput type="email" value={s.email} onChange={(v) => setStammdaten({ email: v })} />
            </Field>
            <Field label="Telefon">
              <TextInput type="tel" value={s.telefon ?? ''} onChange={(v) => setStammdaten({ telefon: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-md sm:grid-cols-[1fr_140px]">
            <Field label="IBAN *" hint="Wird nur lokal in deinem Browser gespeichert.">
              <TextInput
                value={s.iban}
                onChange={(v) => setStammdaten({ iban: v })}
                placeholder="DE00 0000 0000 0000 0000 00"
              />
            </Field>
            <Field label="BIC">
              <TextInput value={s.bic ?? ''} onChange={(v) => setStammdaten({ bic: v })} />
            </Field>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Step 3: Fahrtkosten ─────────────────────────────────────────────────────────

const MODE_TILES: ReadonlyArray<{ key: keyof ReisekostenState['fahrt']; emoji: string; label: string; hint?: string }> = [
  { key: 'bahn', emoji: '🚆', label: 'Bahn' },
  { key: 'oepnv', emoji: '🚋', label: 'ÖPNV' },
  { key: 'kfz', emoji: '🚗', label: 'Kfz' },
  { key: 'miete', emoji: '🚙', label: 'Mietwagen' },
  { key: 'taxi', emoji: '🚕', label: 'Taxi', hint: 'mit Begründung' },
  { key: 'sonstiges', emoji: '🧾', label: 'Sonstiges', hint: 'optional' },
];

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
  const kmObergrenze = getRate(state.rateKey).kmObergrenze;
  const setFahrt = (patch: Partial<ReisekostenState['fahrt']>) =>
    update((s) => ({ ...s, fahrt: { ...s.fahrt, ...patch } }));

  const toggle = (key: (typeof MODE_TILES)[number]['key']) => {
    switch (key) {
      case 'bahn':
        return setFahrt({ bahn: f.bahn ? null : { betrag: 0, belegVorhanden: false } });
      case 'oepnv':
        return setFahrt({ oepnv: f.oepnv ? null : { betrag: 0, belegVorhanden: false } });
      case 'kfz':
        return setFahrt({
          kfz: f.kfz ? null : { km: 0, fahrzeug: 'pkw', routenplanerVorhanden: false, dbFlexpreis: null },
        });
      case 'miete':
        return setFahrt({ miete: f.miete ? null : { betrag: 0, dbFlexpreis: null, belegVorhanden: false } });
      case 'taxi':
        return setFahrt({ taxi: f.taxi ? null : { betrag: 0, begruendung: '' } });
      case 'sonstiges':
        return setFahrt({ sonstiges: f.sonstiges ? null : { betrag: 0, beschreibung: '' } });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fahrtkosten</CardTitle>
        <CardDescription>Verkehrsmittel wählen und Belege hochladen – Beträge werden automatisch erkannt.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-lg">
          <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {MODE_TILES.map((m) => {
              const active = f[m.key] !== null;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(m.key)}
                  className={`flex min-h-[104px] flex-col items-center justify-center gap-xs rounded-lg p-md transition-all ${
                    active
                      ? 'bg-primary-50 text-primary-700 shadow-sm ring-2 ring-inset ring-primary dark:bg-primary-900'
                      : 'bg-background-alt text-foreground hover:bg-primary-50 dark:hover:bg-primary-900'
                  }`}
                >
                  <span className="text-3xl leading-none">{m.emoji}</span>
                  <span className="text-sm font-semibold">{m.label}</span>
                  {m.hint && <span className="text-xs text-muted-foreground">{m.hint}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-md">
            {f.bahn && (
              <DetailBox emoji="🚆" title="Bahn">
                <BelegUpload
                  belegType="bahn"
                  title="Bahnticket hochladen"
                  onExtracted={(b) => {
                    onBeleg(b);
                    setFahrt({ bahn: { betrag: b.betrag ?? f.bahn?.betrag ?? 0, belegVorhanden: true } });
                  }}
                />
                <Field label="Betrag (€) *" hint="2. Klasse, BahnCard-Rabatt bereits abgezogen.">
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
              </DetailBox>
            )}

            {f.oepnv && (
              <DetailBox emoji="🚋" title="ÖPNV">
                <BelegUpload
                  belegType="oepnv"
                  title="ÖPNV-Beleg hochladen"
                  onExtracted={(b) => {
                    onBeleg(b);
                    setFahrt({ oepnv: { betrag: b.betrag ?? f.oepnv?.betrag ?? 0, belegVorhanden: true } });
                  }}
                />
                <Field label="Betrag (€) *">
                  <NumberInput
                    value={f.oepnv.betrag || null}
                    onChange={(v) => setFahrt({ oepnv: { betrag: v ?? 0, belegVorhanden: f.oepnv!.belegVorhanden } })}
                  />
                </Field>
              </DetailBox>
            )}

            {f.kfz && (
              <DetailBox emoji="🚗" title="Kfz (privater Pkw)">
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Kilometer (kürzeste Strecke) *" hint="Routenplaner-Ausdruck beifügen.">
                    <NumberInput
                      value={f.kfz.km || null}
                      step="1"
                      placeholder="0"
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
                {f.kfz.km > kmObergrenze && (
                  <Field
                    label={`DB-Flexpreis 2. Kl. (Pflicht > ${kmObergrenze} km)`}
                    hint={`Ab ${kmObergrenze} km ist nur der DB-Flexpreis erstattungsfähig.`}
                  >
                    <NumberInput
                      value={f.kfz.dbFlexpreis}
                      onChange={(v) => setFahrt({ kfz: { ...f.kfz!, dbFlexpreis: v } })}
                    />
                  </Field>
                )}
              </DetailBox>
            )}

            {f.miete && (
              <DetailBox emoji="🚙" title="Mietwagen / Carsharing">
                <BelegUpload
                  belegType="miete"
                  title="Rechnung hochladen"
                  onExtracted={(b) => {
                    onBeleg(b);
                    setFahrt({ miete: { ...f.miete!, betrag: b.betrag ?? f.miete?.betrag ?? 0, belegVorhanden: true } });
                  }}
                />
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Betrag (€) *">
                    <NumberInput
                      value={f.miete.betrag || null}
                      onChange={(v) => setFahrt({ miete: { ...f.miete!, betrag: v ?? 0 } })}
                    />
                  </Field>
                  <Field label="DB-Flexpreis (Obergrenze)">
                    <NumberInput
                      value={f.miete.dbFlexpreis}
                      onChange={(v) => setFahrt({ miete: { ...f.miete!, dbFlexpreis: v } })}
                    />
                  </Field>
                </div>
              </DetailBox>
            )}

            {f.taxi && (
              <DetailBox emoji="🚕" title="Taxi (nur mit Begründung)">
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Betrag (€) *">
                    <NumberInput
                      value={f.taxi.betrag || null}
                      onChange={(v) => setFahrt({ taxi: { ...f.taxi!, betrag: v ?? 0 } })}
                    />
                  </Field>
                  <Field label="Begründung *">
                    <TextInput
                      value={f.taxi.begruendung}
                      onChange={(v) => setFahrt({ taxi: { ...f.taxi!, begruendung: v } })}
                      placeholder="z. B. kein ÖPNV nach 23 Uhr"
                    />
                  </Field>
                </div>
              </DetailBox>
            )}

            {f.sonstiges && (
              <DetailBox emoji="🧾" title="Sonstiges">
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Betrag (€) *">
                    <NumberInput
                      value={f.sonstiges.betrag || null}
                      onChange={(v) => setFahrt({ sonstiges: { ...f.sonstiges!, betrag: v ?? 0 } })}
                    />
                  </Field>
                  <Field label="Beschreibung *" hint="z. B. Teilnahmebeitrag, Parkgebühr (keine Bewirtung).">
                    <TextInput
                      value={f.sonstiges.beschreibung}
                      onChange={(v) => setFahrt({ sonstiges: { ...f.sonstiges!, beschreibung: v } })}
                    />
                  </Field>
                </div>
              </DetailBox>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailBox({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-sm rounded-md border border-border p-md">
      <span className="text-sm font-semibold">
        <span className="mr-xs text-lg">{emoji}</span>
        {title}
      </span>
      {children}
    </div>
  );
}

// ── Step 4: Verpflegung & Übernachtung ──────────────────────────────────────────

function VerpflegungUebernachtungStep({
  state,
  update,
  onToggle,
  onBeleg,
  computed,
}: {
  state: ReisekostenState;
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  onToggle: (datum: string, patch: { fruehstueck?: boolean; mittagessen?: boolean; abendessen?: boolean }) => void;
  onBeleg: (b: ExtractBelegResponse) => void;
  computed: ReturnType<typeof computeReisekosten>;
}) {
  const hasZeitraum = !!state.reise.reisebeginn && !!state.reise.rueckkehr;
  const tage = computed.verpflegung.tage;
  const satzGesamt = tage.reduce((acc, t) => acc + t.basis, 0);
  const abzug = tage.reduce((acc, t) => acc + t.abzug, 0);
  const anAb = tage.filter((t) => t.typ === 'anreise' || t.typ === 'abreise');
  const voll = tage.filter((t) => t.typ === 'zwischen');
  const eintaegig = tage.filter((t) => t.typ === 'eintaegig');

  const u = state.uebernachtung;
  const setU = (patch: Partial<NonNullable<ReisekostenState['uebernachtung']>>) =>
    update((s) => ({ ...s, uebernachtung: s.uebernachtung ? { ...s.uebernachtung, ...patch } : null }));

  return (
    <div className="flex flex-col gap-lg">
      <Card>
        <CardHeader>
          <CardTitle>Verpflegungspauschale</CardTitle>
          <CardDescription>Wird automatisch aus dem Reisezeitraum berechnet</CardDescription>
        </CardHeader>
        <CardContent>
          {!hasZeitraum ? (
            <div className="flex items-start gap-sm rounded-md bg-background-alt p-md text-sm text-muted-foreground">
              <span className="text-xl leading-none">🗓️</span>
              <span>
                Bitte zuerst in <strong className="text-foreground">1. Reise</strong> Reisebeginn und Rückkehr angeben –
                die Pauschale wird daraus automatisch berechnet.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-lg">
              <div className="flex flex-col gap-md rounded-lg border border-primary bg-primary-50 p-lg dark:bg-primary-900/30">
                <div className="flex items-baseline justify-between gap-md">
                  <span className="text-sm font-semibold text-primary-700">Verpflegungspauschale</span>
                  <span className="text-3xl font-bold leading-none tabular-nums text-primary-700">
                    {eur(computed.verpflegung.summe)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-lg gap-y-xs text-sm text-primary-700">
                  <span>{eur(satzGesamt)} Anspruch</span>
                  <span>−</span>
                  <span>{eur(abzug)} gestellte Mahlzeiten</span>
                </div>
              </div>

              <div className="flex flex-col">
                {eintaegig.length > 0 && (
                  <BreakdownRow
                    emoji="🕗"
                    label={
                      eintaegig[0].basis > 0
                        ? 'Eintägige Reise (> 8 Std)'
                        : 'Eintägige Reise (≤ 8 Std – kein Anspruch)'
                    }
                    value={eintaegig.reduce((a, t) => a + t.basis, 0)}
                  />
                )}
                {anAb.length > 0 && (
                  <BreakdownRow
                    emoji="🚉"
                    label={`${anAb.length} An-/Abreisetag(e) × ${eur(anAb[0].basis)}`}
                    value={anAb.reduce((a, t) => a + t.basis, 0)}
                  />
                )}
                {voll.length > 0 && (
                  <BreakdownRow
                    emoji="📅"
                    label={`${voll.length} volle(r) Reisetag(e) × ${eur(voll[0].basis)}`}
                    value={voll.reduce((a, t) => a + t.basis, 0)}
                  />
                )}
              </div>

              <div className="flex flex-col gap-sm">
                <span className="text-sm font-semibold">Gestellte Mahlzeiten abziehen</span>
                <span className="text-xs text-muted-foreground">
                  Mahlzeiten, die z. B. vom Veranstalter gestellt wurden, werden von der Pauschale abgezogen.
                </span>
                <div className="mt-xs flex flex-col gap-sm">
                  {tage.map((t) => {
                    const abz = state.verpflegungAbzuege.find((a) => a.datum === t.datum);
                    return (
                      <div
                        key={t.datum}
                        className="flex flex-col gap-sm rounded-md border border-border p-md sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{t.datum}</span>
                          <span className="text-xs text-muted-foreground">
                            {eur(t.summe)}
                            {t.abzug ? ` (−${eur(t.abzug)})` : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-xs">
                          <MealChip
                            emoji="🥐"
                            label="Frühstück"
                            active={abz?.fruehstueck ?? false}
                            onClick={() => onToggle(t.datum, { fruehstueck: !(abz?.fruehstueck ?? false) })}
                          />
                          <MealChip
                            emoji="🍽️"
                            label="Mittag"
                            active={abz?.mittagessen ?? false}
                            onClick={() => onToggle(t.datum, { mittagessen: !(abz?.mittagessen ?? false) })}
                          />
                          <MealChip
                            emoji="🌙"
                            label="Abend"
                            active={abz?.abendessen ?? false}
                            onClick={() => onToggle(t.datum, { abendessen: !(abz?.abendessen ?? false) })}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Übernachtung</CardTitle>
          <CardDescription>Optional – nur bei mehrtägigen Reisen</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-md">
            <label className="flex cursor-pointer items-center gap-sm text-sm font-semibold">
              <Switch
                checked={u !== null}
                onChange={(on) =>
                  update((s) => ({ ...s, uebernachtung: on ? { modus: 'pauschal', betrag: null, naechte: 1 } : null }))
                }
              />
              Übernachtung anfügen
            </label>
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
                  <Field label="Nächte *">
                    <NumberInput value={u.naechte} step="1" placeholder="0" onChange={(v) => setU({ naechte: v })} />
                  </Field>
                )}
                {u.modus === 'beleg' && (
                  <>
                    <Field label="Betrag lt. Beleg (€) *">
                      <NumberInput value={u.betrag} onChange={(v) => setU({ betrag: v })} />
                    </Field>
                    <Field label="Hotelrechnung">
                      <BelegUpload
                        belegType="hotel"
                        title="Hotelrechnung hochladen"
                        onExtracted={(b) => {
                          onBeleg(b);
                          setU({ betrag: b.betrag ?? u.betrag });
                        }}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownRow({ emoji, label, value }: { emoji: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-md border-b border-border py-sm text-sm last:border-b-0">
      <span className="flex items-center gap-sm">
        <span className="text-base">{emoji}</span>
        {label}
      </span>
      <span className="font-semibold tabular-nums">{eur(value)}</span>
    </div>
  );
}

function MealChip({
  emoji,
  label,
  active,
  onClick,
}: {
  emoji: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-xs rounded-full border px-md py-xs text-sm font-medium transition-colors ${
        active
          ? 'border-primary bg-primary-50 text-primary-700 dark:bg-primary-900'
          : 'border-border text-muted-foreground hover:border-primary'
      }`}
    >
      <span className="text-base">{emoji}</span>
      {label}
    </button>
  );
}

// ── Step 5: Prüfen & Export ─────────────────────────────────────────────────────

function PruefenStep({
  state,
  belege,
  update,
  setStep,
  computed,
  clientFindings,
}: {
  state: ReisekostenState;
  belege: ExtractBelegResponse[];
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  setStep: (n: number) => void;
  computed: ReturnType<typeof computeReisekosten>;
  clientFindings: Finding[];
}) {
  const [serverFindings, setServerFindings] = useState<Finding[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findings = serverFindings ?? clientFindings;
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warn');
  const infos = findings.filter((f) => f.level === 'info');
  const hasError = errors.length > 0;
  const hasHinweis = warnings.length > 0 || infos.length > 0;

  // Group blocking errors by the step that owns them, for the jump-to-step panel.
  const errorGroups = useMemo(() => {
    const byStep = new Map<number, string[]>();
    for (const f of errors) {
      const idx = stepForField(f.field);
      const list = byStep.get(idx) ?? [];
      list.push(f.message.replace(/\.$/, ''));
      byStep.set(idx, list);
    }
    return [...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([idx, items]) => ({ idx, items }));
  }, [errors]);

  const posten = buildPosten(state, computed);

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

  const mailto = `mailto:reisekosten@gruene.de?subject=${encodeURIComponent(
    `Reisekostenabrechnung: ${state.reise.anlass || 'Dienstreise'}`,
  )}`;

  return (
    <div className="flex flex-col gap-lg">
      {hasError && (
        <div className="flex flex-col overflow-hidden rounded-lg bg-card shadow-sm">
          <div className="flex items-center gap-md bg-destructive/10 p-lg">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-destructive text-lg font-bold text-white">
              !
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-bold">
                {errors.length === 1 ? '1 Angabe fehlt noch' : `${errors.length} Angaben fehlen noch`}
              </span>
              <span className="text-xs text-muted-foreground">
                Tippe auf einen Schritt, um die Angaben zu ergänzen.
              </span>
            </div>
          </div>
          {errorGroups.map((g) => (
            <button
              key={g.idx}
              type="button"
              onClick={() => setStep(g.idx)}
              className="flex items-center gap-md border-t border-border p-lg text-left transition-colors hover:bg-background-alt"
            >
              <span className="flex size-7 flex-none items-center justify-center rounded-full bg-background-alt text-xs font-bold text-muted-foreground">
                {g.idx + 1}
              </span>
              <div className="flex flex-1 flex-col gap-xs">
                <span className="text-sm font-semibold">{STEPS[g.idx]}</span>
                <div className="flex flex-wrap gap-xs">
                  {g.items.map((it) => (
                    <span
                      key={it}
                      className="rounded-full bg-destructive/10 px-sm py-0.5 text-xs font-medium text-destructive"
                    >
                      {it}
                    </span>
                  ))}
                </div>
              </div>
              <span className="flex-none text-lg text-muted-foreground">→</span>
            </button>
          ))}
        </div>
      )}

      {!hasError && !hasHinweis && (
        <div className="flex items-start gap-md rounded-lg border border-primary bg-primary-50 p-lg dark:bg-primary-900/30">
          <span className="text-xl leading-none">✅</span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-primary-700">Alles vollständig</span>
            <span className="text-sm text-primary-700">Die Abrechnung kann exportiert werden.</span>
          </div>
        </div>
      )}
      {!hasError && hasHinweis && (
        <div className="flex items-start gap-md rounded-lg border border-amber-300 bg-amber-50 p-lg dark:bg-amber-950">
          <span className="text-xl leading-none">⚠️</span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-amber-800 dark:text-amber-200">Export möglich – bitte Hinweise prüfen</span>
            <span className="text-sm text-amber-800 dark:text-amber-200">
              Die Abrechnung ist vollständig, es gibt aber offene Hinweise (unten).
            </span>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prüfen & Spende</CardTitle>
          <CardDescription>Belege per KI abgleichen und optional eine Spende angeben.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-md">
            <Button variant="outline" onClick={() => void runCheck()} disabled={checking}>
              {checking ? 'Prüfe…' : '🔍 Mit KI prüfen (Belege abgleichen)'}
            </Button>
            {hasHinweis && (
              <div className="flex flex-col gap-xs">
                {warnings.map((w) => (
                  <div
                    key={`${w.field}-${w.message}`}
                    className="rounded-md border border-amber-300 bg-amber-50 px-md py-sm text-sm text-amber-800 dark:bg-amber-950"
                  >
                    ⚠️ {w.message}
                  </div>
                ))}
                {infos.map((i) => (
                  <div
                    key={`${i.field}-${i.message}`}
                    className="rounded-md border border-border px-md py-sm text-sm text-muted-foreground"
                  >
                    ℹ️ {i.message}
                  </div>
                ))}
              </div>
            )}
            <Field
              label="Spende an BÜNDNIS 90 / DIE GRÜNEN (optional)"
              hint="Bei der Steuererklärung werden 50 % der Spende zurückerstattet."
            >
              <NumberInput
                value={state.spende || null}
                onChange={(v) => update((s) => ({ ...s, spende: v ?? 0 }))}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abrechnung</CardTitle>
          <CardDescription>
            {[state.reise.anlass, state.reise.ziel].filter(Boolean).join(' · ') || 'Angaben aus Schritt 1'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {posten.map((p) => (
              <div
                key={p.name}
                className="flex justify-between gap-md border-b border-border py-sm text-sm last:border-b-0"
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{p.name}</span>
                  {p.detail && <span className="text-xs text-muted-foreground">{p.detail}</span>}
                </div>
                <span className="whitespace-nowrap tabular-nums">{p.betrag}</span>
              </div>
            ))}
            {state.spende > 0 && (
              <div className="flex justify-between gap-md border-b border-border py-sm text-sm">
                <span className="font-semibold">Spende</span>
                <span className="tabular-nums">−{eur(computed.spende)}</span>
              </div>
            )}
            <div className="flex justify-between pt-md text-base font-bold">
              <span>{state.spende > 0 ? 'Auszahlungsbetrag' : 'Erstattungsbetrag'}</span>
              <span className="tabular-nums text-primary-700">{eur(computed.auszahlung)}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="brand" disabled={hasError || generating} onClick={() => void download()}>
            {generating ? 'PDF wird erstellt…' : '📄 Als PDF exportieren'}
          </Button>
          <Button
            variant="brand-outline"
            disabled={hasError}
            onClick={() => {
              window.location.href = mailto;
            }}
          >
            Per E-Mail einreichen
          </Button>
        </CardFooter>
      </Card>

      {hasError && <span className="text-sm text-destructive">Bitte zuerst die offenen Angaben (oben) ergänzen.</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

function buildPosten(
  state: ReisekostenState,
  computed: ReturnType<typeof computeReisekosten>,
): Array<{ name: string; detail: string; betrag: string }> {
  const f = computed.fahrtkosten;
  const posten: Array<{ name: string; detail: string; betrag: string }> = [];
  if (state.fahrt.bahn) posten.push({ name: 'Bahn', detail: '2. Klasse', betrag: eur(f.bahn) });
  if (state.fahrt.oepnv) posten.push({ name: 'ÖPNV', detail: 'Nahverkehr', betrag: eur(f.oepnv) });
  if (state.fahrt.kfz)
    posten.push({ name: 'Kfz', detail: `${state.fahrt.kfz.km} km`, betrag: eur(f.kfz) });
  if (state.fahrt.miete) posten.push({ name: 'Mietwagen / Carsharing', detail: 'lt. Beleg', betrag: eur(f.miete) });
  if (state.fahrt.taxi)
    posten.push({ name: 'Taxi', detail: state.fahrt.taxi.begruendung || 'Begründung fehlt', betrag: eur(f.taxi) });
  if (state.fahrt.sonstiges)
    posten.push({
      name: 'Sonstiges',
      detail: state.fahrt.sonstiges.beschreibung || 'Beschreibung fehlt',
      betrag: eur(f.sonstiges),
    });
  if (computed.verpflegung.summe > 0)
    posten.push({
      name: 'Verpflegungspauschale',
      detail: `${computed.verpflegung.tage.length} Tag(e)`,
      betrag: eur(computed.verpflegung.summe),
    });
  if (computed.uebernachtung.summe > 0)
    posten.push({ name: 'Übernachtung', detail: 'lt. Angabe', betrag: eur(computed.uebernachtung.summe) });
  if (!posten.length)
    posten.push({ name: 'Noch keine Positionen', detail: 'Reisearten in Schritt 3 wählen', betrag: '–' });
  return posten;
}
