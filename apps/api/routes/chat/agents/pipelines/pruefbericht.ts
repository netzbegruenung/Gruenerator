/**
 * Der Prüfbericht als Daten — und alles, was der Code daraus ableitet.
 *
 * Bis 19.10.2026 war der Bericht Markdown. Das Urteil stand am Ende als Wort im
 * Text, und ob es zu den Tabellen darüber passte, entschied das Modell selbst:
 * dieselbe Instanz, die gerade 40 Zeilen gezählt hatte, sollte am Schluss die
 * eigenen Regeln („mehr als ein Viertel fehlt → ABLEHNUNG") anwenden. Jetzt
 * liefert das Modell nur die Befunde; das Urteil rechnet `urteilAus`, und die
 * Liste, die eine Überarbeitung abarbeiten muss, baut `offenePunkte`.
 *
 * Die Schemata für das Modell sind bewusst locker (siehe `AiObjectCall.schema`);
 * die Strenge sitzt in den Zod-Prüfungen darunter.
 */

import { z } from 'zod';

import { type StructuredValidation } from '../../../../services/ai/structuredParsing.js';

export const URTEILE = ['FREIGABE', 'ÜBERARBEITUNG', 'ABLEHNUNG'] as const;
export type Urteil = (typeof URTEILE)[number];

const SCHWEREGRADE = ['KRITISCH', 'HOCH', 'MITTEL', 'NIEDRIG'] as const;
type Schweregrad = (typeof SCHWEREGRADE)[number];

const FEHLERARTEN = {
  a: 'Auslassung',
  b: 'Hinzufügung',
  c: 'Modalität',
  d: 'Zuschreibung',
  e: 'Zahl',
  f: 'Eigenname',
  g: 'Verschmelzung',
  h: 'Bedeutungsverschiebung',
  i: 'Urheberschaft',
  r: 'Regelverstoß',
} as const;
type Fehlerart = keyof typeof FEHLERARTEN;

const befundSchema = z.object({
  stelle: z.string(),
  // Das Modell schreibt gern „c) MODALITÄTS-FEHLER" statt „c": der Buchstabe
  // vorne zählt, der Rest ist Beschriftung.
  fehlerart: z
    .string()
    .transform((s) => s.trim().charAt(0).toLowerCase())
    .pipe(z.enum(Object.keys(FEHLERARTEN) as [Fehlerart, ...Fehlerart[]]).catch('r')),
  schweregrad: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.enum(SCHWEREGRADE).catch('MITTEL')),
  beschreibung: z.string(),
  beleg: z.string().nullish(),
  korrektur: z.string().nullish(),
});
export type Befund = z.infer<typeof befundSchema>;

const pruefberichtSchema = z.object({
  abdeckung: z
    .array(
      z.object({
        punkt: z.string(),
        status: z
          .string()
          .transform((s) => s.trim().toLowerCase())
          .pipe(z.enum(['vollständig', 'verkürzt', 'fehlt']).catch('verkürzt')),
        fehlt: z.string().nullish(),
      })
    )
    .min(1),
  beiwerk: z.string().nullish(),
  modalitaet: z.array(
    z.object({
      original: z.string(),
      fassung: z.string().nullish(),
      erhalten: z.boolean(),
    })
  ),
  befunde: z.array(befundSchema),
  begruendung: z.string().nullish(),
  risiko: z.string().nullish(),
});
export type Pruefbericht = z.infer<typeof pruefberichtSchema>;

const nachpruefungSchema = z.object({
  punkte: z.array(
    z.object({
      nr: z.coerce.number().int(),
      behoben: z.boolean(),
      beleg: z.string().nullish(),
    })
  ),
  neue_befunde: z.array(befundSchema).default([]),
});
export type Nachpruefung = z.infer<typeof nachpruefungSchema>;

const BEFUND_JSON = {
  type: 'object',
  properties: {
    stelle: { type: 'string', description: 'Wo in der Fassung (kurzes Zitat oder Abschnitt)' },
    fehlerart: { type: 'string', description: 'Buchstabe a bis i, oder r für Regelverstoß' },
    schweregrad: { type: 'string', enum: [...SCHWEREGRADE] },
    beschreibung: { type: 'string' },
    beleg: { type: 'string', description: 'Wörtliches Zitat aus dem Original' },
    korrektur: { type: 'string', description: 'Korrigierter Abschnitt im Register der Fassung' },
  },
  required: ['stelle', 'fehlerart', 'schweregrad', 'beschreibung'],
} as const;

