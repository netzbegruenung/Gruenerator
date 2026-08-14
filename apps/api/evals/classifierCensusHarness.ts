import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifierNode } from '../agents/langgraph/ChatGraph/nodes/classifierNode.js';
import {
  createDecisionJournal,
  runWithDecisionJournal,
  type DecisionJournal,
} from '../utils/decisionJournal.js';

import type { ChatGraphState, ThreadToolContext } from '../agents/langgraph/ChatGraph/types.js';
import type { ChatIntentId } from '@gruenerator/shared/chat-intents';
import type { ModelMessage } from 'ai';

/**
 * Ein Lauf des echten `classifierNode` über den kompletten Eval-Korpus, ohne
 * Netz — die gemeinsame Grundlage aller Klassifikator-Zählungen.
 *
 * Extrahiert aus `classifierTierCensus.vitest.ts`, als die zweite Zählung
 * (Dispositionen) dieselbe Vorrichtung brauchte. Kopieren wäre hier besonders
 * teuer gewesen: die Feinheiten unten — die neutralen Auflöser-Antworten, das
 * simulierte Artefakt-Gedächtnis, die Blind-Buchführung — sind teuer erkaufte
 * Messkorrekturen, und eine Kopie hätte sie in genau dem Moment verloren, in
 * dem eine zweite Zahl sie hätte bestätigen sollen.
 *
 * METHODE, damit Zahlen zwischen Läufen vergleichbar bleiben:
 *
 *  - Der Worker-Pool ist ein Zähler, kein Modell: er beantwortet jeden Auflöser
 *    an seinem Systemprompt-Präfix und misst nebenbei, wie gross der grösste
 *    Prompt ist, den der Klassifikator noch verschickt.
 *  - Mehr-Turn-Einträge laufen als EIN Gespräch: die Vorturns stehen in
 *    `messages`, und aus dem Verdikt des Vorturns wird das Artefakt-Gedächtnis
 *    des Threads simuliert (`lastToolContext` + `threadArtifacts`) — genau die
 *    beiden Felder, an denen die deterministischen Folgeauftrags-Stufen hängen.
 *    Ohne diese Simulation misst man einen Chat ohne Gedächtnis und schreibt
 *    jeder Stufe, die davon lebt, eine Wirkung von null zu.
 *  - Jeder Turn klassifiziert unter einem eigenen Entscheidungsjournal, so dass
 *    jede Zählung nicht nur das Ergebnis, sondern den WEG dorthin sieht.
 *
 * Der Lauf misst Erreichbarkeit, nicht Modellverhalten. Ob ein `wetter`-Turn
 * auch als `wetter` beantwortet wird, belegt das A/B mit echtem Modell.
 */

const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'corpus');

interface CorpusTurn {
  prompt: string;
  expect?: { routing?: string };
}

interface CorpusEntry {
  id: string;
  prompt?: string;
  expect?: { routing?: string };
  turns?: CorpusTurn[];
}

function loadCorpus(): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  for (const file of readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(CORPUS_DIR, file), 'utf8').split('\n')) {
      if (line.trim()) entries.push(JSON.parse(line) as CorpusEntry);
    }
  }
  return entries;
}

/**
 * Welches Artefakt ein Turn hinterlässt — die Kurzfassung von
 * `deriveToolContext` (postResponseService), auf das reduziert, was aus dem
 * Klassifikator-Verdikt allein ableitbar ist.
 *
 * `Partial<Record<ChatIntentId, …>>` statt `Record<string, …>`: ein Tippfehler
 * im Schlüssel wäre sonst eine stumme Null-Wirkung, und diese Karte ist die
 * Quelle des simulierten Gedächtnisses — sie darf nicht leise danebengreifen.
 */
const ARTIFACT_KIND_BY_INTENT: Partial<Record<ChatIntentId, ThreadToolContext['kind']>> = {
  sharepic: 'sharepic',
  social_post: 'sharepic',
  image: 'image',
  image_edit: 'image',
  save_as_doc: 'document',
  modify_doc: 'document',
  artifact: 'document',
  create_sheet: 'sheet',
  create_presentation: 'presentation',
  create_pdf: 'pdf',
  modify_board: 'board',
  mcp: 'mcp',
  bundestag: 'bundestag',
  abgeordnetenwatch: 'abgeordnetenwatch',
};

