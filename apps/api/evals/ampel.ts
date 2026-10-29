/**
 * Ampel je Fall: grün / gelb / rot — und die EINE Tabelle, die entscheidet,
 * welche Prüfung hart und welche weich ist.
 *
 *  - rot  = mindestens eine HARTE, deterministische Prüfung verletzt (falsches
 *           oder verbotenes Werkzeug, erfundene Ref, Pflicht-Absage fehlt,
 *           Stream-Fehler …). Rot entsteht NUR hieraus, nie aus dem Richter.
 *  - gelb = alle harten bestehen, aber eine WEICHE nicht, oder die Richternote
 *           ist 3 oder schlechter.
 *  - grün = alles erfüllt und (falls ein Richter lief) Note ≥ 4.
 *
 * Reine Funktionen, kein Dateizugriff: derselbe Code läuft im Eval-Lauf (ohne
 * Note) und nach dem Richterlauf bzw. in der Prüfseite (mit Note).
 */
import type { AssertionResult, CaseResult } from './types.js';

export type Stufe = 'hart' | 'weich';
export type Ampel = 'gruen' | 'gelb' | 'rot';

/**
 * Stufe je Prüfungsart. Schlüssel ist der Assertion-Name VOR dem ersten `:` —
 * `tool:web_search` und `tool:parlament_lesen` sind beide die Art `tool`.
 *
 * Maßstab: hart = eine deterministische Aussage über das Verhalten, die ohne
 * Auslegung falsch sein kann (Werkzeugweg, Erfindung, Absage, Pflichtpassage).
 * Weich = ein Maß für Güte oder Aufwand, dessen Verletzung eine schlechtere,
 * aber nicht falsche Antwort sein kann (Latenz, Aufwand, Länge, Zitierform,
 * Themenabdeckung per Stichwort, Regex-Heuristiken auf der Wortwahl).
 */
export const PRUEFUNG_STUFE = {
  // Strom und Gesprächsfaden
  streamCompleted: 'hart',
  scenarioComplete: 'hart',
  sameThread: 'hart',
  editsPreviousArtifact: 'hart',
  narrationMatchesAction: 'hart',
  // Weg durch das System
  routing: 'hart',
  routingNot: 'hart',
  demoted: 'hart',
  tool: 'hart',
  toolAnyOf: 'hart',
  toolNameMatches: 'hart',
  noTool: 'hart',
  toolArgsMatch: 'hart',
  minToolCalls: 'hart',
  maxToolCalls: 'weich',
  // Erlaubte und verbotene Wirkungen
  offersPersistentAction: 'hart',
  generatesSharepic: 'hart',
  asksClarification: 'hart',
  internalOnly: 'hart',
  noInventedUrls: 'hart',
  keineErfundeneRef: 'hart',
  productGrounded: 'hart',
  warning: 'hart',
  grounded: 'hart',
  retainsPriorSources: 'hart',
  // Absage
  noCapabilityRefusal: 'hart',
  refuses: 'hart',
  refusalLanguage: 'hart',
  abstains: 'hart',
  // Inhalt der Antwort
  answerMustNotContain: 'hart',
  answerMustContain: 'hart',
  answerShouldContain: 'weich',
  // Regex auf „nein/nicht/falsch …": zu grob, um allein Rot zu tragen.
  correctsFalsePremise: 'weich',
  // Regex auf ein Datumsmuster — die Untergrenze, nicht der Befund (siehe dort).
  statesAsOf: 'weich',
  topic: 'weich',
  cited: 'weich',
  minAnswerChars: 'weich',
  // Latenz zweistufig: über dem Soll gelb, über der doppelten Grenze rot.
  latency: 'weich',
  latencyHard: 'hart',
} as const satisfies Record<string, Stufe>;

export type PruefungsArt = keyof typeof PRUEFUNG_STUFE;

/** Die harte Latenzgrenze ist ein Vielfaches des Soll-Werts `maxLatencyMs`. */
export const LATENZ_HARTE_GRENZE_FAKTOR = 2;

/** Art einer Prüfung aus ihrem Namen (`tool:web_search` → `tool`). */
export function pruefungsArt(name: string): string {
  const i = name.indexOf(':');
  return i === -1 ? name : name.slice(0, i);
}

