/**
 * Eine Spec = eine geschlossene Frage mit gelabeltem Korpus. Neue Frage:
 * Spec hier ergänzen, `pnpm eval:metis <name>`.
 *
 * `label` und beide Antworten sind derselbe Wertebereich (Schlüssel der
 * `criteria`), damit der Vergleich ohne Übersetzung auskommt.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveGenerationScope } from '../../agents/langgraph/ChatGraph/nodes/generationResolver.js';

import type { MetisQuestion } from './metisClient.js';

export interface ResolverCase {
  id: string;
  text: string;
  label: string;
  /** Schlüssel in `SOURCES` — der Text, gegen den `text` geprüft wird. */
  quelle?: string;
  note?: string;
}

interface Variant {
  question: MetisQuestion & { type: 'choice' };
  state: (c: ResolverCase) => unknown;
}

export interface ResolverSpec {
  name: string;
  /** Fassungen derselben Frage; `EVAL_VARIANT` wählt, Standard: die erste. */
  variants: Record<string, Variant>;
  cases: ResolverCase[];
  /** Das heutige Verfahren (LLM oder Regel); `null` = nichts entschieden (fällt durch). */
  baseline?: (c: ResolverCase) => Promise<string | null>;
}

const here = dirname(fileURLToPath(import.meta.url));

function loadCases(file: string): ResolverCase[] {
  return readFileSync(join(here, file), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      const c = JSON.parse(l) as Partial<ResolverCase>;
      if (!c.id || !c.text || !c.label) throw new Error(`${file}:${i + 1}: id/text/label fehlt`);
      return c as ResolverCase;
    });
}

const generation: ResolverSpec = {
  name: 'generation',
  variants: {
    default: {
      state: (c) => c.text,
      question: {
        type: 'choice',
        instructions:
          'Soll diese Nachricht ein ARTEFAKT erzeugen (eine Datei, ein Bild oder einen Beitrag, der neben der Antwort entsteht)? Ein Text IN der Antwort ist kein Artefakt. Ein Verbot des Erzeugens ist keine Bestellung. Im Zweifel: keine.',
        criteria: {
          save_as_doc: 'ein Text soll als Dokument gespeichert/angelegt werden',
          sharepic: 'ein Bild mit Text darauf, für Social Media',
          image: 'ein reines Bild ohne Textebene, gemalt oder fotorealistisch',
          create_sheet: 'eine Tabelle/Kalkulation als Datei',
          create_presentation: 'Folien',
          create_pdf: 'ein PDF',
          chart: 'ein Diagramm/Chart aus Zahlen',
          keine:
            'alles andere: Social-Post oder Pressemitteilung schreiben, zusammenfassen, kürzen, prüfen, erklären, umformulieren, übersetzen, beraten, Verbote',
        },
      },
    },
  },
  cases: loadCases('generation.jsonl'),
  baseline: async (c) => {
    const v = await resolveGenerationScope({ userContent: c.text, conversationContext: null });
    return v === null ? null : v === 'keine' ? 'keine' : v.intent;
  },
};

/**
 * #5480: Deckt der Quelltext, was eine Sharepic-Kachel über ihn behauptet?
 * Die Zahlenprüfung in `draftValidation.ts` sieht nur, ob die Ziffer vorkommt.
 */
const SOURCES: Record<string, string> = {
  radweg:
    'Der Kreistag hat am Dienstag den Bau des Radwegs zwischen Altdorf und Neustadt beschlossen. Die 2,4 km lange Strecke an der B 12 gilt seit Jahren als Unfallschwerpunkt: Allein 2025 registrierte die Polizei dort 17 Unfälle mit Radfahrenden. Das Land fördert den Bau mit 1,26 Mio. €. Baustart ist im April 2027.',
  bus: 'Seit dem Fahrplanwechsel fährt die Linie 42 nur noch alle 60 statt alle 30 Minuten. Am Wochenende fällt sie ganz aus. Betroffen sind rund 3.300 Fahrgäste täglich. Der Kreis spart damit 420.000 € im Jahr.',
  hitze:
    'Die Zahl der Hitzetage in der Stadt ist von 8 im Jahr 2000 auf 23 im Jahr 2025 gestiegen. 9 von 10 Kitas haben keinen Hitzeschutz. Die Grünen fordern 50 neue Stadtbäume pro Jahr.',
  tempo30:
    'Seit Einführung von Tempo 30 vor der Grundschule gab es dort 12 Unfälle weniger als in den drei Jahren davor. Der Lärm sank um 3 Dezibel.',
  wien: 'Die Mieten in Wien sind seit 2020 um 18 % gestiegen. Schon jede dritte Familie gibt mehr als 40 % ihres Einkommens für das Wohnen aus. Wir fordern 1.200 neue Gemeindewohnungen bis 2028 – doch die ÖVP blockiert im Gemeinderat.',
  solar:
    'Auf 640 Dächern in der Gemeinde liefern inzwischen Solaranlagen Strom, genug für rund 900 Haushalte. Seit 2023 hat sich die Zahl verdoppelt. Ziel sind 2.000 Dächer bis 2030.',
};
function sourceOf(c: ResolverCase): string {
  const s = c.quelle ? SOURCES[c.quelle] : null;
  if (!s) throw new Error(`${c.id}: quelle "${c.quelle}" unbekannt`);
  return s;
}

