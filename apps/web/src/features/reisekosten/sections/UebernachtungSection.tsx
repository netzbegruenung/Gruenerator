import { cn } from '@gruenerator/ui';
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
      <fieldset className="m-0 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2 border-0 p-0">
        <legend className="sr-only">Art der Übernachtung</legend>
        {OPTIONEN.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50',
              wahl === o.value
                ? 'bg-primary-50 shadow-[inset_0_0_0_1.5px_var(--color-primary)] dark:bg-primary-950'
                : 'bg-grey-50 dark:bg-grey-800'
            )}
          >
            <input
              type="radio"
              name={`${id}-modus`}
              value={o.value}
              checked={wahl === o.value}
              onChange={() => choose(o.value)}
              className="size-[18px] shrink-0 accent-primary"
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
            einheit=""
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
      <div className="flex items-baseline justify-between gap-3 border-t border-grey-100 pt-4 dark:border-grey-800">
        <span className="text-[15px] font-bold">Auszahlung auf mein Konto</span>
        <span className="font-[Raleway,sans-serif] text-[26px] font-extrabold tabular-nums text-primary-700 dark:text-primary-300">
          {eur(computed.auszahlung)}
        </span>
      </div>
    </FormSection>
  );
}
