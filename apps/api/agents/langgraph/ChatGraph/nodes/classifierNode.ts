/**
 * Classifier Node
 *
 * Analyzes user messages to determine the appropriate search intent.
 * This is the entry point of the ChatGraph that routes to search or direct response.
 *
 * Every tier is deterministic or answers ONE closed question; there is no tier
 * that re-derives the tool catalogue:
 *   Tier 1/2:   Mutation and context intents (open surfaces, @-mentions, files)
 *   Tier 2.7:   Follow-up on one of the thread's artifacts
 *   Tier 2.9/95 Docs help; "Grafik" disambiguation
 *   Tier 3:     Heuristic rule table (high confidence decides outright)
 *   Tier 3.4:   Gated specials (chat recall, recurring order)
 *   Tier 3.5:   Loop demotion — the DEFAULT for anything retrieval-shaped
 *   Tier 3.7/8: Small resolvers, one question each (live source, generation)
 *   Residual:   The rule table's own verdict, named for what it is
 */

import { type ChatIntentId, degradeTargetForLocale } from '@gruenerator/shared/chat-intents';
import { isCloudShareUrl } from '@gruenerator/shared/utils';

import { isAgenticLoopEnabled } from '../../../../routes/chat/services/agenticLoop/flags.js';
import {
  looksLikeSelfContainedTurn,
  looksLikeToolableQuestion,
  looksLikeUnsourcedWritingOrder,
} from '../../../../routes/chat/services/agenticLoop/routing.js';
import { isSharepicEditInstruction } from '../../../../routes/chat/services/sharepicEditHeuristics.js';
import { containsInstructionMarkers } from '../../../../routes/chat/services/untrustedContent.js';
import { escapeRegExp } from '../../../../services/BaseSearchService/textUtils.js';
import {
  McpServerRegistry,
  type McpClassifierServer,
} from '../../../../services/mcp/McpServerRegistry.js';
import { isExplicitDeepRequest } from '../../../../services/search/searchDepth.js';
import { analyzeTemporality } from '../../../../services/search/TemporalAnalyzer.js';
import { recordDecision } from '../../../../utils/decisionJournal.js';
import { createLogger } from '../../../../utils/logger.js';

import { getActiveAnchors } from './anchorContext.js';
import {
  buildDocumentSources,
  hasCompareVerbs,
  pickSynthesisMode,
} from './buildDocumentSources.js';
import { heuristicExtractFilters } from './classifierFilters.js';
import {
  heuristicClassify,
  extractSearchTopic,
  extractMessageText,
  crawlableUrls,
  extractDomainScope,
  wantsImageResults,
  formatConversationHistory,
  hasImageEditVerb,
  isImageRegenRequest,
  isImageEditInstruction,
  mentionsImageNoun,
  looksMultiTopic,
  BOARD_MODIFY_PATTERN,
  DOC_MODIFY_PATTERN,
  HEURISTIC_CONFIDENCE_THRESHOLD,
  nounNearCreateVerb,
  NOUN_TRIGGER_MAX_LENGTH,
  SOCIAL_BARE_NOUN_PATTERN,
  SOCIAL_META_QUESTION_PATTERN,
  POST_NOUN_PATTERN,
  isAmbiguousGraphicRequest,
} from './classifierHeuristics.js';
import {
  carriesPastedBody,
  detectComplexity,
  detectDocumentSubtype,
  detectSearchSources,
  CHAT_HISTORY_DIRECT,
  CHAT_HISTORY_KEYWORDS,
  CURRENT_THREAD_REFERENCE,
  DEMOTABLE_HEURISTIC_INTENTS,
  NON_SEARCH_INTENTS,
  NO_RETRIEVAL_VERDICTS,
  looksLikeDocsHelpQuestion,
  looksLikeRecurringOrder,
} from './classifierSignals.js';
import { classifyDocsIntentTiebreak } from './docsIntentTiebreak.js';
import { resolveEditTarget } from './editTargetResolver.js';
import {
  ARTIFACT_NOUN_BY_KIND,
  asksForChatDeliverable,
  forbidsPersistentAction,
  hasExplicitSharepicWord,
  isNegatedArtifactRequest,
  stripQuotedSpans,
  type ForbiddableArtifact,
} from './fastPathGuards.js';
import { GENERATION_SIGNAL, resolveGenerationScope } from './generationResolver.js';
import { refineSearchQuery } from './queryRefineResolver.js';
import { parseRelativeDateRange } from './relativeDates.js';

import type { ChatGraphState, GatherSource, SearchIntent } from '../types.js';

const log = createLogger('ChatGraph:Classifier');

/**
 * Verdicts the compare upgrade may rewrite when ≥2 doc sources meet a compare
 * verb. Other intents (image, summary, modify_doc, ...) are user-driven and
 * must not be silently rerouted.
 *
 * Consumer policy, not an intent property — and at module scope because it was
 * being rebuilt on every classification call.
 */
const COMPARE_UPGRADEABLE: ReadonlySet<ChatIntentId> = new Set([
  'search',
  'research',
] as const satisfies readonly ChatIntentId[]);

// Content-creation agent (öffentlichkeitsarbeit) routing heuristics.
// Module-scope so V8 doesn't recompile per classification call. Hoisted out
// of the override block where they were originally inlined.
const PM_NOUN_PATTERN =
  /\b(pressemitteilung|pressemeldung|pm|presseaussendung|presse[-\s]?statement)\b/i;
const SOCIAL_NOUN_PATTERN =
  /\b(post|tweet|tweete|tweeten|posting|reel|tiktok|instagram|facebook|linkedin|twitter|social[-\s]?media)\b/i;

/**
 * Public classifier node — wraps the inner implementation with multi-document
 * normalization. Builds documentSources and picks synthesisMode based on the
 * classified intent + doc count, and upgrades search/research → 'compare' when
 * the user explicitly asks for a comparison and ≥2 doc sources are referenced.
 *
 * Kept as a wrapper so the inner classifier's many return paths stay focused
 * on intent/query/filters and don't each have to remember the doc-source plumbing.
 */
// Conservative prose routing for connected MCP servers: fire only when the
// message both names a connected service AND carries an imperative action shape,
// so statements ("Ich finde Notion super") never trigger a write-capable tool
// loop. Deliberately excludes opinion-/question-prone stems (finde, frag, welche)
// that read as commentary rather than a command.
const MCP_ACTION_PATTERN =
  /(?<![\p{L}])(erstell\w*|leg\w*|f(?:ü|ue)g\w*|hinzu|aktualisier\w*|(?:ä|ae)nder\w*|l(?:ö|oe)sch\w*|entfern\w*|hol\w*|zeig\w*|list\w*|such\w*|send\w*|schick\w*|abruf\w*|abfrag\w*|(?:ö|oe)ffn\w*|starte?|wie\s+viele?|gib\s+mir)/iu;

// A vague follow-up that CONTINUES the thread's last MCP connector task. The
// Tier-2.7 mcp branch re-scopes such a turn to that server (an @mention is
// stripped on send, so "denk dir was aus" / "versuchs nochmal" carry no textual
// trace). Anaphoric markers, OR bare "das"/"es" ONLY at a clause end (anaphora,
// e.g. "wo ist das?" — but NOT the article in "erkläre mir das Grundeinkommen").
const MCP_CONTINUATION_REFERENTIAL =
  /\b(dazu|davon|damit|daran|dahin|nochmal|noch\s?mal|nochmals|erneut|via\s+mcp|(?:ü|ue)ber\s+mcp|per\s+mcp)\b|\b(?:das|es)\b(?=\s*[?.!,]|\s*$)/iu;
// A NEW knowledge question / topic switch or a first-person comment — the shape
// of a message that ISN'T a connector-task instruction, so the imperative-
// continuation heuristic must NOT re-scope it to the last MCP server.
const NON_CONTINUATION_START =
  /^\s*(und\s+)?(was|wer|wie|warum|weshalb|wieso|wo|wann|welche\w*|wieviel\w*|wozu|wof(?:ü|ue)r|erkl(?:ä|ae)r\w*|ich|wir|mir|mich|mein\w*|unser\w*)\b/iu;
// Pure acknowledgement / greeting — not a task instruction either.
const MCP_CHITCHAT_ONLY =
  /^\s*(danke\w*|hallo|hi|hey|servus|moin|ok(?:ay)?|super|top|passt|cool|perfekt|nice|gut|prima|jo|ja|nein|n(?:ö|oe))\b[\s!.]*$/iu;
// Names of OUR OWN artifacts — a follow-up creating one of these is a different
// intent, not an MCP continuation, so it must NOT be hijacked to the connector.
const OWN_ARTIFACT_NOUN =
  /\b(sharepic|share-pic|bild|bilder|grafik|foto|pr(?:ä|ae)sentation|presentation|folien|slides?|tabelle|spreadsheet|kalkulation|dokument|board|reel|video|newsletter)\b/iu;

/**
 * Returns the id of the single connected server named in the message, or null.
 * Word-boundary match on the server name (so "Brevo-Kampagne" matches "Brevo");
 * the caller gates on MCP_ACTION_PATTERN. Ambiguous (≥2 named) → null.
 */
function matchMcpServerByName(userContent: string, servers: McpClassifierServer[]): string | null {
  const hits = servers.filter((srv) => {
    const name = srv.name.trim();
    if (name.length < 3) return false;
    return new RegExp(`(?<![\\p{L}])${escapeRegExp(name)}(?![\\p{L}])`, 'iu').test(userContent);
  });
  return hits.length === 1 ? hits[0]!.id : null;
}

