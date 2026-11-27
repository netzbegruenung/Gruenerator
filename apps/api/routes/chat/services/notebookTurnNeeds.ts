/**
 * Was ein Notebook-Turn über den Bestand im Ganzen braucht, entschieden vom
 * Entscheidungsmodell (`aiDecide`) — damit der Chatmodus es vorab berechnen
 * kann, ohne Werkzeug-Loop.
 *
 * Die Chat-Pipeline sieht nur die Auszüge der Suche. Im Eval vom 27.11.2026
 * (`gruenerator-intern/evals/notebook-docq-2026-11-27.md`) hat sie deshalb
 * Wortzählungen aus dem Kontext geraten („23" statt 27) und eine genannte Seite
 * nicht gefunden. Zählung und Seitentext rechnet `notebookTurnFacts.ts` ohne
 * Modell aus; hier fällt nur die Entscheidung, ob und welche.
 *
 * Ein Aufruf mit allen Fragen, die Unterscheidung steht in den Kriterien (siehe
 * `notebookAnswerModeResolver.ts`: lange Anweisungen machten die Modelle
 * schlechter). Die Seitenzahl kommt in einem zweiten Aufruf, nur wenn eine
 * Seite gefragt UND ein Dokument gewählt ist — ihre Optionen hängen am Dokument.
 * Freitext kann das Modell nicht: den Suchbegriff fürs Zählen liefert
 * `extractSearchTerms`.
 */
import {
  aiDecide,
  type ChoiceAnswer,
  type ChoiceQuestion,
  type DecideCall,
} from '../../../services/ai/decide.js';
import { createLogger } from '../../../utils/logger.js';

import { formatGuardPrompt, type NotebookGuardTurn } from './notebookAnswerModeResolver.js';

import type { InventoryList } from './notebookInventory.js';

const log = createLogger('NotebookTurnNeeds');

/** Mehr Dokumente als Optionen sprengen die Anfrage (12.000 Bytes) und die Trennschärfe. */
export const DOC_OPTION_LIMIT = 25;
/** Mehr Seiten als Optionen: dann wird keine Seite gelesen. */
export const PAGE_OPTION_LIMIT = 60;
const TITLE_CHARS = 100;
const TIMEOUT_MS = 1500;
const NO_DOCUMENT = 'keins';

export interface NotebookTurnNeeds {
  /** Wörtliche Vorkommen über alle Quellen zählen oder finden. */
  count: boolean;
  /** Den Text einer bestimmten Seite eines Dokuments lesen. */
  page: { sourceId: string; page: number } | null;
  /** Kleinste `confidence` der beantworteten Fragen. */
  confidence: number;
}

type Decide = (call: DecideCall<string>) => Promise<Partial<Record<string, ChoiceAnswer>>>;

const YES_NO = (yes: string, no: string): Record<string, string> => ({ ja: yes, nein: no });

export const ZAEHLEN: ChoiceQuestion = {
  type: 'choice',
  instructions:
    'Muss für die letzte Nachricht ein Wort in den Quellen gezählt oder gesucht werden?',
  criteria: YES_NO(
    'sie fragt, WIE OFT ein bestimmtes Wort oder eine Formulierung in den Quellen vorkommt, IN WELCHEN Quellen es wörtlich steht, oder ob ein Satz wörtlich drinsteht',
    'alles andere – die Anzahl oder Seitenzahl der Dokumente, wie oft ein THEMA behandelt wird, eine Zahl, ein Betrag oder ein Datum aus einer Quelle, jede Inhaltsfrage'
  ),
};

export const STELLE: ChoiceQuestion = {
  type: 'choice',
  instructions: 'Soll der Text einer Seite gelesen werden, deren Seitenzahl genannt ist?',
  criteria: YES_NO(
    'die Nachricht nennt eine SEITENZAHL wie „Seite 3" oder „S. 7" (oder „weiter"/„nächste Seite" nach einer gelesenen Seite im Verlauf) und will wissen, was auf dieser Seite steht',
    'keine Seitenzahl genannt – Inhaltsfragen, Abschnitte, Kapitel und Absätze, ein Wort oder Zitat wörtlich prüfen oder zählen, auch die Frage „auf welcher Seite steht X"; Ziffern in einem Dokumentnamen wie „WP-05" sind keine Seite'
  ),
};

function documentQuestion(inventory: readonly InventoryList[]): ChoiceQuestion | null {
  const items = inventory.flatMap((l) => l.items);
  if (items.length === 0 || items.length > DOC_OPTION_LIMIT) return null;
  const criteria: Record<string, string> = {};
  for (const item of items) criteria[item.ref] = item.title.slice(0, TITLE_CHARS);
  criteria[NO_DOCUMENT] = 'kein bestimmtes Dokument ist gemeint';
  return {
    type: 'choice',
    instructions: 'Welches Dokument meint die letzte Nachricht?',
    criteria,
  };
}

function pageQuestion(title: string, pages: number): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (let p = 1; p <= pages; p++) criteria[String(p)] = `Seite ${p}`;
  return {
    type: 'choice',
    instructions: `Welche Seite von „${title.slice(0, TITLE_CHARS)}" ist gemeint?`,
    criteria,
  };
}

export async function decideNotebookTurnNeeds(
  input: {
    question: string;
    history: readonly NotebookGuardTurn[];
    inventory: readonly InventoryList[];
  },
  deps: { decide: Decide } = { decide: aiDecide }
): Promise<NotebookTurnNeeds | null> {
  const state = formatGuardPrompt(input.question, input.history);
  const dokument = documentQuestion(input.inventory);
  try {
    const first = await deps.decide({
      label: 'NotebookTurnNeeds',
      state,
      questions: {
        zaehlen: ZAEHLEN,
        stelle: STELLE,
        ...(dokument ? { dokument } : {}),
      },
      timeoutMs: TIMEOUT_MS,
    });
    const { zaehlen, stelle } = first;
    if (!zaehlen || !stelle) throw new Error('decision answer incomplete');
    const confidences = [zaehlen.confidence, stelle.confidence];
    let page: NotebookTurnNeeds['page'] = null;

    const picked = dokument ? first.dokument?.choice : undefined;
    const item =
      picked && picked !== NO_DOCUMENT
        ? input.inventory.flatMap((l) => l.items).find((i) => i.ref === picked)
        : undefined;
    if (stelle.choice === 'ja' && item?.pages && item.pages <= PAGE_OPTION_LIMIT) {
      const second = await deps.decide({
        label: 'NotebookTurnNeeds:page',
        state,
        questions: { seite: pageQuestion(item.title, item.pages) },
        timeoutMs: TIMEOUT_MS,
      });
      const n = second.seite ? Number.parseInt(second.seite.choice, 10) : Number.NaN;
      if (second.seite && Number.isInteger(n) && n >= 1 && n <= item.pages) {
        page = { sourceId: item.ref, page: n };
        confidences.push(second.seite.confidence);
      }
    }

    return {
      count: zaehlen.choice === 'ja',
      page,
      confidence: Math.min(...confidences),
    };
  } catch (err) {
    log.warn(
      `[NotebookTurnNeeds] decision failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}
