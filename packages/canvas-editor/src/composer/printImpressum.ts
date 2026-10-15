/**
 * The poster's V.i.S.d.P. (DE) / Impressum (AT) as the canvas carries it: one
 * text element, `V.i.S.d.P.: <name>, <anschrift>` or
 * `Impressum: <medieninhaber>, <anschrift>`. The export gate reads that text
 * back, so what counts as filled in is decided here.
 */
import { PRINT_VORLAGEN } from './printVorlagen';

const PREFIX = { 'de-DE': 'V.i.S.d.P.:', 'de-AT': 'Impressum:' } as const;

export type ImpressumLocale = keyof typeof PREFIX;

export interface ImpressumParts {
  /** Name (DE) or Medieninhaber (AT). */
  name: string;
  anschrift: string;
}

/** The values the gallery templates ship with; they stand for „not filled in yet“. */
const PLACEHOLDERS: ReadonlySet<string> = new Set(
  PRINT_VORLAGEN.flatMap(({ spec }) => {
    const { impressum } = spec;
    if (!impressum) return [];
    return [
      impressum.art === 'visdp' ? impressum.name : impressum.medieninhaber,
      impressum.anschrift,
    ];
  }).map((v) => v.trim())
);

export function impressumLine(locale: ImpressumLocale, parts: ImpressumParts): string {
  return `${PREFIX[locale]} ${parts.name.trim()}, ${parts.anschrift.trim()}`;
}

/** Splits the element text at the first comma; a missing prefix or comma leaves the part empty. */
export function parseImpressumLine(locale: ImpressumLocale, text: string): ImpressumParts {
  const prefix = PREFIX[locale];
  const body = (text.trim().startsWith(prefix) ? text.trim().slice(prefix.length) : text).trim();
  const comma = body.indexOf(',');
  if (comma < 0) return { name: body, anschrift: '' };
  return { name: body.slice(0, comma).trim(), anschrift: body.slice(comma + 1).trim() };
}

export function isImpressumComplete(parts: ImpressumParts): boolean {
  return [parts.name, parts.anschrift].every((v) => {
    const value = v.trim();
    return value !== '' && !PLACEHOLDERS.has(value);
  });
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
