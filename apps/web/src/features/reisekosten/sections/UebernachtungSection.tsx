import { useId } from 'react';

import { BelegChips } from '../components/BelegChips';
import { FormRow, FormSection } from '../components/FormSection';
import { NumberInput } from '../ui';
import { eur } from '../utils/format';

import type { SectionWithTotalsProps } from './types';
import type { Uebernachtung, UebernachtungModus } from '@gruenerator/contracts';

type Wahl = UebernachtungModus | 'keine';

const OPTIONEN: ReadonlyArray<{ value: Wahl; label: string }> = [
  { value: 'keine', label: 'Keine Übernachtung' },
  { value: 'lv_bezahlt', label: 'Vom Bundes-/Landes-/Kreisverband bezahlt' },
  { value: 'beleg', label: 'Laut beiliegendem Beleg' },
  { value: 'pauschal', label: 'Pauschal, z. B. bei Bekannten (20 € je Nacht)' },
];

export function UebernachtungSection({ state, update, computed, belege }: SectionWithTotalsProps) {
  const id = useId();
  const u = state.uebernachtung;
  const wahl: Wahl = u?.modus ?? 'keine';

  const setU = (next: Uebernachtung | null) => update((s) => ({ ...s, uebernachtung: next }));
  const choose = (w: Wahl) =>
    setU(
      w === 'keine'
        ? null
        : {
            modus: w,
            betrag: u?.betrag ?? null,
            naechte: u?.naechte ?? (w === 'pauschal' ? 1 : null),
          }
    );

  return (
    <FormSection
      id="uebernachtung"
      titel="3. Übernachtungskosten"
      hilfe="uebernachtung"
      summe={eur(computed.uebernachtung.summe)}
    >
      <fieldset className="m-0 flex flex-col gap-xs border-0 px-lg py-sm">
        <legend className="sr-only">Art der Übernachtung</legend>
        {OPTIONEN.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-sm text-sm">
            <input
              type="radio"
              name={`${id}-modus`}
              value={o.value}
              checked={wahl === o.value}
              onChange={() => choose(o.value)}
              className="size-4 accent-primary"
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      {u?.modus === 'beleg' && (
        <FormRow label="Betrag laut Beleg" htmlFor={`${id}-betrag`} hilfe="hotelfruehstueck">
          <NumberInput
            id={`${id}-betrag`}
            value={u.betrag}
            onChange={(v) => setU({ ...u, betrag: v })}
          />
          <BelegChips belege={belege} posten="uebernachtung" />
        </FormRow>
      )}
      {u?.modus === 'pauschal' && (
        <FormRow label="Nächte" htmlFor={`${id}-naechte`} hilfe="uebernachtungPauschal">
          <NumberInput
            id={`${id}-naechte`}
            value={u.naechte}
            step="1"
            placeholder="0"
            onChange={(v) => setU({ ...u, naechte: v })}
          />
        </FormRow>
      )}
    </FormSection>
  );
}

export function SummeSection({ state, update, computed }: Omit<SectionWithTotalsProps, 'belege'>) {
  const id = useId();
  return (
    <FormSection id="summe" titel="Gesamtbetrag" summe={eur(computed.gesamt)}>
      <FormRow label="Davon spende ich" htmlFor={`${id}-spende`} hilfe="spende">
        <NumberInput
          id={`${id}-spende`}
          value={state.spende || null}
          onChange={(v) => update((s) => ({ ...s, spende: Math.min(v ?? 0, computed.gesamt) }))}
        />
      </FormRow>
      <div className="flex items-center justify-between gap-md px-lg py-md">
        <span className="text-sm font-semibold">Auszahlung auf mein Konto</span>
        <span className="text-xl font-bold tabular-nums text-primary-700 dark:text-primary-300">
          {eur(computed.auszahlung)}
        </span>
      </div>
    </FormSection>
  );
}
