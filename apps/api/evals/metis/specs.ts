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

import { renderArtifactChoices } from '../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';
import { classifyDocsIntentTiebreak } from '../../agents/langgraph/ChatGraph/nodes/docsIntentTiebreak.js';
import { resolveEditTarget } from '../../agents/langgraph/ChatGraph/nodes/editTargetResolver.js';
import { resolveGenerationScope } from '../../agents/langgraph/ChatGraph/nodes/generationResolver.js';
import { verifyComputeResult } from '../../routes/chat/services/computeResultVerifier.js';
import {
  classifyNotebookAnswerMode,
  formatGuardPrompt,
  type NotebookGuardTurn,
} from '../../routes/chat/services/notebookAnswerModeResolver.js';

import type { ThreadToolContext } from '../../agents/langgraph/ChatGraph/types.js';

import type { MetisQuestion } from './metisClient.js';

export interface ResolverCase {
  id: string;
  text: string;
  label: string;
  /** Schlüssel in `SOURCES` — der Text, gegen den `text` geprüft wird. */
  quelle?: string;
  note?: string;
  /** docsTiebreak: Verlauf vor der Nachricht, wie ihn der Klassifikator mitgibt. */
  context?: string;
  /** notebookMode: Verlauf vor der Frage, älteste zuerst. */
  history?: NotebookGuardTurn[];
  /** editTarget: Artefakte des Threads, neueste zuerst. */
  artifacts?: ThreadToolContext[];
  /** computeVerify: `text` ist die Frage; dazu Code und Ergebnis. */
  code?: string;
  entries?: Array<{ label: string; value: string }>;
}

type ChoiceQuestion = MetisQuestion & { type: 'choice' };

interface Variant {
  /** Fest, oder je Fall gebaut (z. B. die Artefaktliste als Optionen). */
  question: ChoiceQuestion | ((c: ResolverCase) => ChoiceQuestion);
  state: (c: ResolverCase) => unknown;
  /** Bildet eine feinere Option auf das Label ab (mehrere Fehlerarten → `unplausibel`). */
  answerOf?: (choice: string) => string;
}

