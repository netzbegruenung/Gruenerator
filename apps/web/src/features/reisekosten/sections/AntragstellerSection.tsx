import { useId } from 'react';
import { PiLockSimple } from 'react-icons/pi';

import { FormRow, FormSection } from '../components/FormSection';
import { istMusterIban } from '../privatStore';
import { TextInput } from '../ui';

import type { SectionProps } from './types';

export function AntragstellerSection({ state, update }: SectionProps) {
  const id = useId();
  const s = state.stammdaten;
  const set = (patch: Partial<typeof s>) =>
    update((st) => ({ ...st, stammdaten: { ...st.stammdaten, ...patch } }));

  return (
    <FormSection id="antragsteller" titel="Antragsteller*in" hilfe="antragsberechtigt">
      <FormRow label="Name" htmlFor={`${id}-name`}>
        <TextInput
          id={`${id}-name`}
          value={s.name}
          onChange={(v) => set({ name: v })}
          autoComplete="name"
        />
      </FormRow>
      <FormRow label="Funktion" htmlFor={`${id}-funktion`}>
        <TextInput
          id={`${id}-funktion`}
          value={s.funktion ?? ''}
          onChange={(v) => set({ funktion: v })}
          placeholder="z. B. Delegierte*r zum Länderrat"
        />
      </FormRow>
      <FormRow label="Wahl/Beschluss vom" htmlFor={`${id}-wahl`} hilfe="wahlBeschluss">
        <TextInput
          id={`${id}-wahl`}
          value={s.wahlBeschlussVom ?? ''}
          onChange={(v) => set({ wahlBeschlussVom: v })}
          placeholder="TT.MM.JJJJ"
        />
      </FormRow>
      <FormRow label="E-Mail für Rückfragen" htmlFor={`${id}-email`}>
        <TextInput
          id={`${id}-email`}
          type="email"
          value={s.email}
          onChange={(v) => set({ email: v })}
          autoComplete="email"
        />
      </FormRow>

      <div className="mt-2 flex items-center gap-2.5 border-t border-grey-100 pt-[18px] text-[13px] text-muted-foreground dark:border-grey-800">
        <PiLockSimple aria-hidden className="size-4 shrink-0" />
        Die folgenden Angaben bleiben nur auf diesem Gerät und werden nie an den Grünerator
        gesendet.
      </div>
      <FormRow label="Straße und Hausnr." htmlFor={`${id}-strasse`}>
        <div className="grid grid-cols-[1fr_5.25rem] gap-2.5">
          <TextInput
            id={`${id}-strasse`}
            value={s.strasse}
            onChange={(v) => set({ strasse: v })}
            autoComplete="address-line1"
          />
          <TextInput value={s.hausnr} onChange={(v) => set({ hausnr: v })} placeholder="Nr." />
        </div>
      </FormRow>
      <FormRow label="PLZ und Ort" htmlFor={`${id}-plz`}>
        <div className="grid grid-cols-[6.25rem_1fr] gap-2.5">
          <TextInput
            id={`${id}-plz`}
            value={s.plz}
            onChange={(v) => set({ plz: v })}
            inputMode="numeric"
            autoComplete="postal-code"
          />
          <TextInput
            value={s.ort}
            onChange={(v) => set({ ort: v })}
            autoComplete="address-level2"
            placeholder="Ort"
          />
        </div>
      </FormRow>
      <FormRow label="Telefon für Rückfragen" htmlFor={`${id}-tel`}>
        <TextInput
          id={`${id}-tel`}
          type="tel"
          value={s.telefon ?? ''}
          onChange={(v) => set({ telefon: v })}
          autoComplete="tel"
        />
      </FormRow>
      <FormRow
        label="IBAN"
        htmlFor={`${id}-iban`}
        hilfe="iban"
        {...(istMusterIban(s.iban)
          ? { hint: 'Musterdaten – bitte durch deine IBAN ersetzen.' }
          : {})}
      >
        <TextInput id={`${id}-iban`} value={s.iban} onChange={(v) => set({ iban: v })} />
      </FormRow>
      <FormRow label="BIC" htmlFor={`${id}-bic`}>
        <TextInput id={`${id}-bic`} value={s.bic ?? ''} onChange={(v) => set({ bic: v })} />
      </FormRow>
    </FormSection>
  );
}