/**
 * Was die kleinen Auflöser antworten, wenn niemand fragt.
 *
 * Die Zählung misst ERREICHBARKEIT, nicht Modellverhalten — sie hat kein Netz.
 * Für jeden Auflöser gibt es aber genau eine Antwort, die keine Entscheidung
 * vorwegnimmt, und die muss der Stub liefern, sonst misst die Zählung ihren
 * eigenen Stub:
 *
 *  - Live-Quelle → „keine". Ohne diese Zeile gibt `parseScope` `null` zurück —
 *    „nichts entschieden" — und der Turn bliebe an der Live-Quellen-Tür hängen,
 *    statt zur Demotion zurückgegeben zu werden. Ein VERBREITERTER
 *    `SYSTEM_MCP_PHRASING` sähe dann wie ein Rückschritt aus, obwohl er in
 *    Produktion das Gegenteil bewirkt.
 *  - Bearbeitungsziel → „0" (keines), damit der Auflöser das Verhalten ohne ihn
 *    nicht verändert.
 *
 * Gespiegelt von `RESOLVER_DEFAULTS` im Integrations-Stub — dieselbe Aufgabe,
 * dieselbe Antwort. Ein NEUER Auflöser braucht seinen Präfix in BEIDEN Listen.
 */
const RESOLVER_DEFAULTS: ReadonlyArray<{ prefix: string; reply: string }> = [
  { prefix: 'Entscheide, ob diese Anfrage Daten', reply: 'keine' },
  { prefix: 'Ein Gespräch hat mehrere Artefakte', reply: '0' },
  { prefix: 'Entscheide, ob diese Nachricht ein ARTEFAKT', reply: 'keine' },
];

/**
 * Zählt Modellaufrufe und misst den grössten Systemprompt, den der
 * Klassifikator überhaupt noch verschickt.
 *
 * Der Vorgänger unterschied hier den 27k-Prompt von den kleinen Auflösern, per
 * Identitätsvergleich mit `CLASSIFIER_PROMPT`. Den gibt es nicht mehr, und ein
 * Zähler, dessen Bezugsgrösse gelöscht ist, misst nichts — deshalb misst dieser
 * die LÄNGE statt der Identität. Damit bleibt die Frage prüfbar, ohne von einer
 * einzelnen Konstante abzuhängen: ein wieder wachsender Taxonomie-Prompt fällt
 * auf, egal wie er heisst.
 */
function makeCountingPool(counts: { calls: number; maxPromptChars: number }) {
  return {
    processRequest: async (req: { systemPrompt?: string }) => {
      counts.calls += 1;
      counts.maxPromptChars = Math.max(counts.maxPromptChars, req.systemPrompt?.length ?? 0);
      const resolver = RESOLVER_DEFAULTS.find((r) => req.systemPrompt?.startsWith(r.prefix));
      return { content: resolver?.reply ?? 'keine' };
    },
  };
}

function buildState(
  userMessage: string,
  history: ModelMessage[],
  artifacts: ThreadToolContext[],
  pool: unknown
): ChatGraphState {
  return {
    messages: [...history, { role: 'user', content: userMessage }],
    threadId: history.length > 0 ? 'census-thread' : null,
    agentConfig: {
      identifier: 'gruenerator-universal',
      name: 'Universal',
      systemPrompt: '',
      allowedCollections: null,
      description: '',
      avatar: '',
      backgroundColor: '',
      slug: 'universal',
      isSystemDefault: true,
    },
    enabledTools: {},
    aiClient: pool,
    userLocale: 'de-DE',
    clientPlatform: 'web',
    ...(artifacts[0] ? { lastToolContext: artifacts[0] } : {}),
    threadArtifacts: artifacts,
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    pdfFormAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    defaultNotebookDocumentIds: [],
    documentIds: [],
    documentChatIds: [],
    docMentionIds: [],
    boardIds: [],
    currentDocument: null,
    intent: 'direct',
    searchSources: [],
    searchQuery: null,
  } as unknown as ChatGraphState;
}

export interface CensusTurn {
  /** `<szenario>` bzw. `<szenario>#<n>` bei Mehr-Turn-Einträgen. */
  id: string;
  prompt: string;
  /** Das Verdikt des Klassifikators, oder `ERR:…` wenn er geworfen hat. */
  intent: string;
  /** Der Turn hat für seine Einordnung ein Modell gebraucht. */
  usedModel: boolean;
  /**
   * Die Kette weiss ab hier nicht mehr, welches Artefakt in ihr entstanden ist.
   * Fehlerschranke nach oben, kein bewiesener Befund — siehe `runClassifierCensus`.
   */
  blind: boolean;
  /** Die Entscheidungen, die dieser Turn beim Klassifizieren getroffen hat. */
  journal: DecisionJournal;
}

export interface CensusRun {
  turns: CensusTurn[];
  /** Modellaufrufe der Auflöser über den gesamten Lauf. */
  resolverCalls: number;
  /** Der grösste Systemprompt, den der Klassifikator im Lauf verschickt hat. */
  maxPromptChars: number;
}

