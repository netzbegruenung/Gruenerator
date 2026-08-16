/**
 * The turn's intent, as decided by the @-mentions and the notebook selection.
 *
 * Runs right after the classifier and before any handler branch: a mention is
 * an explicit pick and outranks the classifier's verdict. Every branch either
 * pins `classifiedState.intent` or leaves it alone; `forcedTool` records that a
 * pin happened, which later gates read as "the user chose this deliberately".
 *
 * Also resolves the FLUX edit-prompt style and rehydrates the thread's last
 * generated image for an attachment-less `image_edit` — both are part of the
 * same question ("what is this turn, and with what input?").
 */

import { promises as fsPromises } from 'node:fs';
import nodePath from 'node:path';

import { isIntentAllowedForLocale, type ChatIntentId } from '@gruenerator/shared/chat-intents';

import { createLogger } from '../../../utils/logger.js';
import { extractCompoundTopic } from '../services/compoundTopicExtractor.js';
import { resolveReferentialQuery } from '../services/referentialTopic.js';
import { PROGRESS_MESSAGES, type SSEWriter } from '../services/sseHelpers.js';
import { getLastGeneratedImageUrl } from '../services/threadPersistenceService.js';

import { type InitialState, type StreamBody } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';

const log = createLogger('chatGraphContractRouter');

export interface ForcedIntentStageParams {
  sse: SSEWriter;
  classifiedState: ChatGraphState;
  initialState: InitialState;
  notebookIds: string[];
  agentId: StreamBody['agentId'];
  /** Durable mention tokens merged with the legacy body field — undefined when
   *  the turn carried none, which every branch here treats as "no pick". */
  forcedTools: string[] | undefined;
  lastUserTextNoMentions: string;
  lastUserMessage: StreamContext['lastUserMessage'];
  /** Mutated in place by the image rehydration below, exactly as the handler
   *  did — `classifiedState.imageAttachments` points at the same array. */
  imageAttachments: StreamContext['imageAttachments'];
  actualThreadId: string | undefined;
}

export interface ForcedIntentStageResult {
  /** Notebook(s) plus a named agent — drives topic extraction, the
   *  `compound_start` event and the search-class tool priority. */
  isCompound: boolean;
  /** An @-mention pinned the intent. Read downstream as "explicit user pick". */
  forcedTool: boolean;
  /** @bildbearbeiten: image_edit with the universal (non-branded) style. */
  universalEditForced: boolean;
}

