import { getRate } from '@gruenerator/shared/reisekosten';
import { useId } from 'react';

import { BelegChips } from '../components/BelegChips';
import { FormRow, FormSection } from '../components/FormSection';
import { Checkbox, NumberInput, Select, TextInput } from '../ui';
import { eur } from '../utils/format';

import type { SectionWithTotalsProps } from './types';
import type { ReisekostenState } from '@gruenerator/contracts';

type Fahrt = ReisekostenState['fahrt'];

export function FahrtkostenSection({ state, update, computed, belege }: SectionWithTotalsProps) {
  const id = useId();
  const f = state.fahrt;
  const rate = getRate(state.rateKey);
  const set = (patch: Partial<Fahrt>) => update((s) => ({ ...s, fahrt: { ...s.fahrt, ...patch } }));

  return (
    <FormSection id="fahrtkosten" titel="1. Fahrtkosten" summe={eur(computed.fahrtkosten.summe)}>
      <FormRow
        label="1.1 Bahn"
        htmlFor={`${id}-bahn`}
        hilfe="bahn"
        hint="Höchstens DB-Flexpreis 2. Klasse, BahnCard-Rabatt bereits abgezogen."
      >
        <NumberInput
          id={`${id}-bahn`}
          value={f.bahn?.betrag ?? null}
          onChange={(v) =>
            set({
              bahn:
                v === null ? null : { betrag: v, belegVorhanden: f.bahn?.belegVorhanden ?? false },
            })
          }
        />
        <BelegChips belege={belege} posten="bahn" />
      </FormRow>

      <FormRow label="1.2 ÖPNV" htmlFor={`${id}-oepnv`} hilfe="oepnv">
        <NumberInput
          id={`${id}-oepnv`}
          value={f.oepnv?.betrag ?? null}
          onChange={(v) =>
            set({
              oepnv:
                v === null ? null : { betrag: v, belegVorhanden: f.oepnv?.belegVorhanden ?? false },
            })
          }
        />
        <BelegChips belege={belege} posten="oepnv" />
      </FormRow>

      <FormRow
        label="1.3 Kfz – Kilometer"
        htmlFor={`${id}-km`}
        hilfe="kfz"
        hint={
          f.kfz && f.kfz.km > 0
            ? `${eur(computed.fahrtkosten.kfz)} – Hin- und Rückweg zusammen, kürzeste Strecke laut Routenplaner.`
            : 'Hin- und Rückweg zusammen, kürzeste Strecke laut Routenplaner.'
        }
      >
        <div className="grid gap-sm sm:grid-cols-[1fr_16rem]">
          <NumberInput
            id={`${id}-km`}
            value={f.kfz?.km ?? null}
            step="0.1"
            placeholder="0"
            onChange={(v) =>
              set({
                kfz:
                  v === null
                    ? null
                    : {
                        ...(f.kfz ?? {
                          fahrzeug: 'pkw',
                          routenplanerVorhanden: false,
                          dbFlexpreis: null,
                        }),
                        km: v,
                      },
              })
            }
          />
          <Select
            value={f.kfz?.fahrzeug ?? 'pkw'}
            onChange={(v) =>
              f.kfz && set({ kfz: { ...f.kfz, fahrzeug: v === 'motorrad' ? 'motorrad' : 'pkw' } })
            }
            options={[
              { value: 'pkw', label: `Pkw (${eur(rate.kmSatzPkw)}/km)` },
              { value: 'motorrad', label: `Motorrad/Roller (${eur(rate.kmSatzMotorrad)}/km)` },
            ]}
          />
        </div>
        {f.kfz && f.kfz.km > rate.kmObergrenze && (
          <div className="flex items-center gap-xs">
            <Checkbox
              label={`Vorstandsbeschluss für mehr als ${rate.kmObergrenze} km liegt vor`}
              checked={f.kfz.vorstandsbeschluss === true}
              onChange={(on) => f.kfz && set({ kfz: { ...f.kfz, vorstandsbeschluss: on } })}
            />
          </div>
        )}
        <BelegChips belege={belege} posten="kfz" />
      </FormRow>

      <FormRow label="1.4 Mietwagen/Carsharing" htmlFor={`${id}-miete`} hilfe="miete">
        <NumberInput
          id={`${id}-miete`}
          value={f.miete?.betrag ?? null}
          onChange={(v) =>
            set({
              miete:
                v === null
                  ? null
                  : { ...(f.miete ?? { dbFlexpreis: null, belegVorhanden: false }), betrag: v },
            })
          }
        />
        {f.miete && (
          <Checkbox
            label="Vorstandsbeschluss liegt vor (Pflicht)"
            checked={f.miete.vorstandsbeschluss === true}
            onChange={(on) => f.miete && set({ miete: { ...f.miete, vorstandsbeschluss: on } })}
          />
        )}
        <BelegChips belege={belege} posten="miete" />
      </FormRow>

      <FormRow label="1.5 Taxi" htmlFor={`${id}-taxi`} hilfe="taxi">
        <NumberInput
          id={`${id}-taxi`}
          value={f.taxi?.betrag ?? null}
          onChange={(v) =>
            set({
              taxi:
                v === null
                  ? null
                  : { ...(f.taxi ?? { begruendung: '', belegVorhanden: false }), betrag: v },
            })
          }
        />
        {f.taxi && (
          <TextInput
            value={f.taxi.begruendung}
            onChange={(v) => f.taxi && set({ taxi: { ...f.taxi, begruendung: v } })}
            placeholder="Begründung, z. B. kein ÖPNV nach 23 Uhr"
          />
        )}
        <BelegChips belege={belege} posten="taxi" />
      </FormRow>

      <FormRow label="1.6 Sonstiges" htmlFor={`${id}-sonst`} hilfe="sonstiges">
        <NumberInput
          id={`${id}-sonst`}
          value={f.sonstiges?.betrag ?? null}
          onChange={(v) =>
            set({
              sonstiges:
                v === null ? null : { beschreibung: f.sonstiges?.beschreibung ?? '', betrag: v },
            })
          }
        />
        {f.sonstiges && (
          <TextInput
            value={f.sonstiges.beschreibung}
            onChange={(v) => f.sonstiges && set({ sonstiges: { ...f.sonstiges, beschreibung: v } })}
            placeholder="z. B. Teilnahmebeitrag, Parkgebühr"
          />
        )}
        <BelegChips belege={belege} posten="sonstiges" />
      </FormRow>
    </FormSection>
  );
}