const CLAIM_CRITERIA = {
  gedeckt: 'die Quelle sagt das so oder gleichbedeutend',
  verfaelscht:
    'die Quelle sagt das nicht: Richtung umgedreht (mehr/weniger, gestiegen/gesunken), Forderung als Tatsache, Geplantes als erledigt, anderer Zahler oder erfunden',
};

/**
 * Regel-Gegenstück aus dem Vorschlag zu #5480: jede Zahl muss in der Quelle
 * stehen (wie heute), und ein Richtungswort neben einer Zahl braucht ein Wort
 * derselben Richtung nahe derselben Zahl in der Quelle.
 */
const DIRECTION: Record<string, string[]> = {
  ab: [
    'wenig',
    'sank',
    'sink',
    'gesunk',
    'senk',
    'gesenk',
    'rückg',
    'reduz',
    'minus',
    'halbi',
    'leiser',
    'spar',
    'gespar',
    'eingespar',
  ],
  auf: ['mehr', 'stieg', 'steig', 'gestieg', 'anstie', 'zuwach', 'plus', 'verdopp', 'lauter'],
  verhindert: ['verhind'],
};
const NUM = /(?<!\p{L})\d+(?:[.,]\d+)*/gu;
const digitsOf = (v: string) => v.replace(/[.,]/g, '');
const wordList = (v: string) =>
  v
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
const directionsIn = (v: string) =>
  new Set(
    wordList(v).flatMap((w) =>
      Object.entries(DIRECTION)
        .filter(([, stems]) => stems.some((s) => w.startsWith(s)))
        .map(([dir]) => dir)
    )
  );
const WINDOW = 100;
function regexClaimCheck(c: ResolverCase): string {
  const source = sourceOf(c);
  const sourceNums = [...source.matchAll(NUM)];
  const claimNums = [...c.text.matchAll(NUM)].map((m) => digitsOf(m[0]));
  if (claimNums.some((n) => !sourceNums.some((m) => digitsOf(m[0]) === n))) return 'verfaelscht';
  const dirs = directionsIn(c.text);
  if (!claimNums.length || !dirs.size) return 'gedeckt';
  for (const n of claimNums) {
    const near = sourceNums
      .filter((m) => digitsOf(m[0]) === n)
      .map((m) => source.slice(Math.max(0, m.index - WINDOW), m.index + m[0].length + WINDOW));
    if (![...dirs].every((d) => near.some((w) => directionsIn(w).has(d)))) return 'verfaelscht';
  }
  return 'gedeckt';
}

const sharepicFigureClaim: ResolverSpec = {
  name: 'sharepicFigureClaim',
  variants: {
    /** Quelle und Behauptung als Objekt, Frage knapp. */
    object: {
      state: (c) => ({ quelle: sourceOf(c), behauptung: c.text }),
      question: {
        type: 'choice',
        instructions: 'Stimmt die behauptung mit der quelle überein?',
        criteria: CLAIM_CRITERIA,
      },
    },
    /** Dasselbe als ein Fließtext-State. */
    text: {
      state: (c) => `QUELLE:\n${sourceOf(c)}\n\nBEHAUPTUNG AUF DEM SHAREPIC:\n${c.text}`,
      question: {
        type: 'choice',
        instructions: 'Stimmt die BEHAUPTUNG mit der QUELLE überein?',
        criteria: CLAIM_CRITERIA,
      },
    },
    /** Ausführliche Anweisung: woran man eine Verfälschung erkennt. */
    strict: {
      state: (c) => ({ quelle: sourceOf(c), behauptung: c.text }),
      question: {
        type: 'choice',
        instructions:
          'Du prüfst eine Kachel eines Sharepics gegen ihre Quelle. Die behauptung ist gedeckt, wenn die quelle genau das aussagt – Umformulieren und Kürzen ist erlaubt. Sie ist verfälscht, sobald sie eine Richtung umdreht (weniger statt mehr, gesunken statt gestiegen), aus einer Forderung oder Planung eine erledigte Tatsache macht, Zahlen einer anderen Sache zuordnet oder etwas behauptet, das in der quelle nicht steht. Zahlen allein reichen nicht: entscheidend ist, was über die Zahl gesagt wird.',
        criteria: CLAIM_CRITERIA,
      },
    },
  },
  cases: loadCases('sharepicFigureClaim.jsonl'),
  baseline: (c) => Promise.resolve(regexClaimCheck(c)),
};

export const SPECS: Record<string, ResolverSpec> = { generation, sharepicFigureClaim };
