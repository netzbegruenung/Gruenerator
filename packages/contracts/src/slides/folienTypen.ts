/**
 * Folientypen der Chat-Präsentation: die KI beschreibt eine Folie als Typ mit
 * Slots (Textfelder oder eine Punkteliste); wie sie aussieht, entscheidet die
 * Vorlage (der Stil), nicht der Typ.
 *
 * Die Element-Ids sind F0 und gelten in allen Stilen gleich:
 * - Textslot: `elementId` ist die Id des Textelements.
 * - Listenslot (`punkte`): `elementIdPrefix` + laufende Nummer ab 1
 *   (`folie-punkt-1` … `folie-punkt-<maxItems>`). `slotElementIds` löst auf.
 */

import { z } from 'zod';

import { stripInlineMarks } from '../text/inlineMarks.js';

import { MAX_DECK_TITLE_CHARS, MAX_SLIDES, unescapeLineBreaks } from './slideDeckBasics.js';

export interface FolienTextSlot {
  kind: 'text';
  maxChars: number;
  required: boolean;
  elementId: string;
  hint: string;
  /** Leer bleibt das Element mit seinem Standardtext stehen, statt zu entfallen. */
  keepDefault?: boolean;
}

export interface FolienListSlot {
  kind: 'list';
  /** Zeichenbudget je Punkt. */
  maxChars: number;
  minItems: number;
  maxItems: number;
  /** Pflicht, wenn `minItems > 0`. */
  required: boolean;
  elementIdPrefix: string;
  hint: string;
}

export type FolienSlot = FolienTextSlot | FolienListSlot;

const text = (
  maxChars: number,
  elementId: string,
  hint: string,
  required = false,
  keepDefault = false
): FolienTextSlot => ({
  kind: 'text',
  maxChars,
  required,
  elementId,
  hint,
  ...(keepDefault ? { keepDefault } : {}),
});

const list = (
  maxChars: number,
  minItems: number,
  maxItems: number,
  hint: string
): FolienListSlot => ({
  kind: 'list',
  maxChars,
  minItems,
  maxItems,
  required: minItems > 0,
  elementIdPrefix: 'folie-punkt-',
  hint,
});

export const FOLIEN_TYPEN = {
  titel: {
    label: 'Titelfolie',
    use: 'Deckblatt: Schlagzeile plus kurzer Anlass',
    slots: {
      headline: text(34, 'folie-headline', 'Schlagzeile', true),
      unterzeile: text(110, 'folie-text', 'Anlass, Ort, Datum oder ein Einstiegssatz'),
      stoerer: text(24, 'folie-stoerer-text', 'kurzer Störer, z. B. „Neu“'),
    },
  },
  liste: {
    label: 'Liste',
    use: 'Überschrift mit drei bis sechs kurzen Punkten',
    slots: {
      headline: text(50, 'folie-headline', 'Überschrift der Folie', true),
      punkte: list(70, 3, 6, 'drei bis sechs Punkte, je eine Zeile'),
      stoerer: text(24, 'folie-stoerer-text', 'kurzer Störer'),
    },
  },
  text: {
    label: 'Text',
    use: 'Überschrift mit einem Fließtext',
    slots: {
      headline: text(50, 'folie-headline', 'Überschrift der Folie', true),
      text: text(450, 'folie-spalte-1', 'Fließtext', true),
    },
  },
  kernsatz: {
    label: 'Kernsatz',
    use: 'Eine Kernaussage groß, optional mit bis zu drei Stichpunkten',
    slots: {
      ueberschrift: text(50, 'folie-headline', 'kurze Überschrift über dem Satz'),
      satz: text(110, 'folie-kernsatz', 'der Kernsatz; ==Wort== hebt Wörter hervor', true),
      punkte: list(40, 0, 3, 'bis zu drei kurze Stichpunkte'),
    },
  },
  zahl: {
    label: 'Zahl',
    use: 'Eine Zahl groß mit Einordnung und Quelle',
    slots: {
      zahl: text(8, 'folie-zahl', 'die Zahl, z. B. „42 %“', true),
      text: text(120, 'folie-zahl-text', 'was die Zahl bedeutet', true),
      quelle: text(80, 'folie-quelle', 'Quelle der Zahl — nie erfinden', true),
    },
  },
  zitat: {
    label: 'Zitat',
    use: 'Zitat oder Kernbotschaft mit Urheber*in',
    slots: {
      intro: text(60, 'folie-intro', 'kurze Einleitung über dem Zitat'),
      zitat: text(180, 'folie-zitat', 'das Zitat; ==Wort== hebt Wörter hervor', true),
      name: text(50, 'folie-zitat-name', 'wer es sagt'),
    },
  },
  danke: {
    label: 'Vielen Dank',
    use: 'Schlussfolie mit Dank und optional Kontaktdaten',
    slots: {
      headline: text(
        24,
        'folie-headline',
        'große Schlusszeile; fehlt sie, steht dort „Vielen Dank“',
        false,
        true
      ),
      kontakt: text(
        200,
        'folie-kontakt',
        'Kontaktdaten, nur wenn der Auftrag sie nennt — nie erfinden'
      ),
    },
  },
} as const satisfies Record<
  string,
  { label: string; use: string; slots: Record<string, FolienSlot> }