export async function runForcedIntentStage({
  sse,
  classifiedState,
  initialState,
  notebookIds,
  agentId,
  forcedTools,
  lastUserTextNoMentions,
  lastUserMessage,
  imageAttachments,
  actualThreadId,
}: ForcedIntentStageParams): Promise<ForcedIntentStageResult> {
  let forcedTool = false;

  // === Compound query detection ===
  const isCompound = notebookIds.length > 0 && !!agentId && agentId !== 'gruenerator-universal';
  classifiedState.isCompound = isCompound;

  if (isCompound) {
    log.info(
      `[ChatGraph] Compound query detected: notebooks=[${notebookIds.join(',')}], agent=${agentId}`
    );

    if (!classifiedState.searchQuery) {
      // Remove-form: "@Label" fragments are self-referential query noise.
      classifiedState.searchQuery = extractCompoundTopic(lastUserTextNoMentions, notebookIds);
      log.info(`[ChatGraph] Compound topic extracted: "${classifiedState.searchQuery}"`);
    }

    const gatherSources = classifiedState.gatherSources?.length
      ? classifiedState.gatherSources
      : ['notebook-search' as const];
    classifiedState.gatherSources = gatherSources;

    sse.send('compound_start', {
      stages: gatherSources,
      message: PROGRESS_MESSAGES.compoundStart(gatherSources.length),
    });
  }

  // @bildbearbeiten is an alias for image_edit intent with explicit universal
  // style — distinct identifier so @stadtbegruenen can keep its green-edit
  // branding while @bildbearbeiten signals free-form editing.
  const universalEditForced = !!forcedTools?.includes('image_edit_universal');
  if (universalEditForced) {
    classifiedState.intent = 'image_edit';
    forcedTool = true;
    log.info('[ChatGraph] Intent forced to "image_edit" via @bildbearbeiten mention');
  }

  // @abgeordnetenwatch hard-pins the German MP transparency intent. It is not
  // part of TOOL_PRIORITY (that list is search/image/sharepic tools), so it's
  // resolved here. DE-only source: for de-AT users, ignore the force and keep
  // the classifier's (already downgraded) intent so we never fetch empty data.
  const abgeordnetenwatchForced = !!forcedTools?.includes('abgeordnetenwatch');
  if (
    abgeordnetenwatchForced &&
    isIntentAllowedForLocale('abgeordnetenwatch', initialState.userLocale)
  ) {
    classifiedState.intent = 'abgeordnetenwatch';
    forcedTool = true;
    // The classifier may have returned a non-search intent (e.g. 'direct')
    // and left searchQuery empty — pull the user's message in as the query.
    if ((!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) && lastUserMessage) {
      const userText = lastUserTextNoMentions.trim();
      if (userText) classifiedState.searchQuery = userText;
    }
    log.info('[ChatGraph] Intent forced to "abgeordnetenwatch" via @abgeordnetenwatch mention');
  }

  // @bundestag hard-pins the DIP document/speech intent — same rules as
  // @abgeordnetenwatch above (not in TOOL_PRIORITY, DE-only source).
  const bundestagForced = !!forcedTools?.includes('bundestag');
  if (bundestagForced && isIntentAllowedForLocale('bundestag', initialState.userLocale)) {
    classifiedState.intent = 'bundestag';
    forcedTool = true;
    if ((!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) && lastUserMessage) {
      const userText = lastUserTextNoMentions.trim();
      if (userText) classifiedState.searchQuery = userText;
    }
    log.info('[ChatGraph] Intent forced to "bundestag" via @bundestag mention');
  }

  // @doku hard-pins the documentation intent. Not in TOOL_PRIORITY (that
  // list is the search/image/sharepic family), so it is resolved here. Not
  // locale-gated: the docs describe the product itself and apply to DE and
  // AT alike. The searchQuery backfill matters more here than for the
  // sources above — the docs tool searches the user's text verbatim, so an
  // empty query would search nothing at all.
  if (forcedTools?.includes('hilfe')) {
    classifiedState.intent = 'hilfe';
    forcedTool = true;
    if ((!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) && lastUserMessage) {
      const userText = lastUserTextNoMentions.trim();
      if (userText) classifiedState.searchQuery = userText;
    }
    log.info('[ChatGraph] Intent forced to "hilfe" via @doku mention');
  }

  // @umfragen hard-pins the poll intent — same shape as @doku above, and for
  // the same reason: without this branch the mention put `umfragen` into
  // forcedTools and then fell through EVERY resolver (it is in neither
  // TOOL_PRIORITY nor createRoutes nor a branch of its own), so the turn
  // depended entirely on the classifier happening to pick `umfragen` by
  // itself — the silent no-op the `hilfe` comment above warns about.
  // Not locale-gated: PolitPro covers the Austrian parliaments too.
  if (forcedTools?.includes('umfragen')) {
    classifiedState.intent = 'umfragen';
    forcedTool = true;
    if ((!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) && lastUserMessage) {
      const userText = lastUserTextNoMentions.trim();
      if (userText) classifiedState.searchQuery = userText;
    }
    log.info('[ChatGraph] Intent forced to "umfragen" via @umfragen mention');
  }

  // A per-server mention (@notion/@brevo) arrives as `mcp:<serverId>` and
  // scopes the tool-loop to that one server. Bare `mcp` (legacy @mcp tokens in
  // old threads; no mention emits it anymore) still runs unscoped over all
  // enabled servers for back-compat. Not in TOOL_PRIORITY, so resolved here;
  // the forced flag lets the loop run even if enabledTools.mcp is off, and
  // the agentic mcpCatalog no-ops safely when the user has no servers.
  const mcpScopedToken = forcedTools?.find((t) => t.startsWith('mcp:'));
  const mcpForced = !!forcedTools?.includes('mcp') || !!mcpScopedToken;
  if (mcpForced) {
    classifiedState.intent = 'mcp';
    classifiedState.mcpServerScope = mcpScopedToken ? mcpScopedToken.slice(4) : null;
    forcedTool = true;
    log.info('[ChatGraph] Intent forced to "mcp" via mention', {
      scope: classifiedState.mcpServerScope ?? 'all',
    });
  }

  // Mentions whose forced tool IS the intent name and whose only extra need
  // is a query backfill — the shape `hilfe` and `umfragen` spell out above.
  // Kept as a table rather than seven more if-blocks; anything needing a
  // locale gate, a scope or a style variant stays an explicit branch.
  //
  // The pipeline each one reaches differs (`examples` and
  // `pressemitteilung_examples` run in the search node, the rest in the
  // loop), but forcing the intent is the same act for all of them.
  //
  // `wetter` was in this table and carried an availability guard with it —
  // a forced mention had to clear the same bar the classifier applied, or it
  // bypassed the degrade. Both are gone: `@wetter` is now a connector
  // mention (`mcp:system-wetter`), handled by the scoped-MCP branch above,
  // and the availability question is answered at the mount.
  const SIMPLE_FORCED_INTENTS = [
    'examples',
    'pressemitteilung_examples',
    'chat_history',
    'social_post',
    'chart',
    'compute',
  ] as const satisfies readonly ChatIntentId[];
  for (const candidate of SIMPLE_FORCED_INTENTS) {
    if (!forcedTools?.includes(candidate)) continue;
    if (!isIntentAllowedForLocale(candidate, initialState.userLocale)) continue;
    classifiedState.intent = candidate;
    forcedTool = true;
    if ((!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) && lastUserMessage) {
      const userText = lastUserTextNoMentions.trim();
      if (userText) classifiedState.searchQuery = userText;
    }
    log.info(`[ChatGraph] Intent forced to "${candidate}" via @-mention`);
    break;
  }

  // @deepresearch — a VARIANT of `research`, routed like one, but the only
  // token that authorises Linkup's `sourcedAnswer` endpoint. It is not in
  // TOOL_PRIORITY below (and must not be: it is not a competing tool), so the
  // block after this one leaves the intent alone.
  //
  // `explicitDeepRequest` is set too: whichever way the turn ends up going —
  // quota free or quota spent — asking for a dossier is by definition asking
  // for depth, so the fallback lands on `tiefenrecherche` rather than being
  // clamped back to `gruendlich`.
  if (forcedTools?.includes('deepresearch')) {
    classifiedState.intent = 'research';
    classifiedState.deepResearchRequested = true;
    classifiedState.explicitDeepRequest = true;
    forcedTool = true;
    if ((!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) && lastUserMessage) {
      const userText = lastUserTextNoMentions.trim();
      if (userText) {
        // Same referential trap as the forced-search branch below: "recherchier
        // das mal gründlich" taken verbatim becomes the research question, and
        // Linkup answers about the sentence instead of the topic.
        const resolved = resolveReferentialQuery(userText, classifiedState.messages ?? []);
        classifiedState.searchQuery = resolved.query;
        classifiedState.searchQueryInherited = resolved.inherited;
      }
    }
    log.info(
      `[ChatGraph] @deepresearch mention — intent forced to "research", deep-research path requested`
    );
  }

  if (forcedTools && forcedTools.length > 0) {
    const searchClassTools = ['research', 'web', 'search'];
    const hasSearchTool = forcedTools.some((t) => searchClassTools.includes(t));

    const TOOL_PRIORITY =
      isCompound && hasSearchTool
        ? (['research', 'web', 'search', 'sharepic', 'image', 'image_edit', 'summary'] as const)
        : (['sharepic', 'image', 'image_edit', 'summary', 'research', 'web', 'search'] as const);

    const forced = TOOL_PRIORITY.find((t) => forcedTools.includes(t));
    if (forced && !universalEditForced) {
      // The merged "Recherche" tool (identifier 'research', alias
      // 'websearch') forces *search-class* without pinning a depth: keep the
      // classifier's web↔research choice (auto-depth) and only fall back to
      // research when it picked a non-search intent. Document search
      // ('search') and non-search tools (image/sharepic/…) stay hard-pinned.
      if (forced === 'research' || forced === 'web') {
        if (classifiedState.intent !== 'web' && classifiedState.intent !== 'research') {
          classifiedState.intent = 'research';
        }
      } else {
        classifiedState.intent = forced;
      }
      forcedTool = true;
      log.info(
        `[ChatGraph] Intent forced via @tool mention: forced="${forced}", resolved="${classifiedState.intent}"`
      );

      // When the classifier returned a non-search intent (e.g. 'direct')
      // and the @-mention forces a search intent, the classifier never
      // populated searchQuery — the orchestrator would then run on an
      // empty question and the planner LLM hallucinates topics from
      // context. Pull the user's last message text in as the query.
      const FORCED_SEARCH_INTENTS = new Set(['research', 'web', 'search']);
      if (
        FORCED_SEARCH_INTENTS.has(classifiedState.intent) &&
        (!classifiedState.searchQuery || !classifiedState.searchQuery.trim()) &&
        lastUserMessage
      ) {
        const userText = lastUserTextNoMentions.trim();
        if (userText) {
          // A referential ask ("Ja, bitte recherchiere das jetzt im Web")
          // carries no subject: taken verbatim it BECAME the research query
          // and Linkup answered about the sentence, not the topic.
          const resolved = resolveReferentialQuery(userText, classifiedState.messages ?? []);
          classifiedState.searchQuery = resolved.query;
          classifiedState.searchQueryInherited = resolved.inherited;
          log.info(
            `[ChatGraph] searchQuery populated from last user message for forced ${forced}${
              resolved.inherited ? ' (topic inherited from prior turn)' : ''
            }: "${resolved.query.slice(0, 60)}"`
          );
        }
      }
    }
  }

  // Resolve which FLUX edit-prompt builder imageEditNode should use.
  // @stadtbegruenen (forcedTools includes 'image_edit') → green-urban branded;
  // @bildbearbeiten (forcedTools includes 'image_edit_universal') → universal;
  // auto-detected image_edit from heuristics → universal.
  if (classifiedState.intent === 'image_edit') {
    const greenEditMentionForced = !!forcedTools?.includes('image_edit') && !universalEditForced;
    classifiedState.imageEditStyle = greenEditMentionForced ? 'green-edit' : 'universal';
    log.info(
      `[ChatGraph] image_edit style resolved to "${classifiedState.imageEditStyle}" (greenEditForced=${greenEditMentionForced}, universalForced=${universalEditForced})`
    );
  }

  // image_edit without an attachment: rehydrate the thread's last generated
  // image as the edit input ("mach es blauer" after a generation turn) —
  // without this the edit node errors with "Bitte hänge ein Bild an".
  // Only local flux results are eligible (strict path shape, no traversal).
  if (classifiedState.intent === 'image_edit' && imageAttachments.length === 0 && actualThreadId) {
    const lastUrl = await getLastGeneratedImageUrl(actualThreadId).catch(() => null);
    const m = lastUrl?.match(/^\/uploads\/(flux\/results\/[\w.-]+\/[\w.-]+)$/);
    if (m?.[1]) {
      try {
        const filePath = nodePath.join(process.cwd(), 'uploads', m[1]);
        const data = await fsPromises.readFile(filePath);
        imageAttachments.push({
          name: nodePath.basename(filePath),
          type: 'image/jpeg',
          data: data.toString('base64'),
        });
        classifiedState.imageAttachments = imageAttachments;
        log.info('[ChatGraph] Rehydrated previous generated image for image_edit');
      } catch (err) {
        log.warn(
          `[ChatGraph] Could not rehydrate previous image (${err instanceof Error ? err.message : err})`
        );
      }
    }
  }
  return { isCompound, forcedTool, universalEditForced };
}
