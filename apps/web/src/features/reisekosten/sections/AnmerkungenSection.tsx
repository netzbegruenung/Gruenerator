import { useId } from 'react';

import { FormRow, FormSection } from '../components/FormSection';
import { TextArea } from '../ui';

import type { SectionProps } from './types';

const MAX = 4000;

/** Remarks for whoever checks the claim; the form itself has no field for them. */
export function AnmerkungenSection({ state, update }: SectionProps) {
  const id = useId();
  const text = state.anmerkungen ?? '';
  return (
    <FormSection id="anmerkungen" titel="Anmerkungen & Ergänzungen" hilfe="anmerkungen">
      <FormRow
        label="Anmerkungen zur Abrechnung"
        htmlFor={`${id}-text`}
        hint={`Erscheint im PDF auf einer eigenen Seite nach dem Formular. Kommentare zu einzelnen Belegen trägst du direkt am Beleg ein. ${text.length}/${MAX} Zeichen`}
      >
        <TextArea
          id={`${id}-text`}
          value={text}
          maxLength={MAX}
          placeholder="z. B. Abfahrt vom Arbeitsort statt vom Wohnort, weil … · Hin- und Rückfahrt stehen auf einer Rechnung"
          onChange={(v) => update((s) => ({ ...s, anmerkungen: v }))}
        />
      </FormRow>
    </FormSection>
  );
}
