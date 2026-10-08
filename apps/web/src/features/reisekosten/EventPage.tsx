/**
 * Step 1: pick the event the trip was for. A predefined one, one used before,
 * or a custom one — then "Weiter" creates the draft and opens the form.
 */
import { emptyReisekostenState, VERANSTALTUNGEN } from '@gruenerator/shared/reisekosten';
import { Alert, AlertDescription, Button, SelectCard } from '@gruenerator/ui';
import { useId, useMemo, useState } from 'react';
import {
  PiArrowRight,
  PiCalendarPlus,
  PiClockCounterClockwise,
  PiUsersThree,
} from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import { useProfileStore } from '../../stores/profileStore';

import { useAbrechnungen, useCreateAbrechnung } from './api';
import { TextInput } from './ui';

import type { ReisekostenServerState } from '@gruenerator/contracts';

interface EventWahl {
  key: string;
  anlass: string;
  ziel: string;
  beginn?: string;
  ende?: string;
}

function zeitraum(beginn: string, ende: string): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      ...(withYear ? { year: 'numeric' } : {}),
    });
  return `${fmt(beginn, false)}–${fmt(ende, true)}`;
}

function beschreibung(v: EventWahl): string {
  const teile = [v.beginn && v.ende ? zeitraum(v.beginn, v.ende) : '', v.ziel].filter(Boolean);
  return teile.join(' · ');
}

const EIGENES = 'eigenes';

const VORLAGEN: EventWahl[] = VERANSTALTUNGEN.map((v) => ({
  key: `v:${v.id}`,
  anlass: v.anlass,
  ziel: v.ziel,
  ...(v.beginn ? { beginn: v.beginn } : {}),
  ...(v.ende ? { ende: v.ende } : {}),
}));

function profilName(profile: Record<string, unknown> | null): string {
  if (!profile) return '';
  const display = typeof profile.display_name === 'string' ? profile.display_name : '';
  const parts = [profile.first_name, profile.last_name].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  );
  return display || parts.join(' ');
}

