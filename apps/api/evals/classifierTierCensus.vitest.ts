import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { classifierNode } from '../agents/langgraph/ChatGraph/nodes/classifierNode.js';
import { CLASSIFIER_PROMPT } from '../agents/langgraph/ChatGraph/nodes/classifierPrompt.js';

import type { ChatGraphState, ThreadToolContext } from '../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

/**
 * Wie oft erreicht ein Prompt noch den 27k-Zeichen-Klassifikator?
 *
 * Das ist die Erfolgsmeldung des Umbaus „ein grosser Prompt → mehrere winzige
 * Auflöser". „Der Prompt ist kleiner" ist keine Aussage über das Produkt; „von
 * X % auf Y % der Prompts" ist eine. Die Zahl lag bis hierher nur in einem
 * Wegwerf-Skript und war nach einer Sitzung weg — deshalb steht sie jetzt als
 * Sollwert im Repo und fällt auf, wenn sie wieder steigt.
 *
 * METHODE, damit die Zahlen zwischen Läufen vergleichbar bleiben:
 *
 *  - Echter `classifierNode` über den kompletten Eval-Korpus. Der Worker-Pool
 *    ist ein Zähler, kein Modell: er unterscheidet Aufrufe am Systemprompt und
 *    trennt den grossen Klassifikator von den kleinen Auflösern. Kein Netz.
 *  - Mehr-Turn-Einträge laufen als ein Gespräch: die Vorturns stehen in
 *    `messages`, und aus dem Verdikt des Vorturns wird das Artefakt-Gedächtnis
 *    des Threads simuliert (`lastToolContext` + `threadArtifacts`) — genau die
 *    beiden Felder, an denen die deterministischen Folgeauftrags-Stufen hängen.
 *    Ohne diese Simulation misst der Zähler einen Chat ohne Gedächtnis und
 *    schreibt jeder Stufe, die davon lebt, eine Wirkung von null zu.
 *  - Die kleinen Auflöser bekommen ihre neutrale Antwort (RESOLVER_DEFAULTS),
 *    nicht die JSON-Attrappe des grossen Prompts. Sonst misst der Zähler seinen
 *    eigenen Stub statt der Erreichbarkeit.
 *
 * ZWEI EHRLICHKEITSGRENZEN, beide gemessen und nicht geschätzt:
 *
 *  1. Der Korpus ist adversarial gebaut. Die Quote ist eine Obergrenze für
 *     SCHWIERIGE Prompts, nicht die Alltagsverteilung — die kennt niemand von
 *     uns. Der Wert taugt zum Vergleich mit sich selbst, nicht als Aussage über
 *     den Produktionsverkehr.
 *  2. `blindFollowUps` ist die Fehlerschranke nach oben. Ein Turn, der den
 *     grossen Prompt erreicht, hat für den Zähler kein Verdikt — der Stub sagt
 *     `direct`, und das heisst „kein Artefakt". Wo der Korpus kein `routing`
 *     erwartet, weiss die Kette ab da nicht mehr, was in ihr entstanden ist,
 *     und ihre Folgeaufträge finden keine deterministische Tür. Direkt
 *     nachgemessen: `doc-create-edit#2` und `golden-doc-at-depth#11` werden mit
 *     korrektem Gedächtnis ohne einen einzigen Modellaufruf zu `modify_doc`.
 *     Der Zähler zählt sie trotzdem — geraten wird hier nichts, ausgewiesen
 *     schon. Der wahre Wert liegt zwischen (bigPrompt − blindFollowUps) und
 *     bigPrompt.
 *
 * Der Zähler misst NICHT das Verhalten der Auflöser, nur ob sie gefragt werden.
 * Ob ein `wetter`-Turn auch als `wetter` beantwortet wird, belegt das A/B mit
 * echtem Modell, nicht diese Datei.
 */

const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'corpus');