/** Stufe einer Prüfung; wirft bei unbekanntem Namen, damit keine Prüfung ungestuft durchrutscht. */
export function stufeOf(name: string): Stufe {
  const art = pruefungsArt(name);
  if (!Object.hasOwn(PRUEFUNG_STUFE, art)) {
    throw new Error(`Prüfung "${name}" steht nicht in PRUEFUNG_STUFE (ampel.ts)`);
  }
  return PRUEFUNG_STUFE[art as PruefungsArt];
}

export interface Verletzung {
  name: string;
  stufe: Stufe;
  detail: string;
}

/** Notengrenze: Note ≤ diesem Wert macht gelb. */
export const NOTE_GELB_BIS = 3;

/** Alle verletzten Prüfungen; ältere Läufe ohne `stufe` bekommen sie aus der Tabelle. */
export function verletzungen(assertions: readonly AssertionResult[]): Verletzung[] {
  return assertions
    .filter((a) => !a.pass)
    .map((a) => ({ name: a.name, stufe: a.stufe ?? stufeOf(a.name), detail: a.detail }));
}

/** Ampel aus Verletzungen und optionaler Richternote (1–5). */
export function ampelOf(viol: readonly Verletzung[], note: number | null): Ampel {
  if (viol.some((v) => v.stufe === 'hart')) return 'rot';
  if (viol.length > 0) return 'gelb';
  if (note !== null && note <= NOTE_GELB_BIS) return 'gelb';
  return 'gruen';
}

export interface FallBewertung {
  ampel: Ampel;
  verletzungen: Verletzung[];
  note: number | null;
}

/**
 * Bewertung eines Falls. Ein Strom-Fehler auf Fallebene (`error`) ist hart,
 * auch wenn keine Assertion dazu vorliegt (z. B. `failedResult`).
 */
export function bewerteFall(
  c: Pick<CaseResult, 'assertions' | 'error'>,
  note: number | null = null
): FallBewertung {
  const viol = verletzungen(c.assertions);
  if (c.error && !viol.some((v) => v.stufe === 'hart')) {
    viol.push({ name: 'streamCompleted', stufe: 'hart', detail: c.error });
  }
  return { ampel: ampelOf(viol, note), verletzungen: viol, note };
}

export interface Zusammenfassung {
  gruen: number;
  gelb: number;
  rot: number;
  /** Durchschnitt über die Fälle MIT Note; null, wenn kein Richter lief. */
  durchschnittsnote: number | null;
  benotet: number;
  /** Je gelbem/rotem Fall die verletzten Prüfungen (und eine niedrige Note). */
  auffaellig: { id: string; ampel: Ampel; punkte: string[] }[];
}

export function zusammenfassen(
  faelle: readonly { id: string; bewertung: FallBewertung }[]
): Zusammenfassung {
  const z: Zusammenfassung = {
    gruen: 0,
    gelb: 0,
    rot: 0,
    durchschnittsnote: null,
    benotet: 0,
    auffaellig: [],
  };
  let summe = 0;
  for (const { id, bewertung: b } of faelle) {
    z[b.ampel]++;
    if (b.note !== null) {
      summe += b.note;
      z.benotet++;
    }
    if (b.ampel !== 'gruen') {
      const punkte = b.verletzungen.map((v) => `${v.name} (${v.stufe})`);
      if (b.note !== null && b.note <= NOTE_GELB_BIS) punkte.push(`Note ${b.note}`);
      z.auffaellig.push({ id, ampel: b.ampel, punkte });
    }
  }
  if (z.benotet > 0) z.durchschnittsnote = Math.round((summe / z.benotet) * 100) / 100;
  return z;
}

const MARKE: Record<Ampel, string> = { gruen: '🟢', gelb: '🟡', rot: '🔴' };
export const ampelMarke = (a: Ampel): string => MARKE[a];

/** Zeilen für die Konsole am Ende eines Laufs. */
export function zusammenfassungZeilen(z: Zusammenfassung): string[] {
  const zeilen = [
    `Ampel:      🟢 ${z.gruen} · 🟡 ${z.gelb} · 🔴 ${z.rot}` +
      (z.durchschnittsnote === null
        ? ' · Note: — (kein Richter gelaufen)'
        : ` · Ø Note ${z.durchschnittsnote} (${z.benotet} benotet)`),
  ];
  for (const a of z.auffaellig) {
    zeilen.push(`  ${MARKE[a.ampel]} ${a.id}: ${a.punkte.join(', ') || '—'}`);
  }
  return zeilen;
}

/** Ein Fall gilt im Baseline-Vergleich als bestanden, wenn er nicht rot ist. */
export const gilltAlsBestanden = (a: Ampel): boolean => a !== 'rot';
