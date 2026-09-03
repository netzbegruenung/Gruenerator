/**
 * ChatGraph — state initialisation for the chat pipeline.
 *
 * This file used to also define a compiled LangGraph (`chatGraph`), its state
 * annotation and its routing functions. All of it was dead: `chatGraph.invoke()`
 * had ZERO production callers, because the routers hand-sequence the node
 * functions themselves (see `routes/chat/chatGraphContractRouter.ts` and
 * `routes/chat/services/intentExecutionService.ts`).
 *
 * The proof it never ran: its `ChatStateAnnotation` had drifted ~25 fields
 * behind the live `ChatGraphState` in `./types.ts`. Had the graph executed, it
 * would have dropped those fields at every transition.
 *
 * What remains is the part the live code actually uses: `initializeChatState`,
 * consumed by `routes/chat/services/streamContext.ts` and
 * `routes/boards/agentFlow/generate.ts`. It now returns `ChatGraphState`
 * directly instead of the annotation-derived type.
 */

import { resolveSkillMention } from '@gruenerator/shared/agents';

import {
  isNotebookImplicitlySearchable,
  isUserNotebookId,
  resolveNotebookCollections,
  resolveUserNotebookDocumentIds,
} from '../../../config/notebookCollectionMap.js';
import {
  getAgent,
  getAgentForUser,
  getDefaultAgentId,
} from '../../../routes/chat/agents/agentLoader.js';
import { createLogger } from '../../../utils/logger.js';

import type { ChatGraphInput, ChatGraphState, SearchIntent } from './types.js';

const log = createLogger('ChatGraph');