export function questionFor(v: Variant, c: ResolverCase): ChoiceQuestion {
  return typeof v.question === 'function' ? v.question(c) : v.question;
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

/**
 * `docsIntentTiebreak`: verlangt eine Nachricht im Dokument-Editor eine
 * Bearbeitung oder ist sie eine Frage? Heute ein Wort von Mistral Small.
 */
const docsTiebreak: ResolverSpec = {
  name: 'docsTiebreak',
  variants: {
    text: {
      state: (c) =>
        `${c.context ? `BISHERIGER VERLAUF:\n${c.context}\n\n` : ''}NACHRICHT IM DOKUMENT-EDITOR:\n${c.text}`,
      question: {
        type: 'choice',
        instructions:
          'Verlangt die NACHRICHT, dass der Text des offenen Dokuments geändert wird? Im Zweifel: edit.',
        criteria: {
          edit: 'den Dokumenttext ändern: umformulieren, kürzen, ergänzen, löschen, übersetzen, korrigieren – auch indirekt oder als Kritik am Text',
          question:
            'eine Frage zum Dokument oder Thema: erklären, zusammenfassen, bewerten, recherchieren – der Text bleibt, wie er ist',
        },
      },
    },
  },
  cases: loadCases('docsTiebreak.jsonl'),
  baseline: (c) =>
    classifyDocsIntentTiebreak({ userContent: c.text, conversationContext: c.context ?? null }),
};

/**
 * `notebookAnswerModeResolver`: Inhaltsfrage an die Quellen (`chat`) oder
 * Arbeit mit den Quellen als Dokumenten (`praezision`, der teure Loop).
 * Baseline ist nur der LLM-Wächter — die Regel davor (`looksLikeNotebookToolAsk`)
 * bliebe in beiden Fällen stehen.
 */
const notebookMode: ResolverSpec = {
  name: 'notebookMode',
  variants: {
    text: {
      state: (c) => formatGuardPrompt(c.text, c.history ?? []),
      question: {
        type: 'choice',
        instructions:
          'Wie wird die letzte Nachricht an die Notebook-Quellen beantwortet? Eine Folgefrage („weiter", „genauer", „und die zweite?") übernimmt den Modus, der im Verlauf bei der vorigen Antwort steht. Im Zweifel: chat.',
        criteria: {
          chat: 'eine Inhaltsfrage: was steht drin, zusammenfassen, erklären, vergleichen, Positionen, welche Dokumente sich zu einem THEMA äußern – auch eine Zahl oder ein Datum, das in einer Quelle steht',
          praezision:
            'Arbeit mit den Quellen als Dokumenten: sie auflisten, zählen oder sortieren, eine bestimmte Seite oder einen Abschnitt lesen, ein WÖRTLICHES Wort oder eine wörtliche Formulierung zählen oder finden, ein Zitat wörtlich prüfen',
        },
      },
    },
  },
  cases: loadCases('notebookMode.jsonl'),
  baseline: (c) => classifyNotebookAnswerMode(c.text, c.history ?? []),
};

/**
 * Woraus eine Artefaktart besteht — ohne das verbindet das Modell „die Kachel"
 * oder „das Hintergrundbild" nicht mit dem Sharepic (Runde 1: 4 Fehler, alle
 * Sharepic). Beschreibt die Option, entscheidet nichts.
 */
const ARTIFACT_PARTS: Record<ThreadToolContext['kind'], string> = {
  image: 'ein Bild oder Foto ohne Text',
  sharepic:
    'eine Social-Media-Grafik: Text, Zitat oder Zahl auf Kacheln über einem Hintergrundbild',
  document: 'ein Fließtext mit Überschrift, Einleitung, Absätzen und Begründung',
  presentation: 'Folien',
  sheet: 'eine Tabelle mit Zeilen, Spalten und Summen',
  pdf: 'eine fertige Druckdatei, etwa ein Flyer',
  explainable: 'eine Erklärseite in einfacher Sprache mit Erklärbildern',
  board: 'ein Aufgaben-Board mit Spalten und Karten',
  mcp: 'eine Abfrage bei einem Dienst',
  notebook: 'eine Recherche in Notebooks',
  bundestag: 'eine Bundestag-Recherche',
  abgeordnetenwatch: 'eine Abgeordnetenwatch-Recherche',
};

function artifactsOf(c: ResolverCase): ThreadToolContext[] {
  if (!c.artifacts || c.artifacts.length < 2) throw new Error(`${c.id}: braucht ≥ 2 artifacts`);
  return c.artifacts;
}

/**
 * `editTargetResolver`: auf welches von mehreren Artefakten zielt ein
 * Folgeauftrag? Die Optionen sind die Artefaktliste des Falls, in der Ordnung
 * von `renderArtifactChoices` (1 = zuletzt erzeugt).
 */
const editTarget: ResolverSpec = {
  name: 'editTarget',
  variants: {
    text: {
      state: (c) =>
        `ARTEFAKTE DIESES GESPRÄCHS (1 = zuletzt erzeugt):\n${renderArtifactChoices(artifactsOf(c))}\n\nFOLGEAUFTRAG:\n${c.text}`,
      question: (c) => ({
        type: 'choice',
        instructions: 'Auf welches Artefakt bezieht sich der FOLGEAUFTRAG? Im Zweifel: keines.',
        criteria: {
          ...Object.fromEntries(
            renderArtifactChoices(artifactsOf(c))
              .split('\n')
              .map((line, i) => [
                String(i + 1),
                `${line.replace(/^\d+\.\s*/, '')} – ${ARTIFACT_PARTS[artifactsOf(c)[i]!.kind]}`,
              ])
          ),
          keines:
            'keines: eine neue Frage, ein neues Thema, ein eigenständiger neuer Auftrag oder die Bitte, nichts zu ändern',
        },
      }),
    },
  },
  cases: loadCases('editTarget.jsonl'),
  baseline: async (c) => {
    const i = await resolveEditTarget({ userContent: c.text, artifacts: artifactsOf(c) });
    return i == null ? 'keines' : String(i + 1);
  },
};

/** Fester Stichtag, damit „dieses Jahr" in Korpus und Prüfung dasselbe meint. */
const COMPUTE_TODAY = '2026-11-09';

function computeState(c: ResolverCase): string {
  if (!c.code || !c.entries?.length) throw new Error(`${c.id}: code/entries fehlt`);
  const result = c.entries.map((e) => `- ${e.label}: ${e.value}`).join('\n');
  return `HEUTE: ${COMPUTE_TODAY}\n\nFRAGE:\n${c.text}\n\nAUSGEFÜHRTER PANDAS-CODE:\n${c.code}\n\nERGEBNIS:\n${result}`;
}

/**
 * `computeResultVerifier`: beantwortet ein durchgelaufenes pandas-Ergebnis die
 * gestellte Frage? Heute die `compute`-Lane mit JSON und Hinweis; ein
 * Entscheidungsmodell gäbe nur das Urteil, den Hinweis schriebe das LLM nur
 * noch bei `unplausibel`.
 *
 * Die Baseline läuft mit dem echten Datum, nicht mit `COMPUTE_TODAY` — Fälle
 * mit „dieses Jahr" sind deshalb auf 2026 geschrieben.
 */
const computeVerify: ResolverSpec = {
  name: 'computeVerify',
  variants: {
    text: {
      state: computeState,
      question: {
        type: 'choice',
        instructions:
          'Beantwortet der CODE die FRAGE? Du kennst die Rohdaten nicht – beurteile nur Code-Logik gegen Frage. Im Zweifel: plausibel.',
        criteria: {
          plausibel:
            'der Code rechnet genau, was die Frage verlangt, mit allen ihren Einschränkungen',
          einschraenkung_fehlt:
            'die Frage nennt einen Zeitraum, Ort, Status oder eine Kategorie, und der Code filtert nicht darauf',
          falsche_spalte: 'der Code rechnet mit einer anderen Spalte oder Gruppierung als gefragt',
          falsche_rechenart:
            'falsche Rechenart: Summe statt Durchschnitt, Zeilen zählen statt Werte summieren, doppelt gezählt',
          unmoeglicher_wert: 'das ERGEBNIS ist unmöglich, etwa eine negative Anzahl',
        },
      },
      answerOf: (choice) => (choice === 'plausibel' ? 'plausibel' : 'unplausibel'),
    },
  },
  cases: loadCases('computeVerify.jsonl'),
  baseline: async (c) => {
    const hint = await verifyComputeResult({
      question: null,
      auftrag: c.text,
      code: c.code ?? '',
      entries: c.entries ?? [],
    });
    return hint == null ? 'plausibel' : 'unplausibel';
  },
};

export const SPECS: Record<string, ResolverSpec> = {
  generation,
  sharepicFigureClaim,
  docsTiebreak,
  notebookMode,
  editTarget,
  computeVerify,
};