/**
 * Anteil der Prompts, die den grossen Klassifikator-Prompt erreichen dürfen.
 *
 *   22,3 %  37/166  Stand vor dem Sharepic-Zweig in Tier 2.7
 *   19,9 %  33/166  danach (31.07.2026)
 *   18,1 %  30/166  nach dem Erreichbarkeits-Fix am Live-Quellen-Gitter,
 *                   davon 6 blind (siehe unten) → wahrer Wert 14,5–18,1 %
 *
 * Nicht vergleichbar mit den 19,3 % der ersten Ad-hoc-Sonde: die mass jeden
 * Turn einzeln, also einen Chat ohne Gedächtnis. Mit Verlauf und simuliertem
 * Artefakt-Gedächtnis fallen mehr Folgeaufträge unter die Konfidenzschwelle —
 * die Zahl ist höher, weil sie ehrlicher ist. Vergleiche gelten ab hier nur
 * noch innerhalb dieser Methode.
 *
 * Der Deckel liegt knapp über dem gemessenen Wert: er soll einen Rückschritt
 * melden, nicht bei jeder Nachkommastelle rot werden. Sinkt die Quote, wird er
 * mitgesenkt — ein Deckel, der über dem Ist-Zustand stehen bleibt, misst nichts.
 */
const TIER4_SHARE_CEILING = 0.19;

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
 */
