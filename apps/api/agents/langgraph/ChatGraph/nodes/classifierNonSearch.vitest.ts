import { describe, it, expect, vi } from 'vitest';

/**
 * `NON_SEARCH_INTENTS` ist die Politik des Heuristik-Tisches: „für dieses
 * Verdikt wird nichts abgerufen, also auch keine Suchanfrage optimiert und kein
 * Mehr-Themen-Abschlag bezahlt".
 *
 * `summary` stand nicht drin, obwohl der Tisch es vergibt — und der Abschlag
 * WIRKT dort, weil `summary` mit 0,85 genau auf der Schwelle sitzt: eine
 * Zusammenfassung mit zwei Gliedern („… und nenne …") verlor 0,30 und fiel
 * damit an der Tier-3-Rückgabe vorbei. Was danach kam, ist nicht dasselbe
 * Verdikt auf Umwegen: Tier 3.8 bekommt den Turn zu sehen und darf ihn in ein
 * Artefakt oder in `produktion` umdeuten — für eine Zusammenfassung ein
 * Modellaufruf, den die Heuristik längst entschieden hatte.
 *
 * `social_post` steht aus demselben Grund mit drin, ist aber messbar
 * wirkungslos: 0,80 liegt ohnehin unter der Schwelle, der Abschlag ändert dort
 * keinen Ausgang. Es ist damit ein Mitglied der Sorte, die der Kopfkommentar
 * der Menge schon kennt — harmlos, aber es macht die Menge vollständig.
 */

const executeProvider = vi.fn(async () => ({ content: 'keine' }));
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { classifierNode } = await import('./classifierNode.js');
const { heuristicClassify, HEURISTIC_CONFIDENCE_THRESHOLD } =
  await import('./classifierHeuristics.js');
const { looksMultiTopic } = await import('./classifierHeuristics.js');

import type { ChatGraphState, SearchIntent } from '../types.js';

const STUB_AGENT_CONFIG = {
  identifier: 'gruenerator-universal',
  name: 'Test Agent',
  systemPrompt: 'Du bist ein Assistent.',
  allowedCollections: null,
  description: '',
  avatar: '',
  backgroundColor: '',
  slug: 'test',
  isSystemDefault: true,
};

function buildState(userMessage: string): ChatGraphState {
  return {
    messages: [{ role: 'user' as const, content: userMessage }],
    threadId: null,
    agentConfig: STUB_AGENT_CONFIG,
    enabledTools: { search: true, web: true, examples: true, research: true },
    userLocale: 'de-DE',
    attachmentContext: null,
    imageAttachments: [],
    threadAttachments: [],
    notebookIds: [],
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    defaultNotebookCollectionIds: [],
    documentIds: [],
    documentChatIds: [],
    boardIds: [],
    boardContext: null,
    sheetIds: [],
    sheetContext: null,
    docMentionIds: [],
    documentMentionContext: null,
    currentDocument: null,
    customSystemPrompt: null,
    userInstructions: null,
    memoryContext: null,
    memoryRetrieveTimeMs: 0,
    chatHistoryContext: null,
    isCompound: false,
    gatherSources: [],
    intent: 'direct' as SearchIntent,
    secondaryIntent: null,
    searchSources: [],
    searchQuery: null,
    subQueries: null,
    reasoning: '',
    hasTemporal: false,
    complexity: 'moderate' as const,
    contentType: null,
    documentSubtype: null,
    platform: null,
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,
    researchBrief: null,
    researchMeta: null,
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,
    imagePrompt: null,
    imageStyle: null,
    imageEditStyle: null,
    generatedImage: null,
    imageTimeMs: 0,
    summaryContext: null,
    summaryTimeMs: 0,
    chartData: null,
    responseText: '',
    streamingStarted: false,
    contextWindowTokens: 128000,
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
    responseTimeMs: 0,
    error: null,
  } as unknown as ChatGraphState;
}

/**
 * Zwei Glieder, beide substanziell — genau das, was `looksMultiTopic` sucht.
 *
 * Der Verlaufsbezug („hier im Chat") ist nicht Zierde: ohne Material stuft eine
 * eigene Regel jedes `summary` auf `web` zurück, und die beiden Materialquellen,
 * die es gäbe, kürzen den Turn schon in Tier 1 ab (`attachmentContext` →
 * `produktion`, `documentIds` → `search`). Die Zusammenfassung DIESES Gesprächs
 * ist die dokumentlose Ausnahme, die jene Regel selbst benennt — also der einzige
 * Aufbau, in dem der Mehr-Themen-Abschlag allein gemessen werden kann.
 */
const MULTI_TOPIC_SUMMARY =
  'Fass unser Gespräch hier im Chat zusammen und nenne die wichtigsten offenen Punkte';

describe('NON_SEARCH_INTENTS — der Mehr-Themen-Abschlag gilt nur für Abrufe', () => {
  it('der Aufbau stimmt: mehrgliedrig und ein Heuristik-Verdikt auf der Schwelle', () => {
    // Ohne diese zwei Zusicherungen könnte der Test unten grün werden, weil das
    // Beispiel den Abschlag gar nicht auslöst.
    expect(looksMultiTopic(MULTI_TOPIC_SUMMARY)).toBe(true);
    const heuristic = heuristicClassify(MULTI_TOPIC_SUMMARY);
    expect(heuristic.intent).toBe('summary');
    expect(heuristic.confidence).toBeGreaterThanOrEqual(HEURISTIC_CONFIDENCE_THRESHOLD);
  });

  it('eine mehrgliedrige Zusammenfassung bleibt an der Heuristik-Rückgabe', async () => {
    const result = await classifierNode(buildState(MULTI_TOPIC_SUMMARY));

    expect(result.intent).toBe('summary');
    // Die Tier-3-Rückgabe ist die einzige, die ihre Begründung so schreibt —
    // sie zu prüfen unterscheidet „richtiges Verdikt" von „richtiges Verdikt
    // auf dem teuren Umweg".
    expect(result.reasoning).toMatch(/heuristic, confidence/);
    expect(executeProvider).not.toHaveBeenCalled();
  });
});
