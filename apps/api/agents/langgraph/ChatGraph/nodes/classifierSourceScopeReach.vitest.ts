import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SYSTEM_MCP_PHRASING } from './classifierSignals.js';

import type { ChatGraphState } from '../types.js';

/**
 * Erreichbarkeit: kommt bei Tier 3.7 überhaupt an, wofür der Auflöser zuständig
 * ist?
 *
 * Der Auflöser-Prompt (`sourceScopeResolver.ts`) führt seine Zuständigkeit in
 * Prosa auf, inklusive Beispielformulierungen. `SYSTEM_MCP_PHRASING` entscheidet
 * davon unabhängig, welche Turns die Tier-3.5-Demotion überhaupt passieren
 * dürfen. Die beiden können auseinanderlaufen, ohne dass ein Test rot wird:
 * gemessen am 31.07.2026 erreichten **6 von 13** echten Live-Quellen-Anfragen
 * den Auflöser nicht — fünf davon Formulierungen, die sein eigener Prompt als
 * Beispiel nennt ("wo kann ich in X übernachten", "was gibt es Neues zu X",
 * "aktuelle Nachrichten aus Y", Pollen, Luftqualität).
 *
 * Deshalb steht die Tabelle hier und nicht als Regex-Unit-Test: geprüft wird
 * nicht, was der Regex matcht, sondern ob der Turn beim Auflöser ANKOMMT. Das
 * ist die Eigenschaft, die kaputtgehen kann, wenn jemand an der Demotion
 * schraubt, ohne den Regex zu kennen — oder umgekehrt.
 *
 * Die Gegenrichtung gehört dazu: der Regex darf grosszügig sein, seit ein
 * `keine`-Verdikt den Turn in die Demotion zurückgibt. Grosszügig heisst aber
 * nicht folgenlos — jeder Fehltreffer kostet einen kleinen Modellaufruf. Die
 * Politik-Zeilen unten halten fest, was NICHT gefragt werden soll.
 */

vi.mock('../../../../services/mcp/systemMcpServers.js', () => ({
  SYSTEM_MCP_INTENTS: new Set(['bahn', 'reise', 'hotel', 'wetter', 'news']),
  isSystemIntentAvailable: vi.fn(() => true),
}));

const { classifierNode } = await import('./classifierNode.js');

/**
 * Formulierungen, für die der Auflöser laut seinem Prompt zuständig ist.
 *
 * GEPRÜFT WIRD ERREICHBARKEIT, NICHT TRENNSCHÄRFE. Die Antwort des Auflösers ist
 * hier gestubbt; dass das echte Modell sie auch trifft, belegt das A/B mit
 * echtem Modell, nicht diese Tabelle. Stand dieses A/B (31.07.2026): alle Fälle
 * korrekt bis auf „Was gibt es Neues zum Heizungsgesetz?" — dort antwortet das
 * Modell `keine`, der Turn geht also über das Ventil unten in den Loop und wird
 * per Websuche beantwortet. Das ist ein bekannter Grenzfall und kein Grund, ihn
 * aus dieser Tabelle zu nehmen: erreichbar sein MUSS er, sonst ist die Frage nie
 * gestellt worden.
 */
const MUST_REACH: ReadonlyArray<readonly [string, string]> = [
  ['bahn', 'Wann fährt der nächste Zug nach Köln?'],
  ['bahn', 'Wie komme ich morgen früh von Freiburg nach Berlin?'],
  ['bahn', 'Hat der ICE 599 Verspätung?'],
  ['hotel', 'Wo kann ich in Nürnberg übernachten?'],
  ['hotel', 'Finde mir eine günstige Unterkunft in Leipzig'],
  ['wetter', 'Wie wird das Wetter morgen in Freiburg?'],
  ['wetter', 'Regnet es heute Nachmittag in Kiel?'],
  ['wetter', 'Wie hoch ist die Pollenbelastung in Nürnberg gerade?'],
  ['wetter', 'Wie ist die Luftqualität heute in Stuttgart?'],
  ['news', 'Was gibt es Neues zum Heizungsgesetz?'],
  ['news', 'Aktuelle Nachrichten aus Sachsen bitte'],
  ['news', 'Was steht heute in der tagesschau?'],
  ['news', 'Welche Schlagzeilen gibt es zur Rentenreform?'],
];

/**
 * Politische Fragen, die dasselbe Vokabular streifen.
 *
 * Zugesichert wird hier NICHT „erreicht den Auflöser nicht". Der Auflöser sitzt
 * an der Tür von Tier 4 und wird für jeden Turn gefragt, der dort ankommt — das
 * ist der Grund für seine Platzierung, nicht ein Fehler. Ein Turn kann Tier 4
 * aus ganz anderen Gründen erreichen als über diesen Regex („Erklär mir die
 * Wetterextreme …" ist schlicht nicht demotierbar), und ein Test, der dann rot
 * wird, misst die falsche Sache.
 *
 * Zugesichert wird die Eigenschaft, die dieser Regex tatsächlich kontrolliert:
 * er darf einen demotierbaren Politik-Turn nicht festhalten. Hält er ihn fest,
 * kostet das einen Modellaufruf auf dem kritischen Pfad — folgenlos fürs
 * Routing (das `keine`-Ventil gibt ihn zurück), aber eben nicht gratis.
 */
