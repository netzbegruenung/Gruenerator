/**
 * Step 1: pick the Landesverband (remembered on this device), then the event
 * the trip was for. Picking one creates the draft and opens the form.
 */
import {
  emptyReisekostenState,
  LANDESVERBAENDE,
  reisezeitenVon,
  veranstaltungenFuer,
  type Landesverband,
  type Veranstaltung,
} from '@gruenerator/shared/reisekosten';
import { Alert, AlertDescription } from '@gruenerator/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { PiArrowRight, PiClockCounterClockwise, PiUsersThree, PiX } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import { useProfileStore } from '../../stores/profileStore';

import { useAbrechnungen, useCreateAbrechnung } from './api';
import { DatumKachel } from './components/DatumKachel';
import { ExperimentHinweis } from './components/ExperimentHinweis';
import { ortVon, zeitraumMitOrt } from './utils/format';

import type { ReisekostenServerState } from '@gruenerator/contracts';

const LV_KEY = 'reisekosten-landesverband';

function gespeicherterLv(): Landesverband | null {
  try {
    const v = localStorage.getItem(LV_KEY);
    return (LANDESVERBAENDE as readonly string[]).includes(v ?? '') ? (v as Landesverband) : null;
  } catch {
    return null;
  }
}

function merkeLv(lv: Landesverband | null) {
  try {
    if (lv) localStorage.setItem(LV_KEY, lv);
    else localStorage.removeItem(LV_KEY);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

function profilName(profile: Record<string, unknown> | null): string {
  if (!profile) return '';
  const display = typeof profile.display_name === 'string' ? profile.display_name : '';
  const parts = [profile.first_name, profile.last_name].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  );
  return display || parts.join(' ');
}

const karteCls =
  'flex w-full cursor-pointer items-center rounded-2xl border-0 bg-background-pure text-left text-foreground shadow-[0_0_0_1px_rgba(20,40,30,.06),0_2px_10px_rgba(20,40,30,.06)] transition-shadow hover:shadow-[0_0_0_2px_var(--color-primary),0_6px_18px_rgba(20,40,30,.08)] focus-visible:shadow-[0_0_0_2px_var(--color-primary)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 dark:shadow-[0_0_0_1px_var(--color-grey-700)]';

function EventKarte({
  kachel,
  titel,
  unterzeile,
  disabled,
  onClick,
}: {
  kachel: ReactNode;
  titel: string;
  unterzeile: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${karteCls} grid grid-cols-[auto_minmax(0,1fr)_auto] gap-5 px-5 py-[18px]`}
    >
      {kachel}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-[Raleway,sans-serif] text-lg leading-tight font-bold text-pretty">
          {titel}
        </span>
        {unterzeile && <span className="text-sm text-muted-foreground">{unterzeile}</span>}
      </span>
      <PiArrowRight aria-hidden className="size-5 text-primary" />
    </button>
  );
}

function EventPageInner() {
  const navigate = useNavigate();
  const profile = useProfileStore((s) => s.profile) as Record<string, unknown> | null;
  const { data: abrechnungen } = useAbrechnungen();
  const create = useCreateAbrechnung();
  const [lv, setLv] = useState<Landesverband | null>(gespeicherterLv);

  const waehleLv = (next: Landesverband | null) => {
    merkeLv(next);
    setLv(next);
  };

  // Computed once per Landesverband; fresh enough for a page visit.
  const events = useMemo(() => (lv ? veranstaltungenFuer(lv, new Date()) : []), [lv]);

  // "Zuletzt verwendet": distinct events of the user's own Abrechnungen.
  const zuletzt = useMemo(() => {
    const seen = new Set(events.map((v) => `${v.anlass}|${v.ziel}`));
    const out: Array<{ id: string; anlass: string; ziel: string }> = [];
    for (const a of abrechnungen ?? []) {
      const { anlass, ziel } = a.state.reise;
      const k = `${anlass}|${ziel}`;
      if (!anlass || seen.has(k)) continue;
      seen.add(k);
      out.push({ id: a.id, anlass, ziel });
      if (out.length >= 4) break;
    }
    return out;
  }, [abrechnungen, events]);

  const starte = async (reise: ReisekostenServerState['reise'], funktion?: string) => {
    const state: ReisekostenServerState = {
      ...emptyReisekostenState(),
      stammdaten: {
        name: profilName(profile),
        email: typeof profile?.email === 'string' ? profile.email : '',
        ...(funktion ? { funktion } : {}),
      },
      reise,
    };
    const abrechnung = await create.mutateAsync(state);
    void navigate(`/reisekosten/${abrechnung.slug}`);
  };

  const ausEvent = (v: Veranstaltung) =>
    void starte({ anlass: v.anlass, ziel: v.ziel, ...reisezeitenVon(v) }, v.funktion);
  const leer = { anlass: '', ziel: '', reisebeginn: '', rueckkehr: '' };

  return (
    <div className="flex w-full justify-center px-md pt-14 pb-14">
      <div className="flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-2.5">
          <span className="text-[13px] font-bold tracking-[.08em] text-primary-700 uppercase dark:text-primary-300">
            {lv ? 'Schritt 1 von 2 · Veranstaltung' : 'Reisekosten abrechnen'}
          </span>
          <h1 className="m-0 text-[clamp(30px,4vw,40px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-foreground-heading">
            {lv ? 'Wohin bist du gereist?' : 'Aus welchem Landesverband bist du?'}
          </h1>
          <p className="m-0 max-w-[560px] text-[17px] leading-normal text-pretty text-muted-foreground">
            {lv
              ? 'Wähle die Veranstaltung. Danach füllen wir das NRW-Formular so weit wie möglich für dich aus.'
              : 'Wir zeigen dir dann nur die Veranstaltungen, die für dich relevant sind.'}
          </p>
        </header>

        {!lv && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {LANDESVERBAENDE.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => waehleLv(name)}
                className={`${karteCls} justify-between gap-2.5 px-[18px] py-4`}
              >
                <span className="text-[15px] font-bold">{name}</span>
                <PiArrowRight aria-hidden className="shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {lv && (
          <div className="flex flex-col gap-3.5">
            <span className="flex w-fit items-center gap-2 rounded-full bg-grey-100 py-1.5 pr-2 pl-3.5 text-sm font-bold dark:bg-grey-800">
              {lv}
              <button
                type="button"
                onClick={() => waehleLv(null)}
                aria-label="Landesverband ändern"
                className="flex size-[22px] items-center justify-center rounded-full bg-background-pure p-0 text-foreground"
              >
                <PiX aria-hidden className="size-3" />
              </button>
            </span>

            {events.map((v) => (
              <EventKarte
                key={v.id}
                kachel={
                  v.beginn ? (
                    <DatumKachel iso={v.beginn} />
                  ) : (
                    <DatumKachel icon={<PiUsersThree aria-hidden className="size-7" />} />
                  )
                }
                titel={v.anlass}
                unterzeile={zeitraumMitOrt(v.beginn, v.ende, ortVon(v.ziel) || v.hinweis || '')}
                disabled={create.isPending}
                onClick={() => ausEvent(v)}
              />
            ))}

            {zuletzt.length > 0 && (
              <>
                <h2 className="m-0 mt-2 text-sm font-semibold text-muted-foreground">
                  Zuletzt verwendet
                </h2>
                {zuletzt.map((z) => (
                  <EventKarte
                    key={z.id}
                    kachel={
                      <DatumKachel
                        icon={<PiClockCounterClockwise aria-hidden className="size-7" />}
                      />
                    }
                    titel={z.anlass}
                    unterzeile={z.ziel}
                    disabled={create.isPending}
                    onClick={() => void starte({ ...leer, anlass: z.anlass, ziel: z.ziel })}
                  />
                ))}
              </>
            )}

            <button
              type="button"
              onClick={() => void starte(leer)}
              disabled={create.isPending}
              className="cursor-pointer self-start border-0 bg-transparent p-0 pt-1 text-sm text-primary hover:underline"
            >
              Reise ohne Veranstaltung abrechnen
            </button>
          </div>
        )}

        {create.isError && (
          <Alert variant="destructive">
            <AlertDescription>Die Abrechnung konnte nicht angelegt werden.</AlertDescription>
          </Alert>
        )}

        <ExperimentHinweis />
      </div>
    </div>
  );
}

export default withAuthRequired(EventPageInner, { title: 'Reisekosten abrechnen' });