>;

export type FolienTypId = keyof typeof FOLIEN_TYPEN;

export const FOLIEN_TYP_IDS = Object.keys(FOLIEN_TYPEN) as [FolienTypId, ...FolienTypId[]];

type SlotsOf<T extends FolienTypId> = (typeof FOLIEN_TYPEN)[T]['slots'];

/** Die Slots eines Typs als einheitlich getypte Tabelle (die Konstante ist je Typ enger typisiert). */
export function folienSlotsOf(typ: FolienTypId): Readonly<Record<string, FolienSlot>> {
  return FOLIEN_TYPEN[typ].slots;
}

/** Alle Element-Ids eines Slots: eine bei Textslots, `maxItems` bei Listen. */
export function slotElementIds(slot: FolienSlot): string[] {
  if (slot.kind === 'text') return [slot.elementId];
  return Array.from({ length: slot.maxItems }, (_, i) => `${slot.elementIdPrefix}${i + 1}`);
}

const visibleLength = (s: string) => stripInlineMarks(s).trim().length;

function textSchema(maxChars: number) {
  return z
    .string()
    .transform(unescapeLineBreaks)
    .refine((s) => visibleLength(s) > 0, 'darf nicht leer sein')
    .refine((s) => visibleLength(s) <= maxChars, `höchstens ${maxChars} Zeichen`);
}

function slotsSchema(typ: FolienTypId) {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, slot] of Object.entries(folienSlotsOf(typ))) {
    const value =
      slot.kind === 'text'
        ? textSchema(slot.maxChars)
        : z.array(textSchema(slot.maxChars)).min(slot.minItems).max(slot.maxItems);
    shape[name] = slot.required ? value : value.optional();
  }
  return z.strictObject(shape);
}

const folieSchemas = FOLIEN_TYP_IDS.map((typ) =>
  z.object({
    typ: z.literal(typ),
    slots: slotsSchema(typ),
    notes: z.string().max(2000).optional(),
  })
);

// Grenzfall: die Optionen entstehen aus der Tabelle; Zod verlangt ein Tupel.
export const folieSpecSchema = z.discriminatedUnion(
  'typ',
  folieSchemas as unknown as [(typeof folieSchemas)[number], ...(typeof folieSchemas)[number][]]
);

export const deckSpecSchema = z.object({
  title: z.string().trim().min(1).max(MAX_DECK_TITLE_CHARS),
  /** Id der Vorlage (Stil); fehlt sie, wählt der Composer den Standard. */
  vorlage: z.string().trim().min(1).max(40).optional(),
  slides: z.array(folieSpecSchema).min(1).max(MAX_SLIDES),
});

type SlotValue<S> = S extends { kind: 'list' } ? string[] : string;

export type FolieSpec = {
  [T in FolienTypId]: {
    typ: T;
    slots: { [K in keyof SlotsOf<T>]?: SlotValue<SlotsOf<T>[K]> };
    notes?: string | undefined;
  };
}[FolienTypId];

export type DeckSpec = { title: string; vorlage?: string | undefined; slides: FolieSpec[] };