export async function classifierNode(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const result = await classifierNodeImpl(state);

  const documentSources = buildDocumentSources({
    documentIds: state.documentIds ?? [],
    documentChatIds: state.documentChatIds ?? [],
    docMentionIds: state.docMentionIds ?? [],
    notebookIds: state.notebookIds ?? [],
    wolkeFiles: state.wolkeFiles ?? [],
    connectFiles: state.connectFiles ?? [],
    threadAttachments: state.threadAttachments ?? [],
    currentDocument: state.currentDocument ?? null,
    documentChatLabels: state.documentChatLabels ?? {},
  });

  // Upgrade search/research → 'compare' when the user explicitly asks for a
  // comparison and ≥2 doc sources are in play (see COMPARE_UPGRADEABLE).
  const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
  const userText = extractMessageText(lastUserMessage?.content);
  let intent = result.intent ?? state.intent;
  if (
    intent &&
    COMPARE_UPGRADEABLE.has(intent) &&
    documentSources.length >= 2 &&
    hasCompareVerbs(userText)
  ) {
    log.info(
      `[Classifier] Compare upgrade: ${intent} → compare (${documentSources.length} doc sources, compare verbs detected)`
    );
    intent = 'compare';
  }

  // Conservative MCP guard: the LLM tier can return `mcp` but can't name a
  // concrete connected server. Only the deterministic name-match tier (which
  // sets mcpServerScope) or an explicit @notion/@brevo mention (resolved later
  // in the router) may run the write-capable tool loop. An unscoped prose `mcp`
  // would risk acting on the wrong server, so downgrade it to direct — UNLESS
  // this thread's last substantive turn worked with a CONCRETE MCP server
  // (ThreadToolContext.ref set): then the loop re-scopes to that same server
  // via the sticky last_mcp_server_id. Deliberately do NOT write the ref into
  // mcpServerScope — that field means "user-explicit this turn" downstream
  // (stale-server honesty notice + retry-unscoped guard key off it).
  if (intent === 'mcp' && !result.mcpServerScope) {
    if (state.lastToolContext?.kind === 'mcp' && state.lastToolContext.ref) {
      log.info('[Classifier] Unscoped mcp intent kept — thread recently used an MCP server');
    } else {
      log.info('[Classifier] Unscoped prose mcp intent downgraded to agentic (no server named)');
      intent = 'agentic';
    }
  }

  // Downgrades to `web` must carry a query: system intents sit in
  // NON_SEARCH_INTENTS, so the parse nulled searchQuery — an un-backfilled
  // downgrade would run the web search on the empty string.
  let downgradedSearchQuery: string | null = null;

  // Pasted/attached URLs are resolved HERE, above the summary demotion, because
  // a link is material: "<url> zusammenfassen" used to be demoted to `web` (the
  // demotion only looked for documents) and then searched the web for the bare
  // verb "zusammenfassen".
  // Agent must allow scraping (whitelist holds 'scrape'; one agent uses the tool
  // name 'scrape_url') and the user must not have toggled it off in the composer.
  const scrapeWhitelist = state.agentConfig?.enabledTools;
  const agentAllowsScrape =
    !scrapeWhitelist ||
    scrapeWhitelist.includes('scrape') ||
    scrapeWhitelist.includes('scrape_url');
  const scrapeEnabled = agentAllowsScrape && state.enabledTools?.['scrape'] !== false;
  // @link-attached URLs are explicit user intent — union them with auto-detected
  // ones (deduped, attached first so they rank highest in scrape_url).
  // Auch die ausdrücklich angehängten: ein Wolke-Freigabe-Link liefert beim
  // Crawlen die SPA-Hülle, egal ob er getippt oder über @link angehängt wurde.
  const attachedUrls = scrapeEnabled
    ? (state.attachedWebpageUrls ?? []).filter((url) => !isCloudShareUrl(url))
    : [];
  const detectedUrls = scrapeEnabled
    ? [...new Set([...attachedUrls, ...crawlableUrls(userText)])]
    : [];

  // `summary` is not a wording, it is a STATE: material is already here, so skip
  // the search node (ChatGraph routes it straight to respond), drop the product
  // persona and use the cheap lane. Tier 2 derives it correctly — it fires only
  // with documents attached. The LLM tier derives it from the word "zusammen"
  // and cannot see whether anything is actually attached.
  //
  // Live: "Fass den aktuellen Stand der Debatte um das Klimageld zusammen" was
  // routed to `summary` with nothing to read, and answered with a confident,
  // fluent, entirely source-free essay — zero citations, zero tool calls. A
  // summary of nothing is the most convincing kind of invention.
  //
  // The exception the Tier-2 comment already names: a summary of THIS
  // conversation legitimately has no documents — the history is in context.
  //
  // "Material" is deliberately WIDER than documentSources: an uploaded file
  // arrives as extracted text in `attachmentContext` and has no document row at
  // all. Reading it too narrowly downgraded "fasse die Datei zusammen" — with
  // the file right there — to a web search. Err toward keeping `summary`: a
  // false keep is the old behaviour, a false downgrade breaks a working feature.
  //
  // `carriesPastedBody` ist derselbe Satz für den Fall, in dem das Material gar
  // keinen Anhang hat, weil es EINGEFÜGT wurde. Ohne ihn wird der eingefügte
  // Text selbst zur Web-Suchanfrage (`downgradedSearchQuery = userText`) — im
  // Sicherheits-Korpus die Bürgeranfrage samt ihrer Injektions-Nutzlast.
  const hasMaterialToSummarise =
    documentSources.length > 0 ||
    !!state.attachmentContext ||
    (state.imageAttachments?.length ?? 0) > 0 ||
    (state.pdfFormAttachments?.length ?? 0) > 0 ||
    carriesPastedBody(userText);
  if (intent === 'summary' && !hasMaterialToSummarise && !CURRENT_THREAD_REFERENCE.test(userText)) {
    if (detectedUrls.length > 0) {
      // The page IS the material. Not `summary` (that intent skips the search
      // node, so the link would never be fetched) and not `web` (searching for
      // "zusammenfassen" returns dictionary entries and summariser tools —
      // observed live). scrape_url crawls it and respond summarises the result.
      log.info('[Classifier] summary without documents but with URL(s) → scrape_url');
      intent = 'scrape_url';
    } else {
      log.info('[Classifier] summary without any document source → web (nothing to summarise)');
      intent = 'web';
    }
    downgradedSearchQuery = userText;
  }

  // GELÖSCHT: der Nach-LLM-Guard `image_edit → sharepic`.
  //
  // Er korrigierte genau eine Quelle — die LLM-Stufe, die für "Mach den Text
  // größer" nach einem Sharepic `image_edit` antwortete, während ihre eigene
  // Begründung das Sharepic benannte. Mit der Stufe verschwindet die Quelle:
  // beide verbleibenden `image_edit`-Türen (Tier 1, Tier 2.7) verlangen einen
  // Bildanhang, ein Bild-Substantiv oder einen `image`-Kontext, und der Guard
  // schloss alle drei aus. Er kann also nicht mehr feuern.
  //
  // Einen Guard „für alle Fälle" stehenzulassen ist genau die Bauform, die uns
  // schon vier grüne Tests ohne Aussage gekostet hat: er sichert nichts mehr,
  // aber er sieht aus, als täte er es. Die Formulierungen, die ihn brauchten,
  // beansprucht jetzt Tier 2.7 deterministisch — dafür kennen die Edit-Muster
  // seit diesem PR auch ERGÄNZENDE Verben.

  // A source that does not cover the user's country is never routed to — the
  // question degrades (normally to web search) so it still gets answered
  // instead of returning empty data.
  //
  // Which intents those are, and where each degrades to, is declared once in
  // the intent registry (`audience` / `degradeTo`). Before, this was three
  // separate hand-written `=== 'de-AT'` blocks: one for abgeordnetenwatch, one
  // for bundestag, one for the DE-only system sources — in two different places
  // in this file, and only the last of them carried the search query over.
  //
  // Carrying `userText` over now applies to all of them. A degraded turn keeps
  // whatever query the classifier produced (see the guard at the return); this
  // only fills the gap where it produced none, which is the same reason the
  // router backfills a query for forced search intents.
  if (intent) {
    const degraded = degradeTargetForLocale(intent, state.userLocale);
    if (degraded) {
      log.info(
        `[Classifier] ${intent} downgraded to ${degraded} for ${state.userLocale ?? 'de-DE'} ` +
          `(source does not cover this country)`
      );
      intent = degraded;
      if (degraded === 'web') downgradedSearchQuery = userText;
    }
  }

  // The env-availability degrade for the five system-MCP intents stood here. It
  // has lost its subject: those intents are no longer produced, and the
  // connectors that replaced them are filtered at the MOUNT — an unconfigured,
  // country-excluded or switched-off connector is simply absent from
  // `getManagedConnectors()`, so there is no verdict left to walk back.

  // ── URL context: pasted link(s) → additive scrape_url step ──
  // When the active agent has scraping enabled and the message contains URL(s),
  // crawl them so the page content becomes context. Additive, not exclusive:
  // a pure link paste (or a creative task whose only "search" is the link) takes
  // the scrape_url slot directly; otherwise it rides as the secondary intent so
  // "schreib einen Tweet zu <url>" both crawls the page AND drafts the tweet.
  let secondaryIntent = result.secondaryIntent ?? null;
  if (detectedUrls.length > 0) {
    if (!intent || NO_RETRIEVAL_VERDICTS.has(intent)) {
      intent = 'scrape_url';
    } else if (!secondaryIntent && intent !== 'scrape_url' && intent !== 'agentic') {
      // 'agentic' turns keep secondary null: the loop has its own scrape_url
      // tool, and a secondary would kick the turn out of the loop (routing.ts).
      secondaryIntent = 'scrape_url';
    }
    log.info(
      `[Classifier] Detected ${detectedUrls.length} URL(s) → scrape_url (intent=${intent}, secondary=${secondaryIntent ?? 'none'})`
    );
  }

  // "such auf zeit.de und orf.at nach X" — a search RESTRICTION, not a page to
  // read, and until now it had no way into the engine at all: bare domains stayed
  // words in the query string, where they narrowed nothing. Deterministic, so the
  // classifier's JSON schema does not grow — every field there costs prompt budget
  // and measurably drags on intent accuracy.
  //
  // `extractDomainScope` drops any domain that also appears as a full URL, so this
  // cannot steal a `scrape_url` turn: a URL with a path is a read instruction, a
  // bare domain is a scope. Both in one message is allowed and each keeps its role.
  const webSiteScope = extractDomainScope(userText);
  const hasSiteScope = webSiteScope.include.length > 0 || webSiteScope.exclude.length > 0;
  if (hasSiteScope) {
    log.info(
      `[Classifier] Site scope: include=[${webSiteScope.include.join(',')}] exclude=[${webSiteScope.exclude.join(',')}]`
    );
  }

  // A question about THIS conversation needs no retrieval — the messages are in
  // context already. Routing it to chat_history sent it through a Qdrant recall
  // over PAST threads, which returned nothing, and the turn then reported having
  // no sources for an answer that stood a few messages above.
  if (intent === 'chat_history' && CURRENT_THREAD_REFERENCE.test(userText)) {
    const hasPastReference = CHAT_HISTORY_KEYWORDS.test(userText);
    if (!hasPastReference) {
      log.info(
        '[Classifier] chat_history → produktion (refers to the CURRENT thread, not a past one)'
      );
      intent = 'produktion';
    }
  }

  const synthesisMode = pickSynthesisMode(intent ?? 'agentic', documentSources.length);

  // Injection early-warning. The classifier ALREADY notices these payloads and
  // reasons about them ("enthält einen Jailbreak-Versuch, aber die Aufgabe ist
  // die Zusammenfassung") — and then passes them on unflagged. Here the signal
  // is kept so the answer prompt can warn the model before it acts. Deliberately
  // NOT a rejection: pasted mails and citizen inquiries legitimately contain
  // instruction-shaped language, and blocking them would break summarisation.
  //
  // Only MATERIAL is scanned, never `userText`: the user's own message is the
  // trusted instruction channel. Scanning it meant every structured prompt
  // ("## Kontext … ## Ton") tripped the warning and the answer opened by
  // accusing its own author of a manipulation attempt.
  const injectionSuspected =
    containsInstructionMarkers(state.attachmentContext ?? '') ||
    containsInstructionMarkers(state.currentDocument?.markdown ?? '');
  if (injectionSuspected) {
    log.warn('[Classifier] Instruction-shaped markers in this turn material — warning the model');
  }

  // Deep-research consent, read off the user's own words. Sits here with the
  // other deterministic signals (URLs, injection markers) rather than in the
  // classifier's JSON schema: it gates the one paid engine setting, so it must be
  // testable without a model, and adding a field to that schema costs prompt
  // budget on every single turn.
  const explicitDeepRequest = isExplicitDeepRequest(userText);
  if (explicitDeepRequest) {
    log.info('[Classifier] Explicit deep-research request — top search tier unlocked');
  }

  // A deep-research request that came out as `direct` is a self-contradiction:
  // the turn asked, in so many words, to look something up, and `direct` runs no
  // tool at all — so the flag unlocked a search tier for a search that could
  // never happen. Observed live on "schreibe ein vollständiges Dossier über
  // Robert": `dossier` is a DEEP_COMPOUND, the tier was logged as unlocked, and
  // the answer came from parametric memory anyway.
  //
  // Expressed as classifierContradictedResearch rather than by overwriting the
  // intent: that flag already means "the classifier's own signals disagree, let
  // the loop decide", and the loop can still answer tool-free if the planner
  // sees no need. Overwriting to `research` would force a paid search on a turn
  // the model may well be able to answer from the thread.
  const deepRequestContradictsDirect =
    explicitDeepRequest && NO_RETRIEVAL_VERDICTS.has(intent ?? result.intent ?? '');
  if (deepRequestContradictsDirect) {
    log.info(
      '[Classifier] Deep-research request landed on a no-retrieval verdict — handing the turn to the loop'
    );
  }

  // Whether the answer gets pictures beside it. TWO sources, and neither can do
  // the other's job:
  //
  //  - The user's own words ("zeig mir Fotos von der Demo"). Deterministic, so it
  //    holds on every tier.
  //  - The classifier's judgement of the SUBJECT (`bilder` in the LLM tier's
  //    JSON): a regex cannot tell "wer war Marilyn Monroe" (a person, worth
  //    showing) from "wie berechne ich die Grunderwerbsteuer" (a procedure).
  //
  // The second source is GONE with the LLM tier, and knowingly so: it produced a
  // nicety (pictures beside an answer that did not ask for them) at the price of
  // a 27k-character call, and `result.webWantsImages` is now never set by any
  // tier. The field stays because the user's own half still fills it.
  //
  // Only meaningful on a web turn — an image-GENERATION turn returned long before
  // this point with `intent: 'image'`, so the two can never both be true.
  const askedForImages = wantsImageResults(userText);
  const webWantsImages = askedForImages || result.webWantsImages === true;
  if (webWantsImages) {
    log.info(
      `[Classifier] Web search will include image hits (${askedForImages ? 'user asked' : 'subject is visual'})`
    );
  }

  // Which document type the user NAMED, for the turns that persist one. Replaces
  // the LLM tier's `documentSubtype`, and reaches further than it did: every tier
  // gets it now, not just the one that paid for the big prompt.
  const finalIntent = intent ?? result.intent;
  const documentSubtype =
    result.documentSubtype ??
    (finalIntent === 'save_as_doc' || finalIntent === 'artifact'
      ? detectDocumentSubtype(userText)
      : null);

  return {
    ...result,
    ...(documentSubtype != null && { documentSubtype }),
    intent: intent ?? result.intent,
    injectionSuspected,
    explicitDeepRequest,
    ...(deepRequestContradictsDirect ? { classifierContradictedResearch: true } : {}),
    ...(webWantsImages ? { webWantsImages } : {}),
    ...(downgradedSearchQuery != null && !result.searchQuery
      ? { searchQuery: downgradedSearchQuery }
      : {}),
    secondaryIntent,
    detectedUrls,
    ...(hasSiteScope ? { webSiteScope } : {}),
    documentSources,
    synthesisMode,
  };
}

