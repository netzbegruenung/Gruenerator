import { useId } from 'react';

import { FormRow, FormSection } from '../components/FormSection';
import { TextInput } from '../ui';

import type { SectionProps } from './types';

export function ReiseSection({ state, update }: SectionProps) {
  const id = useId();
  const r = state.reise;
  const set = (patch: Partial<typeof r>) =>
    update((st) => ({ ...st, reise: { ...st.reise, ...patch } }));

  return (
    <FormSection id="reise" titel="Reise" hilfe="frist">
      <FormRow label="Anlass der Reise" htmlFor={`${id}-anlass`}>
        <TextInput id={`${id}-anlass`} value={r.anlass} onChange={(v) => set({ anlass: v })} />
      </FormRow>
      <FormRow label="Ziel der Reise" htmlFor={`${id}-ziel`} hilfe="ziel">
        <TextInput
          id={`${id}-ziel`}
          value={r.ziel}
          onChange={(v) => set({ ziel: v })}
          placeholder="Straße, PLZ Ort"
        />
      </FormRow>
      <FormRow
        label="Reisebeginn"
        htmlFor={`${id}-beginn`}
        hilfe="reisezeiten"
        hint="Verlassen der Wohnung ab Haustür"
      >
        <TextInput
          id={`${id}-beginn`}
          type="datetime-local"
          value={r.reisebeginn}
          onChange={(v) => set({ reisebeginn: v })}
        />
      </FormRow>
      <FormRow
        label="Rückkehr"
        htmlFor={`${id}-rueckkehr`}
        hilfe="mitternacht"
        hint="Erreichen der eigenen Haustür"
      >
        <TextInput
          id={`${id}-rueckkehr`}
          type="datetime-local"
          value={r.rueckkehr}
          onChange={(v) => set({ rueckkehr: v })}
        />
      </FormRow>
    </FormSection>
  );
}