const ARTIFACT_KIND_BY_INTENT: Record<string, ThreadToolContext['kind']> = {
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

interface Census {
  prompts: number;
  bigPrompt: number;
  smallResolver: number;
  byId: Array<{ id: string; intent: string; blind: boolean }>;
  blindFollowUps: number;
}

/**
 * Was die kleinen Auflöser antworten, wenn niemand fragt.
 *
 * Der Zähler misst ERREICHBARKEIT, nicht Modellverhalten — er hat kein Netz.
 * Für jeden Auflöser gibt es aber genau eine Antwort, die keine Entscheidung
 * vorwegnimmt, und die muss der Stub liefern, sonst misst der Zähler seinen
 * eigenen Stub:
 *
 *  - Live-Quelle → „keine". Ohne diese Zeile liest `parseScope` aus der
 *    JSON-Antwort unten gar nichts heraus und gibt `null` zurück — was „nichts
 *    entschieden, weiter zu Tier 4" heisst. Jeder Turn, den `SYSTEM_MCP_PHRASING`
 *    von der Demotion zurückhält, landete dann im Zähler beim grossen Prompt,
 *    und ein VERBREITERTER Regex sähe wie ein Rückschritt aus, obwohl er in
 *    Produktion das Gegenteil bewirkt.
 *  - Bearbeitungsziel → „0" (keines), damit der Auflöser das Verhalten ohne ihn
 *    nicht verändert.
 *
 * Gespiegelt von `RESOLVER_DEFAULTS` im Integrations-Stub — dieselbe Aufgabe,
 * dieselbe Antwort.
 */
const RESOLVER_DEFAULTS: ReadonlyArray<{ prefix: string; reply: string }> = [
  { prefix: 'Entscheide, ob diese Anfrage Daten', reply: 'keine' },
  { prefix: 'Ein Gespräch hat mehrere Artefakte', reply: '0' },
];

/** Zählt Modellaufrufe und trennt den grossen Prompt von den kleinen Auflösern. */
function makeCountingPool(counts: { big: number; small: number }) {
  return {
    processRequest: async (req: { systemPrompt?: string }) => {
      if (req.systemPrompt === CLASSIFIER_PROMPT) {
        counts.big += 1;
        return {
          content: JSON.stringify({
            intent: 'direct',
            searchQuery: null,
            reasoning: 'Zähler-Stub',
          }),
        };
      }
      counts.small += 1;
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
    aiWorkerPool: pool,
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

async function runCensus(): Promise<Census> {
  const counts = { big: 0, small: 0 };
  const pool = makeCountingPool(counts);
  const census: Census = {
    prompts: 0,
    bigPrompt: 0,
    smallResolver: 0,
    byId: [],
    blindFollowUps: 0,
  };

  for (const entry of loadCorpus()) {
    const turns: CorpusTurn[] =
      entry.prompt != null
        ? [{ prompt: entry.prompt, ...(entry.expect && { expect: entry.expect }) }]
        : (entry.turns ?? []);
    const history: ModelMessage[] = [];
    let artifacts: ThreadToolContext[] = [];
    /** Ab hier weiss die Kette nicht mehr, was in ihr entstanden ist. */
    let blind = false;

    for (const [i, turn] of turns.entries()) {
      const prompt = turn.prompt;
      const before = counts.big;
      let intent = 'ERR';
      try {
        const result = await classifierNode(buildState(prompt, history, artifacts, pool));
        intent = String(result.intent ?? '?');
      } catch (err) {
        intent = `ERR:${(err as Error).message.slice(0, 50)}`;
      }
      const reachedBigPrompt = counts.big > before;
      census.prompts += 1;
      if (reachedBigPrompt) {
        census.bigPrompt += 1;
        if (blind) census.blindFollowUps += 1;
        census.byId.push({
          id: turns.length > 1 ? `${entry.id}#${i + 1}` : entry.id,
          intent,
          blind,
        });
      }

      // Thread fortschreiben: Verlauf plus simuliertes Artefakt-Gedächtnis.
      history.push({ role: 'user', content: prompt });
      history.push({ role: 'assistant', content: '(Antwort)' });

      // Welches Verdikt das Gedächtnis fortschreibt.
      //
      // Erreichte der Turn den grossen Prompt, kam sein Intent vom Stub und ist
      // wertlos — und `direct` ist nicht neutral, es heisst „kein Artefakt".
      // Genau daran verhungerte die Simulation: eine Kette, deren ERSTER Turn
      // bei Tier 4 landet, erzeugt nie ein Artefakt, und jeder Folgeauftrag
      // darin findet keine deterministische Tür mehr. Gemessen am 31.07.2026
      // traf das `doc-create-edit#2` und `golden-doc-at-depth#11`: beide werden
      // mit korrektem Gedächtnis ohne einen einzigen Modellaufruf zu
      // `modify_doc` — der Zähler meldete sie als Tier-4-Treffer.
      //
      // Wo der Korpus das erwartete Routing selbst nennt, wird es genommen. Wo
      // nicht, bleibt der Turn unbekannt: das Gedächtnis wird nicht geraten,
      // sondern die Kette ab hier als `blind` gezählt und ausgewiesen. Ein
      // geratenes Artefakt wäre eine erfundene Messung, eine ausgewiesene Lücke
      // ist eine Fehlerschranke.
      const declaredRouting = turn.expect?.routing;
      let effectiveIntent: string | null = intent;
      if (reachedBigPrompt) {
        effectiveIntent = declaredRouting ?? null;
        if (effectiveIntent == null) blind = true;
      }

      const kind = effectiveIntent ? ARTIFACT_KIND_BY_INTENT[effectiveIntent] : undefined;
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
  census.smallResolver = counts.small;
  return census;
}

describe('Klassifikator-Tier-Zählung über den Eval-Korpus', () => {
  it(`erreicht den grossen Prompt bei höchstens ${(TIER4_SHARE_CEILING * 100).toFixed(0)} % der Prompts`, async () => {
    const census = await runCensus();
    const share = census.bigPrompt / census.prompts;

    // Der Bericht ist der halbe Zweck: der nackte Prozentsatz sagt nicht, WELCHE
    // Prompts noch durchgehen, und genau das ist die Arbeitsliste für die
    // nächste Stufe.
    console.log(
      `\n[Tier-Zählung] ${census.bigPrompt}/${census.prompts} Prompts erreichen den 27k-Prompt ` +
        `(${(share * 100).toFixed(1)} %), Deckel ${(TIER4_SHARE_CEILING * 100).toFixed(0)} %.\n` +
        `[Tier-Zählung] Kleine Auflöser: ${census.smallResolver} Aufrufe.\n` +
        `[Tier-Zählung] Davon in einer Kette ohne Artefakt-Gedächtnis: ${census.blindFollowUps} ` +
        `— Fehlerschranke nach oben, nicht bewiesene Tier-4-Fälle.\n` +
        census.byId.map((r) => `  [${r.intent}]${r.blind ? ' (blind)' : ''} ${r.id}`).join('\n')
    );

    expect(census.prompts).toBeGreaterThan(150);
    expect(share).toBeLessThanOrEqual(TIER4_SHARE_CEILING);
  }, 120_000);
});