/**
 * Inner classifier node implementation.
 * Uses heuristics-first approach: high-confidence patterns skip LLM entirely.
 * Falls back to LLM for ambiguous queries where heuristics are uncertain.
 */
async function classifierNodeImpl(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const startTime = Date.now();
  log.info('[Classifier] Starting intent classification');

  try {
    const { messages } = state;

    // Extract user message content (handles both string and AI SDK v6 parts format)
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const userContent = extractMessageText(lastUserMessage?.content);

    // Format prior conversation as context for the classifier LLM
    const conversationContext = formatConversationHistory(messages);

    // Topical hints from state anchors (open doc, doc-mentions, board,
    // attachments, images) so the query optimizer can resolve anaphoric
    // references like "dazu", "dies", "darüber" to a concrete subject.
    const topicalContext = formatTopicalContext(state);

    // Analyze temporality and complexity (used by all paths)
    const temporal = analyzeTemporality(userContent);
    const complexity = detectComplexity(userContent);

    // Resource presence flags
    const hasNotebooks = state.notebookIds && state.notebookIds.length > 0;
    const hasDocuments = state.documentIds && state.documentIds.length > 0;
    const hasDocumentChat = state.documentChatIds && state.documentChatIds.length > 0;
    const hasWolkeFiles = state.wolkeFiles && state.wolkeFiles.length > 0;
    const hasConnectFiles = state.connectFiles && state.connectFiles.length > 0;
    const hasBoards = state.boardIds && state.boardIds.length > 0;
    // Live board open in the boards-editor surface. Primary context, NOT a
    // retrieval mention — its id is deliberately NOT injected into boardIds, so
    // `hasBoards` stays false here and the legacy server-side modify_board path
    // cannot fire on the board page. @board mentions in /chat still hit modify_board.
    const hasCurrentBoard = !!state.currentBoard;
    // Open document in the docs-editor is primary context, not retrieval scope.
    // Distinct from documentChatIds — we do NOT force-route to search for it.
    const hasCurrentDocument = !!state.currentDocument;
    // Strip the open document from docMentionIds — when both are set for the
    // same doc, they convey the same fact. Counting the doc twice causes the
    // "Collaborative document mention → direct intent" branch below to win
    // over the "currentDocument → edit_current_doc" branch, which silently
    // drops the user's edit request. The docs-editor surface is authoritative
    // for the open doc; @-mentions of OTHER docs still flow through normally.
    const dedupedDocMentionIds = state.currentDocument?.id
      ? (state.docMentionIds ?? []).filter((id) => id !== state.currentDocument!.id)
      : (state.docMentionIds ?? []);
    const hasDocMentions = dedupedDocMentionIds.length > 0;
    const hasAttachmentContext = !!state.attachmentContext;
    const hasImageAttachments = state.imageAttachments && state.imageAttachments.length > 0;
    const hasAnyDocuments =
      hasDocumentChat || hasDocuments || hasAttachmentContext || hasCurrentDocument;
    // @sheet mentions. currentDocument is shared with docs/presentations, so a
    // sheet open in its own editor is already covered by hasCurrentDocument.
    const hasSheetMentions = state.sheetIds && state.sheetIds.length > 0;

    // "Did the user supply the substance?" — the single answer the writing-order
    // rule consults (Tier 3.5 below, and `decideRunAgentic` in the router). The
    // paste threshold is the heuristics' own (NOUN_TRIGGER_MAX_LENGTH), reused
    // rather than re-picked so "long enough to carry its own subject" means one
    // thing across the classifier.
    const turnCarriesOwnMaterial =
      userContent.length > NOUN_TRIGGER_MAX_LENGTH ||
      hasAttachmentContext ||
      hasCurrentDocument ||
      hasDocMentions ||
      hasDocumentChat;

    // ── TIER 1: Mutation intents (resource + action keywords) ──
    // These are the most specific signals — a user explicitly requesting a change
    // to a referenced resource. Must be checked BEFORE passive context checks,
    // otherwise an image attachment or OCR text would shadow the mutation intent.
    const docModifyPattern = DOC_MODIFY_PATTERN;

    // Open board in the boards-editor surface + modification keywords → live edit
    // via the boards assistant (client-side executor on the live Yjs board). Must
    // fire before any board/doc retrieval branches. Honors the per-board
    // "AI may edit" toggle (enabledTools.edit_current_board === false).
    const editCurrentBoardAllowed = state.enabledTools?.edit_current_board !== false;
    if (
      hasCurrentBoard &&
      editCurrentBoardAllowed &&
      userContent.length > 0 &&
      BOARD_MODIFY_PATTERN.test(userContent)
    ) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(`[Classifier] Live board edit (regex fast-path) → edit_current_board`);
      return {
        intent: 'edit_current_board',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'currentBoard + modification keywords → edit_current_board',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    if (hasBoards && userContent.length > 0 && BOARD_MODIFY_PATTERN.test(userContent)) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Board mutation detected (${state.boardIds.length} board(s)), forcing modify_board intent`
      );
      return {
        intent: 'modify_board',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Board mention + modification keywords → modify_board',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // Open document in docs editor + modification keywords → live edit via
    // BlockNote AI. This MUST fire before the modify_doc branch below: a docs
    // editor surface always has currentDocument, and we want the live-edit path
    // (Yjs-synced, undoable in-place) instead of /chat's modify_doc HITL flow
    // (DB-only update, breaks Yjs).
    // Honor the docs-sidebar "AI may edit document" toggle: when the client
    // explicitly disables `edit_current_doc`, fall through to normal intent
    // classification so the assistant answers conversationally instead of
    // patching the open document.
    const editCurrentDocAllowed = state.enabledTools?.edit_current_doc !== false;

    if (hasCurrentDocument && editCurrentDocAllowed && userContent.length > 0) {
      // Layer 1: fast-path regex. Covers the common explicit-edit verbs
      // (bearbeit, verbesser, kürz, erweiter, …) with zero latency.
      if (docModifyPattern.test(userContent)) {
        const classificationTimeMs = Date.now() - startTime;
        log.info(`[Classifier] Live document edit (regex fast-path) → edit_current_doc`);
        return {
          intent: 'edit_current_doc',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'currentDocument + modification keywords → edit_current_doc',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs,
        };
      }

      // Layer 2: LLM tiebreak. Catches indirect/colloquial/multilingual
      // phrasings the regex can't ("mach das knackiger", "polish this",
      // "kannst du das anders?", "ja, mach das" as a follow-up). Hard 800ms
      // timeout, fail-safe to chat path. See docsIntentTiebreak.ts.
      const tiebreak = await classifyDocsIntentTiebreak({ userContent, conversationContext });
      if (tiebreak === 'edit') {
        const classificationTimeMs = Date.now() - startTime;
        log.info(`[Classifier] Live document edit (LLM tiebreak) → edit_current_doc`);
        return {
          intent: 'edit_current_doc',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'currentDocument + LLM tiebreak ruled edit → edit_current_doc',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs,
        };
      }
      // tiebreak === 'question' or null → fall through to chat-path
      // classification (existing behavior).
    }

    if (hasDocMentions && userContent.length > 0 && docModifyPattern.test(userContent)) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Collaborative document mutation detected (${state.docMentionIds.length} doc(s)), forcing modify_doc intent`
      );
      return {
        intent: 'modify_doc',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Collaborative document mention + modification keywords → modify_doc',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // ── TIER 2: Context intents (resource presence, no mutation keywords) ──
    // Summary detection: when documents/attachments are present AND user asks for summary,
    // force summary intent. Without documents, "fasse zusammen" goes to LLM for disambiguation
    // (could mean web search + summarize, or conversation summary).
    const summaryPattern =
      /\b(fass[e]?\s+(das\s+|die\s+|den\s+)?(dokument\s+|datei\s+)?zusammen|zusammenfass|zusammenfassung|kurzfassung)\b/i;
    if (hasAnyDocuments && summaryPattern.test(userContent)) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(`[Classifier] Summary request with documents detected, forcing summary intent`);
      return {
        intent: 'summary',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Summary request with documents attached',
        hasTemporal: false,
        complexity: 'simple' as const,
        classificationTimeMs,
      };
    }

    // If document chat IDs are present (from @dokumentchat multi-select), force search intent
    if (hasDocumentChat && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'DocumentChat',
        docCount: state.documentChatIds.length,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // Image edit detection — generation intent, exclusive. Must beat the
    // search-capable branches below so "bearbeite das Bild + @berlin" still
    // routes to imageEditNode rather than RAG.
    //
    // Two trigger patterns:
    //  1. Image attached + edit verb → image_edit (the natural-attach flow).
    //  2. No attachment but verb + image noun ("bearbeite das Foto") →
    //     image_edit anyway; the node returns the German "please attach an
    //     image" error from imageEditNode.ts:64-72.
    //
    // Das Verbots-Gitter fehlte hier, obwohl Tier 2.7 es eine Stufe tiefer
    // längst trägt: „Ändere das Bild nicht, sag mir nur was drauf ist" hat Verb
    // UND Nomen und wurde deshalb zur Bearbeitung — die Verneinung stand
    // dahinter und hat nie jemand gelesen. Dieselbe Bauform wie bei den anderen
    // Artefaktarten, nur an der frühesten Stufe, wo sie am meisten kostet: was
    // Tier 1 beansprucht, sieht keine spätere Prüfung mehr.
    const editVerb = userContent.length > 0 && hasImageEditVerb(userContent);
    if (
      editVerb &&
      (hasImageAttachments || mentionsImageNoun(userContent)) &&
      !forbidsPersistentAction(userContent, ARTIFACT_NOUN_BY_KIND.image)
    ) {
      log.info(
        `[Classifier] Image edit detected (attached=${hasImageAttachments}, noun=${mentionsImageNoun(userContent)}), forcing image_edit intent`
      );
      return {
        intent: 'image_edit',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: hasImageAttachments
          ? 'Image attachment + edit verb → image_edit'
          : 'Edit verb + image noun without attachment → image_edit (node will ask for attachment)',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Search-capable mentions take precedence over context-only branches.
    // Co-present anchors (boards / doc-mentions / files / images) still inject
    // into the system prompt via respondNode regardless of intent.

    if (hasDocuments && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'Document',
        docCount: state.documentIds.length,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // @wolke selections force search intent — the wolke file content must reach
    // respondNode via perSourceResults, and that only happens inside the search path.
    if (hasWolkeFiles && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'Wolke',
        docCount: state.wolkeFiles.length,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // @connect selections force search intent — the connected-account file content
    // must reach respondNode via perSourceResults, and that only happens inside the
    // search path. Mirrors the @wolke forced-search branch above.
    if (hasConnectFiles && userContent.length > 0) {
      return classifyWithForcedSearch({
        reason: 'Connect',
        docCount: state.connectFiles.length,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
      });
    }

    // If notebooks are mentioned, force search intent with LLM query optimization.
    // Also detect compound queries: notebook + non-default agent = gather-then-apply pipeline.
    if (hasNotebooks) {
      const isNonDefaultAgent = state.agentConfig.identifier !== 'gruenerator-universal';
      const gatherSources: GatherSource[] = ['notebook-search'];

      // Empty user content after mention stripping (e.g., "@hamburg @presse")
      if (userContent.length === 0) {
        const classificationTimeMs = Date.now() - startTime;
        log.info(
          `[Classifier] Notebook mention with empty text, forcing search intent (compound: ${isNonDefaultAgent})`
        );
        return {
          intent: 'search',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'Notebook mention with empty text forces search intent',
          hasTemporal: false,
          complexity: 'simple' as const,
          classificationTimeMs,
          gatherSources,
          ...(isNonDefaultAgent ? { contentType: null } : {}),
        };
      }

      log.info(
        `[Classifier] Notebook mention detected, forcing search intent with LLM query optimization (compound: ${isNonDefaultAgent})`
      );

      return classifyWithForcedSearch({
        reason: 'Notebook',
        docCount: state.notebookIds.length,
        userContent,
        conversationContext,
        topicalContext,
        temporal,
        complexity,
        startTime,
        gatherSources,
      });
    }

    // Context-only fallback branches — fire only when no search-capable
    // mention above already routed the request.

    if (hasAttachmentContext && userContent.length > 0) {
      // Agent-bound default notebooks (or a deliberate composer pick): the
      // attachment is working material (e.g. a pasted citizen email), but the
      // answer must still be grounded in the notebook. `produktion` would skip
      // the search stage entirely (intentExecutionService), so the mandatory
      // research step of notebook-bound agents would silently never run. The
      // topic for the query refiner lives in the attachment, not in the typed
      // instruction ("Antworte auf diese E-Mail: …"), so pass an excerpt as
      // topical context.
      const defaultNotebookScopeCount =
        (state.defaultNotebookCollectionIds?.length ?? 0) +
        (state.defaultNotebookDocumentIds?.length ?? 0);
      if (defaultNotebookScopeCount > 0) {
        return classifyWithForcedSearch({
          reason: 'AttachmentDefaultNotebook',
          docCount: defaultNotebookScopeCount,
          userContent,
          conversationContext,
          topicalContext: [
            topicalContext,
            `- Inhalt der hochgeladenen Datei: "${extractAttachmentTopicHint(state.attachmentContext!)}"`,
          ]
            .filter(Boolean)
            .join('\n'),
          temporal,
          complexity,
          startTime,
        });
      }

      log.info(
        `[Classifier] File attachment detected (${state.attachmentContext!.length} chars), forcing produktion intent`
      );
      return {
        intent: 'produktion',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'File attachment present — respondNode will use attachmentContext',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Image attachments (no edit verb above) — vision model interprets in respond.
    if (hasImageAttachments) {
      log.info(
        `[Classifier] Image attachment detected (${state.imageAttachments.length} images), forcing produktion intent`
      );
      return {
        intent: 'produktion',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Image attachment present — vision model will interpret the image',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Board mentions (no mutation, no co-present search source).
    if (hasBoards && userContent.length > 0) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Board mention detected (${state.boardIds.length} board(s)), forcing produktion intent`
      );
      return {
        intent: 'produktion',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Board mention forces direct intent — board context injected by controller',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // Collaborative document mentions (no mutation, no co-present search source).
    if (hasDocMentions && userContent.length > 0) {
      const classificationTimeMs = Date.now() - startTime;
      log.info(
        `[Classifier] Collaborative document mention detected (${state.docMentionIds.length} doc(s)), forcing produktion intent`
      );
      return {
        intent: 'produktion',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning:
          'Collaborative document mention forces direct intent — content injected by controller',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
      };
    }

    // Content-creation agents (e.g. öffentlichkeitsarbeit) instruct the model
    // to ground every PM / social post on real LV examples. The default
    // classifier rule routes "Schreib eine Pressemitteilung..." to `direct`,
    // which skips the search node entirely and contradicts the agent's
    // systemRole ("Nutze IMMER ..."). Force `examples` intent here so the
    // search node fires before respondNode.
    const agentWantsExamples =
      Array.isArray(state.agentConfig.enabledTools) &&
      state.agentConfig.enabledTools.includes('examples') &&
      state.agentConfig.alwaysSearchesExamples === true;
    // For content-creation agents, the noun alone is enough — typical prompts
    // are bare noun-phrases like "Tweet zur Verkehrswende" without an explicit
    // creation verb.
    //
    // Der PM-Arm ist mit dem Verdikt weg. Er lautete „wantsPm ?
    // pressemitteilung_examples : social_post" plus `secondaryIntent:
    // 'examples'` für gemischte Aufforderungen („Tweet UND PM zu X"). Gemessen
    // erreichte er genau EINEN ausgelieferten Agenten: `alwaysSearchesExamples`
    // steht nur auf `gruenerator-ricarda-lang` (Tweets, `enabledTools:
    // ['examples']`, Sammlung `ricarda_lang_tweets`) — die LV-PR-Agenten, die
    // `pressemitteilung_examples` in `enabledTools` führen, setzen das Flag
    // nicht. Das Feld ist auch nirgends einstellbar (kein UI, keine Spalte).
    // Eine PM-Aufforderung an den Tweet-Agenten fällt jetzt in die normale
    // Klassifikation und schreibt mit dem Rezept `presse`, statt LV-PMs gegen
    // eine Tweet-Sammlung zu suchen.
    if (agentWantsExamples && userContent.length > 0) {
      if (SOCIAL_NOUN_PATTERN.test(userContent)) {
        // Das Verdikt hiess `social_post` und ist mit ihm gefallen. Was der
        // Block WOLLTE, steht in seinem eigenen Namen: `alwaysSearchesExamples`
        // — der Turn soll auf echten Posts der Kanäle gegründet sein, und
        // genau das tut `examples`. Die Kombischeibe (Karte, Sharepic-Hälfte,
        // eigene Rubrik) war nie das, wonach das Flag fragte.
        //
        // Die Textsorte trägt jetzt das Rezept: `examples` ist ein
        // Einzeldurchlauf, und `deriveImplicitRecipeMention` wählt darauf
        // `instagram`/`facebook`/… aus demselben Nutzertext, aus dem hier
        // vorher `platform` gelesen wurde.
        log.info(
          `[Classifier] Content-creation agent (${state.agentConfig.identifier}) → examples (Social-Auftrag)`
        );
        return {
          intent: 'examples',
          secondaryIntent: null,
          searchSources: [],
          searchQuery: extractSearchTopic(userContent) || userContent,
          detectedFilters: null,
          reasoning: `Agent ${state.agentConfig.identifier} requires example grounding for content creation`,
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // Sharepic agent is single-purpose: selecting it means the user wants a
    // sharepic. Bare topic prompts ("zur Verkehrswende") carry no sharepic
    // keyword, so the heuristic would route them to `direct` and never reach
    // sharepicGenerationService. Force the `sharepic` intent here — except for
    // obvious meta/help questions about the assistant itself, which should
    // still get a normal answer. Image attachments already returned `direct`
    // above (vision), so they never reach this branch.
    const isSharepicAgent = state.agentConfig.identifier === 'gruenerator-sharepic';
    const looksLikeMetaQuestion =
      /^\s*(wie|was|wer|warum|wieso|hilfe|help)\b/i.test(userContent) &&
      /\b(du|dich|dir|funktionier\w*|kannst|machst|bist)\b/i.test(userContent);
    if (isSharepicAgent && userContent.length >= 10 && !looksLikeMetaQuestion) {
      log.info(
        `[Classifier] Sharepic agent (${state.agentConfig.identifier}) active → forcing sharepic intent`
      );
      return {
        intent: 'sharepic',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Sharepic agent selected — routing to sharepic generation',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Bundestag agent is a dedicated DIP research assistant: selecting it means
    // the user wants Bundestag document/speech research. enabledTools only gates
    // which tools are allowed, it does not force the intent, so bare topic
    // prompts otherwise fall through to `direct` and never reach the bundestag
    // search branch. Force it here — except obvious meta/help questions. de-AT
    // never reaches this (agent is de-DE only; downgrade guard above also covers it).
    const isBundestagAgent = state.agentConfig.identifier === 'gruenerator-bundestag';
    if (
      isBundestagAgent &&
      state.userLocale !== 'de-AT' &&
      userContent.length >= 10 &&
      !looksLikeMetaQuestion
    ) {
      log.info(
        `[Classifier] Bundestag agent (${state.agentConfig.identifier}) active → forcing bundestag intent`
      );
      return {
        intent: 'bundestag',
        searchSources: [],
        searchQuery: extractSearchTopic(userContent) || userContent,
        detectedFilters: null,
        reasoning: 'Bundestag agent selected — routing to DIP research',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // EXPERIMENTAL per-server MCP prose routing: when the user names one of their
    // connected external services alongside an action ("erstelle eine Brevo-
    // Kampagne"), scope the tool-loop to that server — without needing an explicit
    // @-mention. Conservative by construction: only connected servers are known,
    // and only a name + action verb fires (see matchMcpServerByName). Runs before
    // the social-post block so "Brevo-Kampagne" isn't misrouted to social_post.
    // Gate the DB/cache lookup behind the cheap action-verb regex so the
    // overwhelmingly common no-action message never touches the servers table.
    const mcpUserId = state.agentConfig?.userId;
    if (mcpUserId && userContent.length >= 8 && MCP_ACTION_PATTERN.test(userContent)) {
      const servers = await McpServerRegistry.getClassifierContext(mcpUserId).catch(
        (err: unknown) => {
          // Was a bare noop: a registry outage made every connector invisible,
          // so "erstelle eine Brevo-Kampagne" quietly became a chat answer.
          log.warn(`[Classifier] MCP registry lookup failed: ${err}`);
          return [];
        }
      );
      const scopedServerId = matchMcpServerByName(userContent, servers);
      if (scopedServerId) {
        log.info('[Classifier] MCP prose routing → mcp intent', { scope: scopedServerId });
        return {
          intent: 'mcp',
          mcpServerScope: scopedServerId,
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'Connected MCP service named with an action — routing to tool loop',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // Social post creation — for ALL users, not just content-creation agents.
    // Requires a bare noun-phrase shape ("Instagram-Post zu Tempo 30",
    // ^-anchored, so valid even before a long paste) or a creation verb NEAR a
    // social noun in a short message — "schreibe eine Produktvorstellung …
    // [Paste erwähnt Instagram]" must not pair the instruction's verb with a
    // noun inside pasted material. Questions and example-browsing never create.
    // A sharepic-only ask ("Sharepic für Instagram" — sharepic word, no post
    // noun) is deferred to the sharepic route. PM prompts keep their own routes
    // (handled above for agents, LLM tier otherwise).
    const isLongPaste = userContent.length > NOUN_TRIGGER_MAX_LENGTH;
    // Quoted spans are reported speech; a negated noun ("mach keinen Post daraus")
    // must not create.
    const ucStripped = stripQuotedSpans(userContent);
    const looksLikeSocialCreation =
      SOCIAL_NOUN_PATTERN.test(ucStripped) &&
      !PM_NOUN_PATTERN.test(ucStripped) &&
      !SOCIAL_META_QUESTION_PATTERN.test(ucStripped) &&
      !looksLikeMetaQuestion &&
      !isNegatedArtifactRequest(ucStripped, SOCIAL_NOUN_PATTERN) &&
      (SOCIAL_BARE_NOUN_PATTERN.test(ucStripped) ||
        (!isLongPaste && nounNearCreateVerb(ucStripped, SOCIAL_NOUN_PATTERN)));
    if (looksLikeSocialCreation && userContent.length >= 10) {
      if (hasExplicitSharepicWord(userContent) && !POST_NOUN_PATTERN.test(userContent)) {
        // "Sharepic für Instagram" — a sharepic ask that merely names a
        // platform. Defer to the sharepic route.
        //
        // Der zweite Halbsatz von früher („Post mit Sharepic" bleibt hier, weil
        // social_post die Sharepic-Hälfte selbst trägt) ist mit dem Verdikt weg:
        // ein Post-Auftrag ist jetzt ein Schreibauftrag, kein Artefakt-Auftrag.
        // „Post MIT Sharepic" nennt das Post-Nomen und fällt deshalb weiter in
        // den Zweig darunter — es wird zum Text, und das Sharepic bestellt man
        // im nächsten Turn (oder direkt mit „Sharepic zu …").
        log.info('[Classifier] Sharepic-only ask with a platform hint — deferring');
      } else {
        // Das Gitter bleibt, das Verdikt wechselt. Ein Social-Post ist eine
        // TEXTSORTE, keine Artefaktart: `produktion` ist der Einzeldurchlauf,
        // auf dem `deriveImplicitRecipeMention` das Rezept (`instagram`,
        // `facebook`, `twitter`, `linkedin`, `reel`) setzt — korpusgestützt,
        // mit AT-Gabelung, mit angelerntem Stil und mit LV-Vorzug. Die
        // eingebaute Rubrik des alten Zweigs widersprach den Rezepten messbar.
        //
        // Warum der Block überhaupt stehenbleibt, statt die Heuristik machen zu
        // lassen: er ist der Grund, warum ein Schreibauftrag nicht als
        // Beispiel-Stöberei (`examples`, deren Verbliste `schreib` enthält) und
        // nicht als Schleifen-Turn endet. Nur das Etikett war falsch.
        log.info('[Classifier] Social post creation → produktion (Rezept schreibt)');
        return {
          intent: 'produktion',
          searchSources: [],
          searchQuery: extractSearchTopic(userContent) || userContent,
          detectedFilters: null,
          reasoning: 'Social post creation — Rezept auf dem Einzeldurchlauf',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // ── TIER 2.7: Follow-up on one of the thread's artifacts ───────────────
    // chat_threads.last_tool_context is the only carrier a vague follow-up has
    // (mentions are stripped on send). Placed AFTER every explicit-anchor branch
    // (open editor surfaces, @-mentions, attachments) so it can never preempt
    // them; the deterministic tiers otherwise ignore lastToolContext and only the
    // Tier-4 LLM prose hint uses it. Belt-and-braces conditions below too.
    //
    // `tc` is the thread's NEWEST artifact unless the thread holds several and
    // the resolver picked an older one — see pickThreadArtifact.
    const tc = await pickThreadArtifact(state, userContent);
    if (tc && userContent.length > 0) {
      // "Kürze die Begründung auf die Hälfte" after a chat-created doc: the
      // modify verbs match, but every doc branch above was gated on an anchor a
      // chat-created doc doesn't have.
      if (
        tc.kind === 'document' &&
        tc.ref &&
        !hasCurrentDocument &&
        !hasDocMentions &&
        !hasAnyDocuments &&
        !hasBoards &&
        docModifyPattern.test(userContent) &&
        // "Gib den Stand als JSON aus, keine Dokumentaktion" matches the modify
        // verbs and used to update the thread's last document anyway — this tier
        // is purely positive-patterned and had no negation check.
        !forbidsPersistentAction(userContent, ARTIFACT_NOUN_BY_KIND.document) &&
        // "Erstelle eine aktualisierte Zusammenfassung in zwei Stichpunkten"
        // orders a CHAT answer — the modify verb belongs to the summary, not
        // the artifact. Sticks only when the document itself is named.
        !asksForChatDeliverable(userContent, ARTIFACT_NOUN_BY_KIND.document)
      ) {
        log.info('[Classifier] Follow-up doc edit via lastToolContext → modify_doc', {
          ref: tc.ref,
        });
        return {
          intent: 'modify_doc',
          docMentionIds: [tc.ref],
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'lastToolContext(document) + modification keywords → modify_doc on last doc',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
      // "Mach die erste Zeile fett" after a chat-created sheet: without this
      // branch the follow-up fell through to GenerationScope, whose intent
      // space is creation-only — it silently created a second, unrelated
      // sheet instead of editing the one just made.
      if (
        tc.kind === 'sheet' &&
        tc.ref &&
        !hasCurrentDocument &&
        !hasSheetMentions &&
        !hasAnyDocuments &&
        !hasBoards &&
        docModifyPattern.test(userContent) &&
        !forbidsPersistentAction(userContent, ARTIFACT_NOUN_BY_KIND.sheet) &&
        // Same escape as the doc branch: a summary/bullet-point order without
        // the word "Tabelle" wants the answer in chat, not 7 sheet ops
        // (QA 08/2026: the two Stichpunkte never appeared).
        !asksForChatDeliverable(userContent, ARTIFACT_NOUN_BY_KIND.sheet)
      ) {
        log.info('[Classifier] Follow-up sheet edit via lastToolContext → edit_sheet', {
          ref: tc.ref,
        });
        return {
          intent: 'edit_sheet',
          sheetEditId: tc.ref,
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'lastToolContext(sheet) + modification keywords → edit_sheet on last sheet',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
      // "Nochmal, aber abends mit warmem Licht" after image generation — unlocks
      // the router's last-image rehydration (gated on intent === 'image_edit').
      //
      // `isImageEditInstruction` ist der dritte Fall und war die Lücke: die
      // vergleichende Anweisung mit benanntem Bildteil („Mach den Hintergrund
      // dunkler"). Sie trägt weder ein Bearbeiten-Verb noch eine Neu-Formel, lag
      // deshalb bis zur Löschung der LLM-Stufe bei dieser und fiel danach ins
      // Residual — Prosa auf einen Auftrag, für den ein Bild bereitlag.
      if (
        tc.kind === 'image' &&
        !hasImageAttachments &&
        (hasImageEditVerb(userContent) ||
          isImageRegenRequest(userContent) ||
          isImageEditInstruction(userContent)) &&
        !forbidsPersistentAction(userContent, ARTIFACT_NOUN_BY_KIND.image)
      ) {
        log.info('[Classifier] Follow-up image edit via lastToolContext → image_edit');
        return {
          intent: 'image_edit',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'lastToolContext(image) + edit/regenerate phrasing → image_edit',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
      // "Mach den Text größer" / "Anderer Hintergrund bitte" after a sharepic.
      //
      // This turn already had TWO corrections stacked on top of the LLM tier,
      // which is the tell that the tier was never deciding anything: the LLM
      // answers `image_edit` (its own reasoning names the *Sharepic*), the
      // post-LLM patch below rewrites that to `sharepic`, and the router's
      // refinement block then overrides the intent a third time and forces the
      // tool regardless of what the classifier said. 27k characters, three
      // corrections, one predetermined outcome.
      //
      // Narrow on ONE count now: with an image ATTACHED, image_edit is simply
      // right. `isSharepicEditInstruction` is the STRICTER of the two edit
      // heuristics (verb AND noun) — it is a subset of the router's
      // `isSharepicRefinement`, so anything this branch forwards is something the
      // refinement block accepts.
      //
      // The second exclusion is gone with the LLM tier: naming an image
      // ("mach das Foto heller") used to step aside so the big prompt could pick
      // image_edit. Without an attachment that verdict leads nowhere — the image
      // node answers "bitte häng ein Bild an" — while the picture the user means
      // is the sharepic's own background, which the sharepic edit path CAN change.
      // The explicit phrasings still reach image_edit: Tier 1 above claims
      // "bearbeite das Bild" (edit verb + image noun) before this branch runs.
      if (
        tc.kind === 'sharepic' &&
        !hasImageAttachments &&
        isSharepicEditInstruction(userContent)
      ) {
        log.info('[Classifier] Follow-up sharepic edit via thread artifact → sharepic');
        recordDecision('classifier.tier', 'tier2.7_sharepic_followup', {
          inputs: { artifactKind: tc.kind },
        });
        return {
          intent: 'sharepic',
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'threadArtifact(sharepic) + edit instruction → sharepic refinement',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
      // "denk dir ein muster aus" / "los, erstellen" / "wo ist das?" after an MCP
      // turn: without this the vague follow-up went to the LLM which picked
      // `direct` — the connector was never called (observed live). Re-scope to the
      // last connector via tc.ref so the explicit-scope mount runs (retry-on-
      // missing + note + forced first call). Fires on an MCP-action verb, an
      // anaphoric marker, OR a short IMPERATIVE continuation (a "do it" message
      // that is NOT a new knowledge question, a first-person comment, or
      // chitchat). Never hijacks a request to create one of our own artifacts.
      const mcpWordCount = userContent.trim().split(/\s+/).filter(Boolean).length;
      const isImperativeContinuation =
        mcpWordCount <= 12 &&
        !NON_CONTINUATION_START.test(userContent) &&
        !MCP_CHITCHAT_ONLY.test(userContent);
      if (
        tc.kind === 'mcp' &&
        tc.ref &&
        !OWN_ARTIFACT_NOUN.test(userContent) &&
        (MCP_ACTION_PATTERN.test(userContent) ||
          MCP_CONTINUATION_REFERENTIAL.test(userContent) ||
          isImperativeContinuation)
      ) {
        log.info('[Classifier] Follow-up via lastToolContext(mcp) → mcp', { scope: tc.ref });
        recordDecision('classifier.tier', 'tier2.7_mcp_followup', {
          inputs: { mcpScope: tc.ref },
        });
        return {
          intent: 'mcp',
          mcpServerScope: tc.ref,
          searchSources: [],
          searchQuery: null,
          detectedFilters: null,
          reasoning: 'lastToolContext(mcp) + continuation phrasing → re-scope to last connector',
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // ── TIER 2.9: Grünerator help question ("wie erstelle ich ein Sharepic?") ──
    // MUST run before Tier 3: the heuristics see "erstelle … sharepic" and
    // classify the turn as a GENERATION intent, so the assistant would build a
    // sharepic for a user who only asked how sharepics work.
    // `looksLikeDocsHelpQuestion` is deliberately high-precision (see
    // classifierParsing) — what it misses still reaches the LLM tier, which
    // knows the `hilfe` intent too.
    if (looksLikeDocsHelpQuestion(userContent)) {
      log.info(`[Classifier] Docs help question → hilfe: "${userContent.slice(0, 60)}"`);
      recordDecision('classifier.tier', 'tier2.9_docs_help');
      return {
        intent: 'hilfe',
        searchSources: [],
        // The docs tool runs BM25 over the question itself, so the raw text is
        // the query — no separate extraction step like the search intents have.
        searchQuery: userContent.slice(0, 500),
        detectedFilters: null,
        reasoning: 'Grünerator help question (docs)',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // ── TIER 2.95: "Grafik" is three different products ────────────────────
    // MUST run before Tier 3, which would swallow it: `imageKeywords` contains
    // `grafik`, so "erstelle eine Grafik zur Windkraft" silently became a free
    // AI image. It could equally mean a branded sharepic or a data chart — and
    // all three cost a generation. Guessing produces the wrong artifact two
    // times out of three, so ask instead.
    //
    // Only fires when the word is genuinely ambiguous: naming a sharepic, a
    // chart type or a drawing verb already answers the question, and those
    // paths stay untouched.
    if (
      !isLongPaste &&
      (state.imageAttachments?.length ?? 0) === 0 &&
      isAmbiguousGraphicRequest(userContent)
    ) {
      log.info(`[Classifier] Ambiguous "Grafik" ask — asking which kind`);
      recordDecision('classifier.tier', 'tier2.95_ambiguous_graphic');
      return {
        intent: 'produktion',
        needsClarification: true,
        clarificationQuestion:
          'Was für eine Grafik soll es werden? Ein Sharepic ist eine gebrandete Vorlage mit Text, ein KI-Bild ein frei generiertes Motiv, ein Diagramm stellt Zahlen dar.',
        clarificationOptions: ['Sharepic', 'KI-Bild', 'Diagramm'],
        clarificationKind: 'graphic_kind',
        searchSources: [],
        searchQuery: null,
        detectedFilters: null,
        reasoning: 'Ambiguous graphic request — asking which artifact is meant',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // ── TIER 3: Heuristic pre-check ──
    // Short messages: always use heuristics (likely greetings)
    if (userContent.length < 10) {
      const result = heuristicClassify(userContent, {
        hasTabularAttachment: state.hasTabularAttachment ?? false,
      });
      log.info(
        `[Classifier] Short message, heuristics: ${result.intent} (confidence: ${result.confidence.toFixed(2)})`
      );
      recordDecision('classifier.tier', 'tier3_short_message', {
        inputs: { heuristicIntent: result.intent, confidence: result.confidence },
      });
      return {
        intent: result.intent,
        searchSources: [],
        searchQuery: result.searchQuery,
        detectedFilters: null,
        reasoning: result.reasoning,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Try heuristics first - check confidence
    const heuristic = heuristicClassify(userContent, {
      hasTabularAttachment: state.hasTabularAttachment ?? false,
    });

    // Both penalties were written to "force the LLM tier". That tier is gone
    // (the dispositions series deleted Tier 4), so what they do NOW is hold the
    // turn back from the Tier-3 early return below and let it walk the rest of
    // the ladder — 3.4, the loop demotion, the generation scope, the residual.
    // That is still a defensible effect, and it is the only one, so the names
    // and the log lines say it. Nothing about the behaviour changes here; what
    // changes is that reading the log no longer suggests a call that never
    // happens (a live log full of "forcing LLM (0.80 → 0.50)" immediately
    // followed by "LLM skipped" cost real debugging time on 02.08.2026).
    const isSearchIntent = !NON_SEARCH_INTENTS.has(heuristic.intent);
    const needsDecomposition = isSearchIntent && looksMultiTopic(userContent);

    // A short message inside a running conversation carries no signal of its
    // own. The penalty is not its only job any more: `isVagueFollowup` also
    // feeds `selfContained` at Tier 3.5, which is what keeps "mach es blauer"
    // out of a planner that has nothing to plan.
    const isVagueFollowup = conversationContext && userContent.split(/\s+/).length <= 8;

    const effectiveConfidence =
      heuristic.confidence - (needsDecomposition ? 0.3 : 0) - (isVagueFollowup ? 0.25 : 0);

    if (needsDecomposition) {
      log.info(
        `[Classifier] Multi-topic — past the heuristic early return (${heuristic.confidence.toFixed(2)} → ${effectiveConfidence.toFixed(2)})`
      );
    }
    if (isVagueFollowup) {
      log.info(
        `[Classifier] Vague follow-up — past the heuristic early return (${heuristic.confidence.toFixed(2)} → ${effectiveConfidence.toFixed(2)})`
      );
    }

    // High confidence: skip LLM, use heuristics directly
    if (effectiveConfidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      const classificationTimeMs = Date.now() - startTime;

      // Apply query optimization for search intents
      let optimizedQuery = heuristic.searchQuery;
      if (heuristic.searchQuery && !NON_SEARCH_INTENTS.has(heuristic.intent)) {
        const extracted = extractSearchTopic(heuristic.searchQuery);
        if (extracted !== heuristic.searchQuery) {
          log.debug(
            `[Classifier] Heuristic query optimized: "${heuristic.searchQuery}" → "${extracted}"`
          );
          optimizedQuery = extracted;
        }
      }

      const heuristicSearchSources = detectSearchSources(userContent, heuristic.intent);
      const heuristicFilters = heuristicExtractFilters(userContent);
      if (heuristicFilters) {
        log.debug(`[Classifier] Heuristic filters: ${JSON.stringify(heuristicFilters)}`);
      }
      log.info(
        `[Classifier] Heuristics (confidence: ${heuristic.confidence.toFixed(2)}): ${heuristic.intent} - ${heuristic.reasoning}${heuristicSearchSources.length > 1 ? ` [multi-source: ${heuristicSearchSources.join('+')}]` : ''}`
      );
      recordDecision('classifier.tier', 'tier3_heuristic', {
        inputs: {
          heuristicIntent: heuristic.intent,
          confidence: heuristic.confidence,
          effectiveConfidence,
          needsDecomposition,
          isVagueFollowup,
        },
      });
      return {
        intent: heuristic.intent,
        searchSources: heuristicSearchSources,
        searchQuery: optimizedQuery?.slice(0, 500) || null,
        detectedFilters: heuristicFilters,
        reasoning: `${heuristic.reasoning} (heuristic, confidence: ${heuristic.confidence.toFixed(2)})`,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs,
        ...(heuristic.targetGroupName != null && { targetGroupName: heuristic.targetGroupName }),
      };
    }

    // ── TIER 3.4: gated specials the heuristic table never owned ──────────
    // Two intents were LLM-ONLY, so every turn asking for them paid for the 27k
    // prompt — and `chat_history` additionally had to be VETOED out of Tier-3.5
    // demotion below just to survive that far. Both decisions are deterministic
    // once the phrasing is unambiguous, and the patterns behind them are the
    // precision half of gates that already exist (see `CHAT_HISTORY_DIRECT`).
    //
    // Ambiguous phrasings keep today's route exactly: they match the recall gate
    // but not the precision pattern, so they fall past this tier, the veto below
    // still holds them out of demotion, and Tier 4 decides as before.

    // A reference to THIS thread is not a recall — the messages are already in
    // context, and running a Qdrant search over PAST threads for them is the
    // live failure `CURRENT_THREAD_REFERENCE` was written for ("was war meine
    // allererste Frage in diesem Chat?" → 0 hits → "keine Quellen verfügbar",
    // with the answer sitting a few messages above).
    if (CHAT_HISTORY_DIRECT.test(userContent) && !CURRENT_THREAD_REFERENCE.test(userContent)) {
      const recallWindow = parseRelativeDateRange(userContent);
      const recallFilters = { ...(heuristicExtractFilters(userContent) ?? {}), ...recallWindow };
      log.info(
        `[Classifier] Chat recall (direct route, LLM skipped)${recallWindow ? ` [${recallWindow.date_from}..${recallWindow.date_to}]` : ''}`
      );
      recordDecision('classifier.tier', 'tier3.4_chat_recall', {
        // `hasWindow`, nicht `hasDateWindow`: `check-decision-journal.mjs`
        // verbietet zeitförmige Schlüsselnamen in `inputs`, weil ein Zeitwert
        // dort jeden Lauf zu einem Diff gegen den vorigen macht. Der Wert hier
        // ist ein Boolean und wäre harmlos — aber die Regel prüft den NAMEN,
        // und eine Ausnahme für „ist diesmal wirklich kein Zeitstempel" wäre
        // genau die Aufweichung, die den Guard wertlos macht.
        inputs: { hasWindow: recallWindow != null },
      });
      return {
        intent: 'chat_history',
        searchSources: detectSearchSources(userContent, 'chat_history'),
        searchQuery: (extractSearchTopic(userContent) || userContent).slice(0, 500),
        detectedFilters: Object.keys(recallFilters).length > 0 ? recallFilters : null,
        reasoning: 'Bezug auf frühere eigene Inhalte (deterministisch erkannt)',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // Ein Dauerauftrag geht in die Schleife, nicht auf einen Intent: der Pin
    // auf `recurring_tasks` zwingt den Turn hinein (`turnPlan`) und benennt den
    // ersten Werkzeugaufruf (`pinnedFirstTool`), so wie `@umfragen` es über die
    // Erwähnung tut — nur dass hier der Detektor pinnt. Der Loop-Planer füllt
    // Takt und Zustellung selbst, und das Anlegen ist eine Karte; bis 09/2026
    // schrieb der Intent `create_recurring_task` ohne Bestätigung in die DB.
    if (looksLikeRecurringOrder(userContent)) {
      log.info('[Classifier] Recurring order → loop with recurring_tasks pinned (LLM skipped)');
      recordDecision('classifier.tier', 'tier3.4_recurring_order', {});
      return {
        intent: 'agentic',
        mentionPinnedTool: 'recurring_tasks',
        searchSources: [],
        searchQuery: userContent.slice(0, 500),
        detectedFilters: null,
        reasoning: 'Wiederkehrender Auftrag (Takt + Zustellung erkannt) → Werkzeug recurring_tasks',
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
    }

    // ── TIER 3.5: Loop demotion ──
    // A low-confidence but TOOLABLE verdict skips the LLM call (~800ms) and
    // hands the turn to the agentic loop, whose model picks the tools itself.
    // Only retrieval-shaped intents demote — generation/platform-gated intents
    // (sharepic, social_post, image, ...) and chat-recall phrasings keep the
    // LLM tier so their gates/HITL/routing stay intact.
    // A writing order whose substance the user did NOT supply demotes too. The
    // heuristic itself already draws this line — `isCreativeTask && isLongPaste`
    // scores 0.82 while `isCreativeTask` alone scores 0.75 — it just resolved
    // both to `direct`. Demoting the second case is what makes "schreib eine
    // Pressemitteilung zu X" reach a planner that can search, instead of being
    // written from parametric memory.
    const unsourcedWriting =
      NO_RETRIEVAL_VERDICTS.has(heuristic.intent) &&
      looksLikeUnsourcedWritingOrder(userContent, { hasOwnMaterial: turnCarriesOwnMaterial });

    // The default flips here: a no-retrieval verdict at this point is the
    // heuristic table's RESIDUAL, not a finding — `direct@0.50` is what the
    // rule table returns when nothing matched. Treating "nothing matched" as
    // "needs no tool" is the bug class the three rescue predicates were each
    // patching one shape of. Now the residual loops unless the turn positively
    // shows it is self-contained (`looksLikeSelfContainedTurn`, which is also
    // what the router's gate consults — one rule, one implementation).
    //
    // A short follow-up is exempt on purpose. It is the one case where the
    // THREAD decides and the message text cannot: "mach es blauer" carries no
    // signal at all, and the -0.25 penalty above exists precisely to send it to a
    // tier that can read the conversation. Looping it would strand an artifact
    // follow-up in a planner with nothing to plan.
    //
    // `lastToolContext` is the second half of that: mentions are stripped from
    // message text on send, so a thread that just produced a sharepic is the
    // ONLY evidence that "und jetzt noch die Uhrzeit ergänzen" is an edit rather
    // than a topic. The word cap is what keeps it narrow — a full new question
    // asked after a sharepic is not a follow-up, and its own heuristic verdict
    // (search/web/…) demotes it regardless of this branch.
    const isArtifactFollowup =
      state.lastToolContext != null && userContent.split(/\s+/).filter(Boolean).length <= 12;

    const selfContained =
      isVagueFollowup ||
      isArtifactFollowup ||
      looksLikeSelfContainedTurn(userContent, { hasOwnMaterial: turnCarriesOwnMaterial });

    // Das Chat-Recall-VETO ist weg, und zwar aus demselben Grund, aus dem es
    // existierte. Es hielt jede Formulierung aus dem RECALL-Gitter aus der
    // Demotion zurück, damit die LLM-Stufe entscheiden konnte, ob wirklich ein
    // früheres Gespräch gemeint war. Die Stufe ist gelöscht — ein Veto ohne Ziel
    // schickt seine Turns nicht mehr zu einem Entscheider, sondern ins Residual,
    // also in eine werkzeuglose Antwort.
    //
    // Gemessen: „Was war letzte Woche in der Ukraine los?" wurde damit zu
    // `produktion` — eine Nachrichtenfrage, aus dem Gedächtnis beantwortet.
    // Genau die Antwortform, gegen die diese Serie gebaut ist.
    //
    // Die eindeutigen Formulierungen sind längst vorher entschieden (Tier 3.4,
    // `CHAT_HISTORY_DIRECT`). Was hier ankommt, ist per Konstruktion das
    // MEHRDEUTIGE Band, und für das ist der Loop der bessere Ort als eine
    // Antwort ohne Werkzeug: er sieht den Verlauf, und wo wirklich Nachrichten
    // gefragt sind, kann er suchen.
    // Nothing is held back for a live source any more.
    //
    // `SYSTEM_MCP_PHRASING` used to park exactly these turns here so Tier 3.7
    // could ask a model WHICH source they meant, because the answer had to be a
    // single intent. It does not have to be one any more: the router's vocabulary
    // trigger names the connectors directly and opens the loop for them, so a
    // timetable question now takes the ordinary demotion path with its tools
    // already mounted. Holding it back would only delay that.
    // Der Schalter gilt nur für die eine der zwei Türen, und der Unterschied ist
    // der Preis der Demotion: sie TAUSCHT das Verdikt gegen `agentic`.
    //
    //  - Ein benanntes Abruf-Verdikt (`web`, `examples`, `bundestag`, …) kann
    //    `executeIntentPipeline` selbst ausführen. Mit ausgeschalteter Schleife
    //    wäre der Tausch also ein Verlust: der Entscheider fängt `agentic`
    //    pauschal mit `search` auf, aus einer Websuche würde eine Qdrant-Suche.
    //    Hier bleibt das Gate.
    //  - Ein Prosa-Verdikt hat nichts zu verlieren. `produktion` heisst „aus dem
    //    Gedächtnis antworten", und genau das ist die Antwortform, gegen die
    //    diese Stufe gebaut ist. Mit ausgeschalteter Schleife ist der Auffang
    //    auf `search` die bessere Antwort, nicht die schlechtere — deshalb
    //    demotiert diese Tür unabhängig vom Schalter.
    //
    // Vorher hing das Gate über beiden. Der Opt-out-Pfad sagte damit zweierlei
    // Verschiedenes zugleich: der Klassifikator liess einen abruf-förmigen Turn
    // bei `produktion`, während der `agentic_to_search`-Auffang des Entscheiders
    // für genau diesen Fall „dann such eben" vorsah und nie erreicht wurde.
    const demotable =
      (isAgenticLoopEnabled() && DEMOTABLE_HEURISTIC_INTENTS.has(heuristic.intent)) ||
      (NO_RETRIEVAL_VERDICTS.has(heuristic.intent) &&
        (looksLikeToolableQuestion(userContent) || unsourcedWriting || !selfContained));

    const demoteToLoop = (tier: 'tier3.5_loop_demotion') => {
      log.info(
        `[Classifier] Loop demotion (${tier}): heuristic ${heuristic.intent}@${effectiveConfidence.toFixed(2)} (< ${HEURISTIC_CONFIDENCE_THRESHOLD}, demotable) → agentic`
      );
      recordDecision('classifier.tier', tier, {
        inputs: {
          heuristicIntent: heuristic.intent,
          confidence: heuristic.confidence,
          effectiveConfidence,
          selfContained,
          demotable,
        },
      });
      const demoted: Partial<ChatGraphState> = {
        intent: 'agentic',
        // The heuristic named a retrieval intent outright (web/search/examples/
        // bundestag/…), as opposed to the `direct` + toolable-question case.
        // Recorded because demotion otherwise DISCARDS that verdict: the turn
        // goes to a planner that may call no tool at all, and "wer ist aktuell
        // Bundeskanzler in Österreich" (heuristic web@0.80) came back with
        // steps=0 and the honesty note itself as the user-facing answer.
        loopDemotedFromRetrieval: DEMOTABLE_HEURISTIC_INTENTS.has(heuristic.intent),
        searchSources: detectSearchSources(userContent, heuristic.intent),
        searchQuery: (heuristic.searchQuery ?? userContent).slice(0, 500),
        detectedFilters: heuristicExtractFilters(userContent),
        reasoning: `Loop demotion: heuristic ${heuristic.intent}@${effectiveConfidence.toFixed(2)} below threshold`,
        hasTemporal: temporal.hasTemporal,
        complexity,
        classificationTimeMs: Date.now() - startTime,
      };
      return demoted;
    };

    if (demotable) return demoteToLoop('tier3.5_loop_demotion');

    // Tier 3.7 stood here: a 900-ms model call that decided WHICH live source a
    // turn needed, because the answer had to be one intent. The router's
    // vocabulary trigger answers that now — with a list, deterministically, and
    // before the classifier runs. `sourceScopeResolver.ts` is deleted with it.
    //
    // What is genuinely gone is the policy-vs-data judgement that call made
    // ("Bahnreform" is not a departure board). It lives in the trigger's
    // trailing `(?!\p{L})` boundary now, which excludes those compounds by
    // construction — see managedSourceTrigger.ts and its test table.

    // ── TIER 3.8: generation scope ────────────────────────────────────────
    // The other half of what the big prompt was still being paid for. Placed at
    // its door for the same reason as Tier 3.7: Tier 4 is the only place these
    // verdicts were ever produced, so a resolver sitting in front of it has
    // exactly the prompt's reach and nothing can slip past that the prompt would
    // have caught. `GENERATION_SIGNAL` is the recall gate — a miss costs the 27k
    // prompt, a false positive costs one ~900-character call and lands here
    // anyway.
    //
    // A decided `keine` ends the turn as `produktion`: the model said there is
    // no artifact, and asking the tool taxonomy the same question again is what
    // this tier exists to stop. `null` (timeout/failure/garbage) falls through.
    // A PROHIBITION never reaches the resolver. `isNegatedArtifactRequest` already
    // KNOWS the answer, and letting a model re-decide it would trade a
    // deterministic guarantee for a probable one — on the one turn shape where
    // being wrong means minting the artifact the user forbade. Falling through
    // to Tier 4 also keeps the router's persistent-action gate in the path: it
    // only ever sees ARTIFACT intents, so an early `produktion` here would quietly
    // retire the gate instead of satisfying it.
    if (
      GENERATION_SIGNAL.test(userContent) &&
      !isNegatedArtifactRequest(userContent, GENERATION_SIGNAL)
    ) {
      const generation = await resolveGenerationScope({ userContent, conversationContext });
      if (generation !== null) {
        const resolvedIntent = generation === 'keine' ? 'produktion' : generation.intent;
        log.info(`[Classifier] Generation scope → ${resolvedIntent} (LLM tier skipped)`);
        recordDecision('classifier.tier', 'tier3.8_generation_scope', {
          inputs: { resolved: resolvedIntent, decidedNoArtifact: generation === 'keine' },
        });
        return {
          intent: resolvedIntent,
          searchSources: [],
          searchQuery: (extractSearchTopic(userContent) || userContent).slice(0, 500),
          detectedFilters: heuristicExtractFilters(userContent),
          reasoning:
            generation === 'keine'
              ? 'Kein Artefakt gefragt (deterministisch aufgelöst)'
              : `Artefakt erkannt: ${resolvedIntent}`,
          hasTemporal: temporal.hasTemporal,
          complexity,
          classificationTimeMs: Date.now() - startTime,
        };
      }
    }

    // ── RESIDUAL: no tier claimed the turn ────────────────────────────────
    // This is where the 27k-character CLASSIFIER_PROMPT used to sit. What it
    // was asked here, after every tier above had passed, was "nothing matched —
    // now what?", and it answered that with the entire tool taxonomy: a
    // hand-maintained second copy of the tool catalogue, re-deciding a question
    // the agentic planner decides again one step later.
    //
    // The verdict is the heuristic table's own, with one substitution. A
    // no-retrieval verdict down here is the table's RESIDUAL (`direct@0.50`
    // means "no rule fired"), not a finding — and every rescue predicate that
    // could turn it into a loop turn has already run and declined
    // (`looksLikeToolableQuestion`, `unsourcedWriting`, `looksLikeSelfContained
    // Turn`). So it is named for what it is: `produktion`, a self-contained
    // answer. Anything else the table produced (a low-confidence artifact or
    // gated verdict) stands — it found SOMETHING, just not confidently, and the
    // router's licence and negative-action gates are what check it.
    const residualIntent: SearchIntent = NO_RETRIEVAL_VERDICTS.has(heuristic.intent)
      ? 'produktion'
      : heuristic.intent;
    const classificationTimeMs = Date.now() - startTime;
    log.info(
      `[Classifier] Residual: heuristic ${heuristic.intent}@${effectiveConfidence.toFixed(2)} → ${residualIntent} in ${classificationTimeMs}ms`
    );
    recordDecision('classifier.tier', 'residual', {
      inputs: { heuristicIntent: heuristic.intent, resolved: residualIntent },
    });

    return {
      intent: residualIntent,
      searchSources: detectSearchSources(userContent, residualIntent),
      searchQuery: (heuristic.searchQuery ?? extractSearchTopic(userContent) ?? userContent).slice(
        0,
        500
      ),
      detectedFilters: heuristicExtractFilters(userContent),
      reasoning: `Kein Gitter beansprucht den Turn (Heuristik ${heuristic.intent}@${effectiveConfidence.toFixed(2)})`,
      hasTemporal: temporal.hasTemporal,
      complexity,
      classificationTimeMs,
      ...(heuristic.targetGroupName != null && { targetGroupName: heuristic.targetGroupName }),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[Classifier] Error:', errorMessage);

    // Fallback to heuristic classification
    const lastUserMessage = state.messages.filter((m) => m.role === 'user').pop();
    const userContent = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

    const fallbackResult = heuristicClassify(userContent, {
      hasTabularAttachment: state.hasTabularAttachment ?? false,
    });
    recordDecision('classifier.tier', 'error_fallback', {
      inputs: { fallbackIntent: fallbackResult.intent },
    });

    return {
      intent: fallbackResult.intent,
      searchSources: [],
      searchQuery: fallbackResult.searchQuery,
      detectedFilters: null,
      reasoning: `Heuristic fallback (error: ${errorMessage})`,
      hasTemporal: false,
      complexity: 'moderate' as const,
      classificationTimeMs: Date.now() - startTime,
      // The heuristic is a reasonable fallback, but it drops multi-source
      // search and metadata filters — a materially worse turn that was
      // previously indistinguishable from a normal one.
      classifierDegraded: true,
    };
  }
}

/**
 * Compact topic hint from the open document so the query optimizer can resolve
 * anaphora like "dieses Dokument" to a concrete subject. Heuristic only (no LLM)
 * — the classifier path is latency-sensitive. Caps the excerpt so it stays a
 * hint, not a full document dump.
 */
function extractDocumentTopicHint(
  currentDocument: NonNullable<ChatGraphState['currentDocument']>
): string {
  const excerpt = currentDocument.markdown
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → label text
    .replace(/[#>*_`~|-]/g, ' ') // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
  const title = currentDocument.title?.trim();
  if (title) return `"${title}" — ${excerpt}`;
  return excerpt || 'das geöffnete Dokument';
}

/**
 * Excerpt of an attachment's text for the query refiner. The typed user
 * message of an attachment turn often carries no topic at all ("Antworte auf
 * diese E-Mail: …") — the subject lives in the attachment. Mirrors
 * extractDocumentTopicHint, minus the markdown stripping (attachments arrive
 * as plain extracted text).
 */
function extractAttachmentTopicHint(attachmentContext: string): string {
  return attachmentContext.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * Compact topical hint for the query optimizer so anaphoric pronouns
 * ("dazu", "dies", "darüber", "dieses Dokument") can resolve to a concrete
 * subject. Skips `documentChat` — that anchor lives in its own classifier
 * branch above.
 */
function formatTopicalContext(state: ChatGraphState): string | null {
  const lines = getActiveAnchors(state).flatMap((a): string[] => {
    switch (a.kind) {
      case 'currentDocument':
        return state.currentDocument
          ? [
              `- Aktuell geöffnetes Dokument — Inhalt: "${extractDocumentTopicHint(state.currentDocument)}"`,
            ]
          : [];
      case 'documentMention':
        return [`- Referenzierte Dokumente: ${a.titles.map((t) => `"${t}"`).join(', ')}`];
      case 'board':
        return ['- Ein Board ist referenziert (siehe Boardkontext im Gespräch).'];
      case 'attachment':
        return ['- Hochgeladene Datei(en) liegen vor.'];
      case 'image':
        return [`- Bilder angehängt: ${a.names.join(', ')}`];
      case 'documentChat':
        return [];
    }
  });

  if (lines.length === 0) return null;
  return `Themenkontext (zur Auflösung von "dazu", "dies" etc.):\n${lines.join('\n')}`;
}

/**
 * Which of the thread's artifacts this turn is about.
 *
 * With at most one artifact the answer is `lastToolContext` and no model is
 * involved — that is the overwhelmingly common case and it stays free. The
 * resolver exists for the one shape a single slot cannot express: a thread that
 * made a document AND a sharepic, where `last_tool_context` remembers only the
 * newest and "kürze die Begründung auf die Hälfte" has no door back to the
 * document. `getLastSharepicVariant` reading a single message was the same class
 * of bug one level down.
 *
 * Two gates keep the call rare and cheap. The message must look like an edit
 * instruction at all — otherwise the answer is "keines" by construction and the
 * model adds nothing. And `null` (no pick, failure, timeout) falls back to
 * today's behaviour rather than to "no artifact": this function may only ever
 * REDIRECT a follow-up, never suppress one.
 */
async function pickThreadArtifact(
  state: ChatGraphState,
  userContent: string
): Promise<ChatGraphState['lastToolContext']> {
  const fallback = state.lastToolContext ?? null;
  const artifacts = state.threadArtifacts ?? [];
  if (artifacts.length < 2 || userContent.length === 0) return fallback;

  const looksReferential =
    DOC_MODIFY_PATTERN.test(userContent) ||
    hasImageEditVerb(userContent) ||
    isImageRegenRequest(userContent) ||
    isSharepicEditInstruction(userContent);
  if (!looksReferential) return fallback;

  const index = await resolveEditTarget({ userContent, artifacts });
  return index == null ? fallback : artifacts[index];
}

/**
 * Helper for the six near-identical "force search intent with LLM query
 * optimization" blocks: @dokumentchat, @document, @wolke, @connect, @notebook
 * and the attachment + default-notebook path.
 *
 * Everything that must hold for ALL forced-search turns belongs in HERE, not at
 * the call sites — a field set at one of the six is a field missing from five,
 * and the header used to count three, so the omission reads as complete.
 */
async function classifyWithForcedSearch(opts: {
  reason: string;
  docCount: number;
  userContent: string;
  conversationContext: string | null;
  topicalContext: string | null;
  temporal: { hasTemporal: boolean };
  complexity: 'simple' | 'moderate' | 'complex';
  startTime: number;
  gatherSources?: GatherSource[];
}): Promise<Partial<ChatGraphState>> {
  const {
    reason,
    docCount,
    userContent,
    conversationContext,
    topicalContext,
    temporal,
    complexity,
    startTime,
    gatherSources,
  } = opts;

  log.info(
    `[Classifier] ${reason} detected (${docCount} item(s)), forcing search intent with LLM query optimization${topicalContext ? ' + topical context' : ''}`
  );

  // The intent is already decided (forced to `search` below); the only open
  // question is WHAT to search for. That used to go through CLASSIFIER_PROMPT —
  // 27.6k characters of tool taxonomy to produce a search string, whose intent
  // verdict was then discarded by the hardcoded `intent: 'search'`.
  //
  // Of the six fields the old call kept, two are load-bearing here and both
  // survive: `searchQuery` and `subQueries` come from the resolver,
  // `detectedFilters` from the deterministic heuristic the catch branch already
  // used. `documentSubtype` and `targetGroupName` are read only by document-
  // CREATION and share paths, which a forced-search turn never reaches.
  //
  // `documentSubtype` was briefly set here, so that a search turn could tell
  // respondNode which Textsorte it owed. It is gone again because the noun it
  // detects answers "did the user SAY this word", not "did the user ORDER it" —
  // and on these six paths the retrieval phrasing is the common one: "was steht
  // in der Pressemitteilung", "fasse den Antrag zusammen". A note built on that
  // tells the model to WRITE the thing it was asked to FIND. The ordered form
  // now hangs on the recipe instead (`getOrderedTextFormNote` in respondNode),
  // which carries its own negation/meta/transformation guards.
  //
  // `secondaryIntent` is the one real behaviour change: it is now always null
  // here, so these turns stop being kicked out of the agentic loop by
  // `decideRunAgentic`'s secondary kill-switch. A document/notebook turn now
  // reaches the loop, where the model can actually call the retrieval tools.
  const refined = await refineSearchQuery({ userContent, conversationContext, topicalContext });
  const optimizedQuery = refined?.query || extractSearchTopic(userContent) || userContent;

  log.info(
    `[Classifier] ${reason}: query "${userContent.slice(0, 50)}" → "${optimizedQuery}"${
      refined ? '' : ' (heuristic fallback)'
    }`
  );

  return {
    intent: 'search',
    searchSources: [],
    searchQuery: optimizedQuery,
    subQueries: refined?.subQueries ?? null,
    detectedFilters: heuristicExtractFilters(userContent),
    reasoning: refined
      ? `${reason} forces search intent; query refined`
      : `${reason} forces search intent (refine unavailable, heuristic fallback)`,
    hasTemporal: temporal.hasTemporal,
    complexity,
    classificationTimeMs: Date.now() - startTime,
    ...(gatherSources ? { gatherSources } : {}),
  };
}

// Re-export all test-facing symbols for backward compatibility
export {
  heuristicClassify,
  fuzzyMatchIntent,
  extractSearchTopic,
  extractMessageText,
  formatConversationHistory,
  looksMultiTopic,
  INTENT_KEYWORDS,
  HEURISTIC_CONFIDENCE_THRESHOLD,
  detectContentType,
} from './classifierHeuristics.js';

export type { HeuristicResult } from './classifierHeuristics.js';

export { heuristicExtractFilters, LANDESVERBAND_ALIASES } from './classifierFilters.js';

export { detectComplexity, detectSearchSources } from './classifierSignals.js';