function EventPageInner() {
  const id = useId();
  const navigate = useNavigate();
  const profile = useProfileStore((s) => s.profile) as Record<string, unknown> | null;
  const { data: abrechnungen } = useAbrechnungen();
  const create = useCreateAbrechnung();

  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [eigen, setEigen] = useState({ anlass: '', ziel: '', reisebeginn: '', rueckkehr: '' });

  // "Zuletzt verwendet": distinct events of the user's own Abrechnungen.
  const zuletzt = useMemo<EventWahl[]>(() => {
    const seen = new Set(VORLAGEN.map((v) => `${v.anlass}|${v.ziel}`));
    const out: EventWahl[] = [];
    for (const a of abrechnungen ?? []) {
      const { anlass, ziel } = a.state.reise;
      const k = `${anlass}|${ziel}`;
      if (!anlass || seen.has(k)) continue;
      seen.add(k);
      out.push({ key: `z:${a.id}`, anlass, ziel });
      if (out.length >= 4) break;
    }
    return out;
  }, [abrechnungen]);

  const auswahl = [...VORLAGEN, ...zuletzt].find((e) => e.key === gewaehlt);
  const kannWeiter = gewaehlt === EIGENES ? eigen.anlass.trim().length > 0 : !!auswahl;

  const weiter = async () => {
    const base = emptyReisekostenState();
    const reise =
      gewaehlt === EIGENES
        ? { ...eigen, anlass: eigen.anlass.trim(), ziel: eigen.ziel.trim() }
        : {
            anlass: auswahl?.anlass ?? '',
            ziel: auswahl?.ziel ?? '',
            reisebeginn: auswahl?.beginn ?? '',
            rueckkehr: auswahl?.ende ?? '',
          };
    const state: ReisekostenServerState = {
      ...base,
      stammdaten: {
        name: profilName(profile),
        email: typeof profile?.email === 'string' ? profile.email : '',
      },
      reise,
    };
    const abrechnung = await create.mutateAsync(state);
    void navigate(`/reisekosten/${abrechnung.slug}`);
  };

  return (
    <PageContainer
      maxWidth="md"
      title="Reisekosten abrechnen"
      subtitle="Für welche Veranstaltung warst du unterwegs? Danach füllen wir das NRW-Formular so weit wie möglich für dich aus."
    >
      <div className="flex flex-col gap-lg">
        <section aria-labelledby={`${id}-vorlagen`} className="flex flex-col gap-sm">
          <h2
            id={`${id}-vorlagen`}
            className="m-0 text-sm font-semibold text-grey-700 dark:text-grey-300"
          >
            Veranstaltungen
          </h2>
          <div className="grid gap-sm sm:grid-cols-2">
            {VORLAGEN.map((v) => (
              <SelectCard
                key={v.key}
                label={v.anlass}
                {...(beschreibung(v) ? { description: beschreibung(v) } : {})}
                icon={<PiUsersThree aria-hidden />}
                selected={gewaehlt === v.key}
                onClick={() => setGewaehlt(v.key)}
              />
            ))}
            <SelectCard
              label="Eigenes Event"
              description="Anlass und Ort selbst eintragen"
              icon={<PiCalendarPlus aria-hidden />}
              selected={gewaehlt === EIGENES}
              onClick={() => setGewaehlt(EIGENES)}
            />
          </div>
        </section>

        {zuletzt.length > 0 && (
          <section aria-labelledby={`${id}-zuletzt`} className="flex flex-col gap-sm">
            <h2
              id={`${id}-zuletzt`}
              className="m-0 text-sm font-semibold text-grey-700 dark:text-grey-300"
            >
              Zuletzt verwendet
            </h2>
            <div className="grid gap-sm sm:grid-cols-2">
              {zuletzt.map((v) => (
                <SelectCard
                  key={v.key}
                  label={v.anlass}
                  {...(v.ziel ? { description: v.ziel } : {})}
                  icon={<PiClockCounterClockwise aria-hidden />}
                  selected={gewaehlt === v.key}
                  onClick={() => setGewaehlt(v.key)}
                />
              ))}
            </div>
          </section>
        )}

        {gewaehlt === EIGENES && (
          <div className="grid gap-sm rounded-[14px] border border-grey-200 p-md sm:grid-cols-2 dark:border-grey-700">
            <div className="flex flex-col gap-xs">
              <label htmlFor={`${id}-anlass`} className="text-sm font-medium">
                Anlass
              </label>
              <TextInput
                id={`${id}-anlass`}
                value={eigen.anlass}
                onChange={(v) => setEigen({ ...eigen, anlass: v })}
                placeholder="z. B. Kreisvorstandsklausur"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor={`${id}-ziel`} className="text-sm font-medium">
                Ziel (Anschrift)
              </label>
              <TextInput
                id={`${id}-ziel`}
                value={eigen.ziel}
                onChange={(v) => setEigen({ ...eigen, ziel: v })}
                placeholder="Straße, PLZ Ort"
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor={`${id}-reisebeginn`} className="text-sm font-medium">
                Reisebeginn (optional)
              </label>
              <TextInput
                id={`${id}-reisebeginn`}
                type="datetime-local"
                value={eigen.reisebeginn}
                onChange={(v) => setEigen({ ...eigen, reisebeginn: v })}
              />
            </div>
            <div className="flex flex-col gap-xs">
              <label htmlFor={`${id}-rueckkehr`} className="text-sm font-medium">
                Rückkehr (optional)
              </label>
              <TextInput
                id={`${id}-rueckkehr`}
                type="datetime-local"
                value={eigen.rueckkehr}
                onChange={(v) => setEigen({ ...eigen, rueckkehr: v })}
              />
            </div>
          </div>
        )}

        {create.isError && (
          <Alert variant="destructive">
            <AlertDescription>Die Abrechnung konnte nicht angelegt werden.</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button
            variant="brand"
            onClick={() => void weiter()}
            disabled={!kannWeiter || create.isPending}
          >
            Weiter
            <PiArrowRight aria-hidden />
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

export default withAuthRequired(EventPageInner, { title: 'Reisekosten abrechnen' });
