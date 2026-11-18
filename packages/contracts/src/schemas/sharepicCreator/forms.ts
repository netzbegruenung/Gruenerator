import { z } from 'zod';

/**
 * What a sharepic can be. A request that names one gets it; otherwise the
 * creator picks one and offers two others as alternatives.
 *
 * `stichworte` are words people order the form with — shown to them as
 * hints, and listed to the creator's model, which reads the order.
 */
export const SHAREPIC_FORMS = [
  { id: 'einzelbild', label: 'Einzelbild', stichworte: ['Einzelbild'] },
  { id: 'zitat', label: 'Zitat', stichworte: ['Zitat'] },
  { id: 'karussell', label: 'Karussell', stichworte: ['Karussell', 'Slider'] },
  { id: 'interview', label: 'Interview', stichworte: ['Interview'] },
  { id: 'infografik', label: 'Infografik', stichworte: ['Infografik', 'Starterpack'] },
  { id: 'diagramm', label: 'Diagramm', stichworte: ['Diagramm', 'Balkendiagramm'] },
  { id: 'zahl', label: 'Große Zahl', stichworte: ['große Zahl', 'Countdown'] },
  { id: 'rechnung', label: 'Rechnung', stichworte: ['Rechenweg', 'als Rechnung'] },
  { id: 'termine', label: 'Termine', stichworte: ['Terminübersicht', 'Save the Date'] },
  {
    id: 'schlagzeile',
    label: 'Schlagzeile',
    stichworte: ['Schlagzeile', 'Zeitungsausschnitt', 'Good News'],
  },
  { id: 'bingo', label: 'Bingo', stichworte: ['Bingo'] },
  { id: 'vergleich', label: 'Vergleich', stichworte: ['Gegenüberstellung', 'Vergleichsgrafik'] },
  { id: 'faktencheck', label: 'Faktencheck', stichworte: ['Faktencheck', 'Mythencheck'] },
  { id: 'faktenbild', label: 'Faktenbild', stichworte: ['Faktenbild'] },
  { id: 'veranstaltung', label: 'Veranstaltung', stichworte: ['Veranstaltung', 'Einladung'] },
  { id: 'vorstellung', label: 'Vorstellung', stichworte: ['Steckbrief', 'Vorstellungspost'] },
] as const;
export type SharepicFormId = (typeof SHAREPIC_FORMS)[number]['id'];
export const sharepicFormSchema = z.enum(
  SHAREPIC_FORMS.map((f) => f.id) as [SharepicFormId, ...SharepicFormId[]]
);

export function sharepicFormLabel(id: SharepicFormId): string {
  return SHAREPIC_FORMS.find((f) => f.id === id)!.label;
}

export function sharepicFormStichworte(id: SharepicFormId): readonly string[] {
  return SHAREPIC_FORMS.find((f) => f.id === id)!.stichworte;
}

const ALTERNATIVE_PREFIX = 'Andere Variante als ';

/**
 * What the chat's „Als …" chip sends for a fresh draft in another form. The
 * API reads it back with `sharepicAlternativeForm` as a pick, like a Studio
 * chip — the creator's model took „Andere Variante" for a plain new variant
 * (0 of 8, 09.11.2026).
 */
export function sharepicAlternativeRequest(id: SharepicFormId): string {
  return `${ALTERNATIVE_PREFIX}${sharepicFormLabel(id)}`;
}

/** The form a chip's request picks, or null for anything a person typed differently. */
export function sharepicAlternativeForm(text: string): SharepicFormId | null {
  const t = text.trim();
  return SHAREPIC_FORMS.find((f) => t === `${ALTERNATIVE_PREFIX}${f.label}`)?.id ?? null;
}