export const PRUEFBERICHT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    abdeckung: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          punkt: { type: 'string', description: 'Kerninhalt des Original-Punkts in einer Zeile' },
          status: { type: 'string', enum: ['vollständig', 'verkürzt', 'fehlt'] },
          fehlt: { type: 'string', description: 'Was fehlt (nur bei verkürzt/fehlt)' },
        },
        required: ['punkt', 'status'],
      },
    },
    beiwerk: { type: 'string', description: 'Nicht gezählte Zeilen, in einer Zeile gesammelt' },
    modalitaet: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          original: { type: 'string', description: 'Zitat aus dem Original' },
          fassung: { type: 'string', description: 'Entsprechende Stelle der Fassung, wörtlich' },
          erhalten: { type: 'boolean' },
        },
        required: ['original', 'erhalten'],
      },
    },
    befunde: { type: 'array', items: BEFUND_JSON },
    begruendung: { type: 'string', description: 'Gesamteinschätzung in höchstens 5 Sätzen' },
    risiko: { type: 'string', description: 'Was eine menschliche Entscheidung braucht' },
  },
  required: ['abdeckung', 'modalitaet', 'befunde'],
};

export const NACHPRUEFUNG_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    punkte: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nr: { type: 'integer' },
          behoben: { type: 'boolean' },
          beleg: { type: 'string', description: 'Der Satz der neuen Fassung, der es belegt' },
        },
        required: ['nr', 'behoben'],
      },
    },
    neue_befunde: { type: 'array', items: BEFUND_JSON },
  },
  required: ['punkte', 'neue_befunde'],
};

function viaZod<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return (input: unknown): StructuredValidation<T> => {
    const parsed = schema.safeParse(input);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : {
          ok: false,
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        };
  };
}

export const validatePruefbericht = viaZod(pruefberichtSchema);
export const validateNachpruefung = viaZod(nachpruefungSchema);

const BEHEBEN: ReadonlySet<Schweregrad> = new Set(['KRITISCH', 'HOCH', 'MITTEL']);

/**
 * Das Urteil, gerechnet statt erfragt. Dieselben Schwellen, die bis 19.10.2026
 * als Bitte im Prüfprompt standen.
 */
export function urteilAus(bericht: Pruefbericht): Urteil {
  if (bericht.befunde.some((b) => b.schweregrad === 'KRITISCH')) return 'ABLEHNUNG';
  const unvollstaendig = bericht.abdeckung.filter((p) => p.status !== 'vollständig').length;
  if (unvollstaendig / bericht.abdeckung.length > 0.25) return 'ABLEHNUNG';
  if (
    unvollstaendig > 0 ||
    bericht.modalitaet.some((m) => !m.erhalten) ||
    bericht.befunde.some((b) => b.schweregrad === 'HOCH')
  ) {
    return 'ÜBERARBEITUNG';
  }
  return 'FREIGABE';
}

/** Ein Punkt, den die nächste Überarbeitung beheben muss. */
export interface OffenerPunkt {
  text: string;
  schweregrad: Schweregrad;
  korrektur: string | null;
}

function befundAlsPunkt(b: Befund): OffenerPunkt {
  const beleg = b.beleg ? ` Original: „${b.beleg}"` : '';
  return {
    text: `${FEHLERARTEN[b.fehlerart]} bei ${b.stelle}: ${b.beschreibung}${beleg}`,
    schweregrad: b.schweregrad,
    korrektur: b.korrektur ?? null,
  };
}

/**
 * Was die Überarbeitung abarbeiten muss: die Befunde ab MITTEL und — auch wenn
 * das Modell sie in B vergessen hat — jede unvollständige Abdeckungszeile und
 * jede nicht erhaltene Modalität. Die zwei Tabellen sind das Zählwerk; eine
 * Lücke dort ohne Befund wäre sonst gesehen und nicht behoben.
 */