const MUST_NOT_BE_HELD_BACK: ReadonlyArray<string> = [
  'Was fordern die Grünen zur Bahnreform?',
  'Wie steht die Partei zur Tourismuspolitik?',
  'Erklär mir die Wetterextreme der letzten Jahre',
];

function makePool(answer: string) {
  const resolverCalls: string[] = [];
  const bigPromptCalls: string[] = [];
  const processRequest = vi.fn(async (req: { systemPrompt?: string }) => {
    const prompt = req.systemPrompt ?? '';
    if (prompt.startsWith('Entscheide, ob diese Anfrage Daten')) {
      resolverCalls.push(prompt);
      return { content: answer };
    }
    bigPromptCalls.push(prompt);
    return {
      content: JSON.stringify({ intent: 'direct', searchQuery: null, reasoning: 'LLM-Stufe' }),
    };
  });
  return { processRequest, resolverCalls, bigPromptCalls };
}

function buildState(userMessage: string, pool: { processRequest: unknown }): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: {
      identifier: 'gruenerator-universal',
      name: 'Test Agent',
      systemPrompt: 'Du bist ein Assistent.',
      allowedCollections: null,
      description: '',
      avatar: '',
      backgroundColor: '',
      slug: 'test',
      isSystemDefault: true,
    },
    enabledTools: {},
    aiWorkerPool: pool,
    userLocale: 'de-DE',
    clientPlatform: 'web',
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

describe('Tier 3.7 — Erreichbarkeit des Live-Quellen-Auflösers', () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [scope, message] of MUST_REACH) {
    it(`fragt den Auflöser bei [${scope}] „${message}"`, async () => {
      const pool = makePool(scope);
      const result = await classifierNode(buildState(message, pool));
      expect(pool.resolverCalls).toHaveLength(1);
      expect(result.intent).toBe(scope);
    });
  }

  for (const message of MUST_NOT_BE_HELD_BACK) {
    it(`hält „${message}" nicht von der Demotion zurück`, () => {
      expect(SYSTEM_MCP_PHRASING.test(message)).toBe(false);
    });
  }

  it('gibt einen Turn, den nur der Regex festgehalten hat, an die Demotion zurück', async () => {
    // Das Ventil, das den grosszügigen Regex bezahlbar macht: ein Fehltreffer
    // kostet einen ~700-Zeichen-Aufruf und landet danach genau dort, wo der Turn
    // ohne den Regex gelandet wäre.
    const pool = makePool('keine');
    const result = await classifierNode(
      buildState('Welche Bahnen fahren eigentlich elektrisch?', pool)
    );
    expect(pool.resolverCalls).toHaveLength(1);
    expect(pool.bigPromptCalls).toHaveLength(0);
    expect(result.intent).toBe('agentic');
  });

  it('gibt auch ein unlesbares Verdikt in den Loop zurück', async () => {
    // `null` heisst „nichts entschieden", und das hiess bis zum Löschen der
    // LLM-Stufe „geh eine Stufe weiter". Diese Stufe gibt es nicht mehr, also
    // gilt dieselbe Regel wie für `keine`: der Turn geht dorthin, wo er ohne den
    // Regex hingegangen wäre. Alles andere machte aus einem Provider-Aussetzer
    // eine werkzeuglose Antwort auf eine Fahrplanfrage.
    const pool = makePool('¯\\_(ツ)_/¯');
    const result = await classifierNode(buildState('Wann fährt der nächste Zug nach Köln?', pool));
    expect(pool.resolverCalls).toHaveLength(1);
    expect(pool.bigPromptCalls).toHaveLength(0);
    expect(result.intent).toBe('agentic');
  });

  it('lässt Umlaut-Anfänge überhaupt matchen', async () => {
    // Regressionsanker für den Grund, warum die Grenzen `\p{L}` sind: mit `\b`
    // und ohne `u`-Flag konnte keine Alternative feuern, die mit einem Umlaut
    // beginnt — " übernachten" hat zwischen Leerzeichen und "ü" keine
    // Wortgrenze, weil beide keine `\w` sind.
    expect(SYSTEM_MCP_PHRASING.test('Wo kann ich übernachten?')).toBe(true);
    expect(SYSTEM_MCP_PHRASING.test('Ich suche eine Übernachtung')).toBe(true);
    expect(SYSTEM_MCP_PHRASING.test('Gibt es Übernachtungsmöglichkeiten?')).toBe(true);
    // Und die Politik-Grenze hält trotzdem.
    expect(SYSTEM_MCP_PHRASING.test('Was fordern die Grünen zur Bahnreform?')).toBe(false);
    expect(SYSTEM_MCP_PHRASING.test('Debatte über Wetterextreme')).toBe(false);
  });
});
