/**
 * The poster's V.i.S.d.P. (DE) / Impressum (AT) as the canvas carries it: one
 * text element, `V.i.S.d.P.: <name>, <anschrift>` or
 * `Impressum: <medieninhaber>, <anschrift>`. The export gate reads that text
 * back, so what counts as filled in is decided here.
 */
import { type CanvasImprintParts } from '@ggraphic/editor/services';
import { PRINT_IMPRESSUM_PLACEHOLDERS } from '@gruenerator/contracts';

const PREFIX = { 'de-DE': 'V.i.S.d.P.:', 'de-AT': 'Impressum:' } as const;

export type ImpressumLocale = keyof typeof PREFIX;

/** Austrian pages (`freeform-at`) carry the AT prefix, every other page the DE one. */
export function impressumLocaleOf(page: { configId: string } | null): ImpressumLocale {
  return page?.configId === 'freeform-at' ? 'de-AT' : 'de-DE';
}

export interface ImpressumParts {
  /** Name (DE) or Medieninhaber (AT). */
  name: string;
  anschrift: string;
}

/**
 * The editor's imprint parts. Ours keep `anschrift`: it is the field of the print
 * spec on the wire and in stored Vorlagen (`printCreator.ts`, F0), the editor
 * calls it `address`. The print service maps at that seam.
 */
export const toImprintParts = ({ name, anschrift }: ImpressumParts): CanvasImprintParts => ({
  name,
  address: anschrift,
});
export const fromImprintParts = ({ name, address }: CanvasImprintParts): ImpressumParts => ({
  name,
  anschrift: address,
});

/** The values the gallery templates ship with; they stand for „not filled in yet“. */
const PLACEHOLDERS: ReadonlySet<string> = new Set(PRINT_IMPRESSUM_PLACEHOLDERS);

export function impressumLine(locale: ImpressumLocale, parts: ImpressumParts): string {
  return `${PREFIX[locale]} ${parts.name.trim()}, ${parts.anschrift.trim()}`;
}

/**
 * Splits the element text at the first comma; a missing prefix or comma leaves the part empty.
 * Known limit: a comma inside the name (e.g. "Müller, Anna") splits wrongly when the form is
 * re-opened with the stored line. Only the prefill is affected, the gate is not.
 */
export function parseImpressumLine(locale: ImpressumLocale, text: string): ImpressumParts {
  const prefix = PREFIX[locale];
  const body = (text.trim().startsWith(prefix) ? text.trim().slice(prefix.length) : text).trim();
  const comma = body.indexOf(',');
  if (comma < 0) return { name: body, anschrift: '' };
  return { name: body.slice(0, comma).trim(), anschrift: body.slice(comma + 1).trim() };
}

/** A field counts once it is non-empty and not one of the gallery placeholders. */
export function isFilled(value: string): boolean {
  const v = value.trim();
  return v !== '' && !PLACEHOLDERS.has(v);
}

export function isImpressumComplete(parts: ImpressumParts): boolean {
  return isFilled(parts.name) && isFilled(parts.anschrift);
}

export const IMPRESSUM_LABELS: Record<
  ImpressumLocale,
  { name: string; hint: string; namePlaceholder: string }
> = {
  'de-DE': {
    name: 'Name',
    namePlaceholder: 'Vorname Nachname',
    hint: 'Für Plakate ist V.i.S.d.P. mit Name und Anschrift Pflicht.',
  },
  'de-AT': {
    name: 'Medieninhaber',
    namePlaceholder: 'Name/Organisation',
    hint: 'Für Plakate ist ein Impressum mit Medieninhaber und Anschrift Pflicht.',
  },
};