export function offenePunkte(bericht: Pruefbericht): OffenerPunkt[] {
  return [
    ...bericht.befunde.filter((b) => BEHEBEN.has(b.schweregrad)).map(befundAlsPunkt),
    ...bericht.abdeckung
      .filter((p) => p.status !== 'vollständig')
      .map((p) => ({
        text: `Abdeckung (${p.status}): ${p.punkt}${p.fehlt ? ` — es fehlt: ${p.fehlt}` : ''}`,
        schweregrad: 'HOCH' as const,
        korrektur: null,
      })),
    ...bericht.modalitaet
      .filter((m) => !m.erhalten)
      .map((m) => ({
        text: `Modalität nicht erhalten: Original „${m.original}"${
          m.fassung ? `, Fassung „${m.fassung}"` : ', in der Fassung nicht gefunden'
        }`,
        schweregrad: 'HOCH' as const,
        korrektur: null,
      })),
  ];
}

/**
 * Was nach einer Nachprüfung offen bleibt. Ein Punkt, den die Nachprüfung
 * nicht erwähnt, gilt als NICHT behoben — Schweigen ist hier kein Befund.
 */
export function nochOffen(vorher: readonly OffenerPunkt[], np: Nachpruefung): OffenerPunkt[] {
  const behoben = new Set(np.punkte.filter((p) => p.behoben).map((p) => p.nr));
  return [
    ...vorher.filter((_, i) => !behoben.has(i + 1)),
    ...np.neue_befunde.filter((b) => BEHEBEN.has(b.schweregrad)).map(befundAlsPunkt),
  ];
}

/** Das Urteil über eine Liste offener Punkte — dieselbe Skala wie `urteilAus`. */
export function urteilUeber(offen: readonly OffenerPunkt[]): Urteil {
  if (offen.some((p) => p.schweregrad === 'KRITISCH')) return 'ABLEHNUNG';
  if (offen.some((p) => p.schweregrad === 'HOCH')) return 'ÜBERARBEITUNG';
  return 'FREIGABE';
}

export function nummeriert(punkte: readonly OffenerPunkt[]): string {
  return punkte
    .map(
      (p, i) =>
        `${i + 1}. [${p.schweregrad}] ${p.text}${p.korrektur ? `\n   Vorschlag: ${p.korrektur}` : ''}`
    )
    .join('\n');
}

const zelle = (s: string | null | undefined): string =>
  (s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim() || '–';

export function renderPruefbericht(bericht: Pruefbericht, urteil: Urteil): string {
  const voll = bericht.abdeckung.filter((p) => p.status === 'vollständig').length;
  const verkuerzt = bericht.abdeckung.filter((p) => p.status === 'verkürzt').length;
  const fehlt = bericht.abdeckung.length - voll - verkuerzt;
  const modNein = bericht.modalitaet.filter((m) => !m.erhalten).length;

  const teile = [
    `**Urteil: ${urteil}**${bericht.begruendung ? ` — ${bericht.begruendung.trim()}` : ''}`,
    `Abdeckung: ${voll} von ${bericht.abdeckung.length} Punkten vollständig, ${verkuerzt} verkürzt, ${fehlt} fehlend. ` +
      `Modalität: ${bericht.modalitaet.length} Stellen geprüft, ${modNein} nicht erhalten.`,
    '### Abdeckung',
    '| Nr | Punkt im Original | Status | Was fehlt |\n| --- | --- | --- | --- |\n' +
      bericht.abdeckung
        .map((p, i) => `| ${i + 1} | ${zelle(p.punkt)} | ${p.status} | ${zelle(p.fehlt)} |`)
        .join('\n'),
    ...(bericht.beiwerk ? [`Nicht gezählt: ${bericht.beiwerk.trim()}`] : []),
    '### Modalität',
    bericht.modalitaet.length === 0
      ? 'Keine Stelle mit Modalwort, Konjunktiv, Bedingung oder Einschränkung im Original.'
      : '| Nr | Original | Fassung | erhalten |\n| --- | --- | --- | --- |\n' +
        bericht.modalitaet
          .map(
            (m, i) =>
              `| ${i + 1} | ${zelle(m.original)} | ${zelle(m.fassung)} | ${m.erhalten ? 'ja' : 'nein'} |`
          )
          .join('\n'),
    '### Befunde',
    bericht.befunde.length === 0
      ? 'Keine Befunde.'
      : '| Nr | Stelle | Art | Schwere | Beschreibung | Beleg im Original | Korrektur |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
        bericht.befunde
          .map(
            (b, i) =>
              `| ${i + 1} | ${zelle(b.stelle)} | ${FEHLERARTEN[b.fehlerart]} | ${b.schweregrad} | ${zelle(b.beschreibung)} | ${zelle(b.beleg)} | ${zelle(b.korrektur)} |`
          )
          .join('\n'),
    ...(bericht.risiko ? [`**Verbleibendes Risiko:** ${bericht.risiko.trim()}`] : []),
  ];
  return teile.join('\n\n');
}

export function renderNachpruefung(
  vorher: readonly OffenerPunkt[],
  np: Nachpruefung,
  offen: readonly OffenerPunkt[]
): string {
  const zeilen = vorher.map((p, i) => {
    const eintrag = np.punkte.find((x) => x.nr === i + 1);
    const status = eintrag?.behoben ? 'behoben' : eintrag ? 'offen' : 'nicht geprüft → offen';
    return `| ${i + 1} | ${zelle(p.text)} | ${status} | ${zelle(eintrag?.beleg)} |`;
  });
  const neu = np.neue_befunde.map(
    (b) => `- [${b.schweregrad}] ${FEHLERARTEN[b.fehlerart]} bei ${b.stelle}: ${b.beschreibung}`
  );
  return [
    `**Urteil: ${urteilUeber(offen)}** — ${offen.length} Punkt(e) offen.`,
    '| Nr | Punkt | Status | Beleg in der neuen Fassung |\n| --- | --- | --- | --- |\n' +
      zeilen.join('\n'),
    neu.length > 0 ? `Neu durch die Überarbeitung:\n${neu.join('\n')}` : 'Keine neuen Befunde.',
  ].join('\n\n');
}