/**
 * Klassifiziert den kompletten Korpus und gibt jeden Turn einzeln zurück.
 *
 * ZWEI EHRLICHKEITSGRENZEN, beide gemessen und nicht geschätzt:
 *
 *  1. Der Korpus ist adversarial gebaut. Jede Quote daraus ist eine Obergrenze
 *     für SCHWIERIGE Prompts, nicht die Alltagsverteilung — die kennt niemand
 *     von uns. Die Werte taugen zum Vergleich mit sich selbst, nicht als
 *     Aussage über den Produktionsverkehr.
 *  2. `blind` ist die Fehlerschranke nach oben. Ein Turn, der den grossen
 *     Prompt erreicht, hat für die Zählung kein Verdikt — der Stub sagt
 *     `direct`, und das heisst „kein Artefakt". Wo der Korpus kein `routing`
 *     erwartet, weiss die Kette ab da nicht mehr, was in ihr entstanden ist,
 *     und ihre Folgeaufträge finden keine deterministische Tür. Direkt
 *     nachgemessen: `doc-create-edit#2` und `golden-doc-at-depth#11` werden mit
 *     korrektem Gedächtnis ohne einen einzigen Modellaufruf zu `modify_doc`.
 *     Geraten wird hier nichts, ausgewiesen schon.
 */
export async function runClassifierCensus(): Promise<CensusRun> {
  const counts = { calls: 0, maxPromptChars: 0 };
  const pool = makeCountingPool(counts);
  const turns: CensusTurn[] = [];

  for (const entry of loadCorpus()) {
    const entryTurns: CorpusTurn[] =
      entry.prompt != null
        ? [{ prompt: entry.prompt, ...(entry.expect && { expect: entry.expect }) }]
        : (entry.turns ?? []);
    const history: ModelMessage[] = [];
    let artifacts: ThreadToolContext[] = [];
    /** Ab hier weiss die Kette nicht mehr, was in ihr entstanden ist. */
    let blind = false;

    for (const [i, turn] of entryTurns.entries()) {
      const prompt = turn.prompt;
      const before = counts.calls;
      const journal = createDecisionJournal();
      // Kein Startwert: beide Zweige weisen zu, und ein toter Vorbelegungswert
      // wäre genau der, der bei einem künftigen dritten Zweig still stehenbliebe.
      let intent: string;
      try {
        const result = await runWithDecisionJournal(journal, () =>
          classifierNode(buildState(prompt, history, artifacts, pool))
        );
        intent = String(result.intent ?? '?');
      } catch (err) {
        intent = `ERR:${(err as Error).message.slice(0, 50)}`;
      }
      const usedModel = counts.calls > before;

      // Wo der STUB das Verdikt bestimmt hat, ist das Verdikt keine Messung.
      //
      // Das war früher „der Turn erreichte den grossen Prompt". Der ist weg, und
      // die Grenze verschiebt sich damit auf den einen Auflöser, dessen neutrale
      // Antwort ein echtes Verdikt ersetzt: `tier3.8_generation_scope` antwortet
      // hier immer „keine" → `produktion`, ein echtes Modell sagt bei manchen
      // dieser Turns „sharepic". Für alles andere ist die Antwort des Stubs
      // gleichbedeutend mit „nichts entschieden", und die Stufe darunter
      // entscheidet deterministisch weiter.
      const stubDecided = journal.entries.some(
        (e) => e.point === 'classifier.tier' && e.chose === 'tier3.8_generation_scope'
      );

      turns.push({
        id: entryTurns.length > 1 ? `${entry.id}#${i + 1}` : entry.id,
        prompt,
        intent,
        usedModel,
        blind,
        journal,
      });

      // Thread fortschreiben: Verlauf plus simuliertes Artefakt-Gedächtnis.
      history.push({ role: 'user', content: prompt });
      history.push({ role: 'assistant', content: '(Antwort)' });

      // Welches Verdikt das Gedächtnis fortschreibt.
      //
      // Wo der Korpus das erwartete Routing selbst nennt, wird es genommen. Wo
      // nicht, bleibt der Turn unbekannt: das Gedächtnis wird nicht geraten,
      // sondern die Kette ab hier als `blind` gezählt und ausgewiesen. Ein
      // geratenes Artefakt wäre eine erfundene Messung, eine ausgewiesene Lücke
      // ist eine Fehlerschranke.
      const declaredRouting = turn.expect?.routing;
      let effectiveIntent: string | null = intent;
      if (stubDecided) {
        effectiveIntent = declaredRouting ?? null;
        if (effectiveIntent == null) blind = true;
      }

      const kind = effectiveIntent
        ? ARTIFACT_KIND_BY_INTENT[effectiveIntent as ChatIntentId]
        : undefined;
      if (kind) {
        artifacts = [
          {
            kind,
            ref: kind === 'sharepic' ? null : `${kind}-${i}`,
            label: `${kind} aus Turn ${i + 1}`,
          },
          ...artifacts.filter((a) => a.kind !== kind),
        ].slice(0, 4);
      }
    }
  }

  return { turns, resolverCalls: counts.calls, maxPromptChars: counts.maxPromptChars };
}