export async function initializeChatState(input: ChatGraphInput): Promise<ChatGraphState> {
  const agentId = input.agentId || getDefaultAgentId();
  // User-created agents (`user_agents`) and custom-generator agents (`cg-*`) are
  // keyed by userId, so resolve through the user-aware loader when we have one.
  // Without a userId (tests, non-HTTP callers) only system agents resolve.
  let agentConfig = input.userId
    ? await getAgentForUser(agentId, input.userId)
    : await getAgent(agentId);

  if (!agentConfig) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  // Skill mentions carry the identifier of their owning agent (e.g.
  // /presse-berlin → gruenerator-oeffentlichkeitsarbeit-berlin). On the
  // default agent, adopt that agent's scoping (defaultFilter +
  // toolRestrictions) so search_documents and pressemitteilung_examples are
  // pinned to the matching Landesverband. The skill body carries the voice;
  // model, provider and systemRole of the active agent stay untouched, and an
  // explicitly selected non-default agent always wins.
  if (input.activeSkillMention && agentId === getDefaultAgentId()) {
    const skillAgentId = resolveSkillMention(input.activeSkillMention);
    if (skillAgentId && skillAgentId !== agentConfig.identifier) {
      const skillAgent = await getAgent(skillAgentId);
      if (skillAgent && (skillAgent.defaultFilter != null || skillAgent.toolRestrictions != null)) {
        agentConfig = {
          ...agentConfig,
          ...(skillAgent.defaultFilter != null && { defaultFilter: skillAgent.defaultFilter }),
          ...(skillAgent.toolRestrictions != null && {
            toolRestrictions: skillAgent.toolRestrictions,
          }),
        };
        log.info(
          `[ChatGraph] Skill ${input.activeSkillMention} adopted scoping from agent ${skillAgentId}`
        );
      }
    }
  }

  // [agent-trace] Prove what the backend actually resolved for this turn — the
  // running shared package can be stale (dist vs source), so log the resolved
  // identifier alongside the LV-relevant config that drives PM/example scoping.
  log.info(
    `[ChatGraph][agent-trace] requested="${input.agentId ?? '(none)'}" resolved="${agentConfig.identifier}" ` +
      `systemRole=${agentConfig.systemRole ? `${agentConfig.systemRole.length}chars "${agentConfig.systemRole.slice(0, 60).replace(/\s+/g, ' ')}…"` : 'MISSING'} ` +
      `defaultFilter=${JSON.stringify(agentConfig.defaultFilter ?? null)} ` +
      `examplesLvScope=${JSON.stringify(agentConfig.toolRestrictions?.examplesLvScope ?? null)}`
  );

  // Default notebook scoping: the agent's bound notebooks (server-authoritative,
  // read from the loaded agent record) UNIONed with the user's single composer
  // pick (`input.defaultNotebookId`, always a system slug here — user-UUID picks
  // arrive pre-resolved as `defaultNotebookDocumentIds` from streamContext).
  // System slugs → collections; user-UUID notebooks → ownership-checked doc IDs.
  // @notebook mentions (`notebookCollectionIds`) still hard-override these downstream.
  // Both halves are *default* scoping: they widen every turn without the turn
  // having asked, so they go through the implicit gate. A notebook this instance
  // hides therefore never becomes an ambient source — only an explicit @mention
  // (see `streamContext.ts`) can still reach it.
  const agentNotebookIds = agentConfig.defaultNotebookIds ?? [];
  const defaultNotebookSlugs = [
    ...agentNotebookIds.filter(isNotebookImplicitlySearchable),
    ...(input.defaultNotebookId && isNotebookImplicitlySearchable(input.defaultNotebookId)
      ? [input.defaultNotebookId]
      : []),
  ];
  const agentUserNotebookUuids = agentNotebookIds.filter(isUserNotebookId);
  const agentNotebookDocumentIds =
    agentUserNotebookUuids.length > 0 && input.userId
      ? (await resolveUserNotebookDocumentIds(input.userId, agentUserNotebookUuids)).documentIds
      : [];

  return {
    // Input
    messages: input.messages,
    threadId: input.threadId || null,
    agentConfig,
    enabledTools: input.enabledTools || {
      search: true,
      web: true,
      person: true,
      examples: true,
      research: true,
      image: true,
    },
    userLocale: input.userLocale || 'de-DE',
    clientPlatform: input.clientPlatform || 'web',
    lastToolContext: null,

    // Attachment context
    attachmentContext: input.attachmentContext || null,
    imageAttachments: input.imageAttachments || [],
    threadAttachments: input.threadAttachments || [],
    hasTabularAttachment: input.hasTabularAttachment ?? false,
    cloudConnectionCount: input.cloudConnectionCount ?? 0,
    pdfFormAttachments: input.pdfFormAttachments || [],
    clientCanRunPython: input.clientCanRunPython ?? false,

    // Notebook scoping
    notebookIds: input.notebookIds || [],
    notebookCollectionIds: input.notebookIds ? resolveNotebookCollections(input.notebookIds) : [],
    notebookDocumentIds: input.notebookDocumentIds ?? [],

    // Default notebook scoping: agent's bound notebooks + composer pick (above).
    defaultNotebookCollectionIds: resolveNotebookCollections(defaultNotebookSlugs),
    defaultNotebookDocumentIds: [
      ...new Set([...(input.defaultNotebookDocumentIds ?? []), ...agentNotebookDocumentIds]),
    ],

    // Document scoping (from @datei mentions)
    documentIds: input.documentIds || [],

    // Document chat scoping (from @dokumentchat multi-select)
    documentChatIds: input.documentChatIds || [],
    documentChatLabels: input.documentChatLabels ?? {},

    // Board context (from @board mentions, populated by controller)
    boardIds: input.boardIds || [],
    boardContext: null,

    // Sheet context (from @sheet mentions, populated by controller)
    sheetIds: input.sheetIds || [],
    sheetContext: null,
    sheetEditId: null,

    // Collaborative document context (from @doc mentions, populated by controller)
    docMentionIds: input.docMentionIds || [],
    documentMentionContext: null,

    // Vom Router gesetzt, wenn dieser Turn einem Pipeline-Agenten gehört.
    pipelineSourceText: null,

    // Wolke (Nextcloud) file refs (from @wolke mentionable, validated by controller)
    wolkeFiles: input.wolkeFiles || [],

    // Connected-account (Nango) file refs (from @connect mentionable)
    connectFiles: input.connectFiles || [],

    // URLs attached via @link mentionable (unioned into detectedUrls by classifier)
    attachedWebpageUrls: input.attachedWebpageUrls || [],

    // Current open document (docs editor surface)
    currentDocument: input.currentDocument || null,

    // Live board (boards editor surface)
    currentBoard: input.currentBoard || null,

    // Custom system prompt (from thread or user settings)
    customSystemPrompt: input.customSystemPrompt || null,
    roleBausteinActive: input.roleBausteinActive === true,
    userRoles: input.userRoles ?? [],

    // Active skill (drives platform-specific prompt fragment in respondNode)
    activeSkillMention: input.activeSkillMention || null,

    // User profile instructions (from profiles.custom_prompt)
    userInstructions: input.userInstructions || null,

    // Memory context (will be set by controller before graph execution)
    memoryContext: null,
    memories: null,
    memoryEnabled: false,
    memoryRetrieveTimeMs: 0,

    // Chat history context (will be set by controller when classifier detects past conversation reference)
    chatHistoryContext: null,

    // Compound query detection (will be set by classifier node)
    isCompound: false,
    gatherSources: [],

    // Multi-document chat (will be set by classifier node)
    documentSources: [],
    perSourceResults: {},
    synthesisMode: null,

    // Classification (will be set by classifier node).
    // Stays `direct` and does NOT follow the residual to `agentic`: this is the
    // value a turn carries if classification never ran at all, and the inert
    // no-tool verdict is the right thing to fail into. `agentic` here would put
    // an unclassified turn into the tool loop.
    intent: 'direct' as SearchIntent,
    secondaryIntent: null,
    searchSources: [],
    searchQuery: null,
    subQueries: null,
    detectedUrls: [],
    reasoning: '',
    hasTemporal: false,
    complexity: 'moderate' as const,
    explicitDeepRequest: false,
    contentType: null,
    documentSubtype: null,
    targetGroupName: null,
    creationTopic: null,
    needsClarification: false,
    clarificationQuestion: null,
    clarificationOptions: null,
    detectedFilters: null,

    // Research brief (will be set by briefGenerator node for complex research)
    researchBrief: null,
    examplesResult: null,

    // Search results (will be set by search node)
    searchResults: [],
    citations: [],
    searchCount: 0,
    maxSearches: 2,

    // Quality gate
    qualityScore: 0,
    qualityAssessmentTimeMs: 0,

    // Reliability flags & structured error log
    searchErrors: [],
    degradationNotes: [],
    briefGenerationFailed: false,
    rerankFailed: false,
    topRerankScore: null,

    // Image generation (will be set by image node)
    imagePrompt: null,
    imageStyle: null,
    imageEditStyle: null,
    generatedImage: null,
    imageTimeMs: 0,
    imageEditDescriptions: null,

    // Document summarization (will be set by summarizeNode)
    summaryContext: null,
    summaryTimeMs: 0,

    // Chart generation (will be set by chart node)
    chartData: null,

    // Deterministic computation: seeded from a client-side spreadsheet result
    // when present (follow-up turns), otherwise set by computeNode.
    computedResult: input.computedResult ?? null,
    computedResultTimeMs: 0,

    // Response (will be set by respond node)
    responseText: '',
    streamingStarted: false,

    // Context window awareness
    contextWindowTokens: input.contextWindowTokens || 128000,

    // Metadata
    startTime: Date.now(),
    classificationTimeMs: 0,
    searchTimeMs: 0,
    rerankTimeMs: 0,
    searchedCollections: [],
    responseTimeMs: 0,
    error: null,
  };
}
