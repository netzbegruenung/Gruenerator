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

import {
  artifactKindForCreateToken,
  isIntentAllowedForLocale,
  pinnedToolForMention,
  skillForMention,
  type ChatIntentId,
} from '@gruenerator/shared/chat-intents';

import { createLogger } from '../../../utils/logger.js';
import { extractCompoundTopic } from '../services/compoundTopicExtractor.js';
import { resolveReferentialQuery } from '../services/referentialTopic.js';
import { PROGRESS_MESSAGES, type SSEWriter } from '../services/sseHelpers.js';
import { getLastGeneratedImageUrl } from '../services/threadPersistenceService.js';

import { type InitialState, type StreamBody } from './types.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { StreamContext } from '../services/streamContext.js';

const log = createLogger('chatGraphContractRouter');

/** Was eine Zeile der Tabelle unten vom laufenden Turn wissen muss. */
interface PinContext {
  forcedTools: string[] | undefined;
  /** `mcp:<serverId>`, einmal gesucht statt je Zeile. */
  mcpScopedToken: string | undefined;
  classifiedState: ChatGraphState;
}

interface PinRoute {
  /**
   * Der `forcedTools`-Token, den diese Zeile erkennt, und zugleich der
   * Schlüssel, unter dem die Registry ihren Werkzeug-Pin führt. Default: der
   * Intent-Name — die beiden fallen nur auseinander, wenn eine Erwähnung einen
   * stillgelegten Intent überlebt hat (`@umfragen` → Intent `agentic`).
   */
  token?: string;
  intent: ChatIntentId;
  /**
   * Der Intent, dessen Locale-Zielgruppe das Gitter fragt. Default: `intent`.
   * Getrennt aus demselben Grund wie `token`: nach einer Stilllegung sagt der
   * ausführende Intent (`agentic`, immer `'all'`) nichts mehr über die Reichweite
   * der Quelle, die die Erwähnung meint.
   */
  localeIntent?: ChatIntentId;
  /** Erkennt den Token. Default: der Intent-Name selbst. */
  matches?: (ctx: PinContext) => boolean;
  /** Sonderfelder, die dieser Eintrag ausser dem Intent setzt. */
  onPin?: (ctx: PinContext) => void;
  /** Strukturierte Felder für die Logzeile dieses Eintrags. */
  logContext?: (ctx: PinContext) => Record<string, unknown>;
  /** `mcp` als einziger: sein Werkzeug bekommt die Frage aus dem Verlauf. */
  backfillQuery?: false;
  /**
   * Exklusive Gruppe — der erste Treffer gewinnt, spätere Mitglieder ruhen.
   * Die Gruppe hält das `break` der alten `SIMPLE_FORCED_INTENTS`-Schleife
   * fest: `@beispiele @diagramm` ergibt `examples`, nicht `chart`.
   */
  group?: 'simple';
}

/**
 * Die Erwähnungen, deren ganzer Effekt „diesen Intent festzurren" ist — als
 * EINE Tabelle statt als Kette gleichförmiger if-Blöcke, von denen jeder
 * denselben Nachtrag der Suchanfrage nochmal ausschrieb. Keiner von ihnen
 * steht in `TOOL_PRIORITY` unten (das ist die Such-/Bild-/Sharepic-Familie),
 * deshalb werden sie hier aufgelöst.
 *
 * **Die Reihenfolge ist Verhalten, nicht Kosmetik.** Ein Turn kann mehrere
 * Erwähnungen tragen; jeder Treffer überschreibt den vorherigen, der LETZTE
 * gewinnt. `@notion @beispiele` ergibt deshalb `examples` — mit gesetztem
 * `mcpServerScope`. Wer eine Zeile verschiebt, ändert genau solche Fälle.
 *
 * Das Locale-Gitter läuft für ALLE Zeilen. Für die meisten ist es ein
 * No-op (`audience: 'all'`); für die beiden DE-only-Quellen ist es der
 * Grund, warum ein AT-Turn beim herabgestuften Verdikt des Klassifikators
 * bleibt, statt leere Daten abzurufen.
 *
 * `wetter` stand in dieser Tabelle und trug eine Verfügbarkeitsprüfung mit
 * sich — eine erzwungene Erwähnung musste dieselbe Latte reissen wie der
 * Klassifikator, sonst umging sie die Degradierung. Beides ist weg:
 * `@wetter` ist heute eine Konnektor-Erwähnung (`mcp:system-wetter`) und
 * läuft über die `mcp`-Zeile, und die Verfügbarkeitsfrage wird an der
 * Montage beantwortet.
 */
const PIN_ROUTES: readonly PinRoute[] = [
  { intent: 'abgeordnetenwatch' },
  { intent: 'bundestag' },
  { intent: 'hilfe' },
  /**
   * `@umfragen` — der erste Eintrag, dessen Intent stillgelegt ist.
   *
   * Die Zeile bleibt, weil der Token bleibt: er steht in ausgelieferten
   * Composern und in jedem persistierten `@[Umfragen](tool:umfragen)` alter
   * Threads (F0). Was sich ändert, ist nur, worauf er zeigt — nicht mehr auf das
   * Verdikt `umfragen`, sondern über die Registry (`pinsTool`) auf das
   * gleichnamige LOOP-WERKZEUG. `agentic` heisst hier „kein Intent trägt diesen
   * Turn"; genau daran erkennt `turnPlan`, dass ihn nur die Schleife ausführen
   * kann.
   */
  { token: 'umfragen', intent: 'agentic', localeIntent: 'umfragen' },
  {
    intent: 'mcp',
    matches: (ctx) => !!ctx.forcedTools?.includes('mcp') || !!ctx.mcpScopedToken,
    // Das erzwungene Flag lässt die Schleife auch laufen, wenn
    // `enabledTools.mcp` aus ist; der agentische mcpCatalog ist ein
    // sicherer No-op, wenn die Person keine Server verbunden hat.
    onPin: (ctx) => {
      ctx.classifiedState.mcpServerScope = ctx.mcpScopedToken ? ctx.mcpScopedToken.slice(4) : null;
    },
    logContext: (ctx) => ({ scope: ctx.classifiedState.mcpServerScope ?? 'all' }),
    backfillQuery: false,
  },
  { intent: 'examples', group: 'simple' },
  /**
   * `@pressemitteilungen`/`@pm` — dieselbe Bauform wie `@umfragen`, plus das
   * Rezept. Der Token bleibt (persistiert als `tool:pressemitteilung_examples`),
   * er zeigt nur woandershin: `pinsTool` auf das PM-Beispiel-Werkzeug,
   * `activatesSkill` auf `presse`. Die Textsorte kam nie aus dem Intent.
   *
   * Bleibt in der `simple`-Gruppe: `@pm @beispiele` ergibt weiterhin PM, nicht
   * Social — die Gruppe entscheidet das, nicht die Zeilenreihenfolge.
   */
  {
    token: 'pressemitteilung_examples',
    intent: 'agentic',
    localeIntent: 'pressemitteilung_examples',
    group: 'simple',
  },
  { intent: 'chat_history', group: 'simple' },
  { intent: 'social_post', group: 'simple' },
  { intent: 'chart', group: 'simple' },
  { intent: 'compute', group: 'simple' },
];

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

  // The classifier may have returned a non-search intent (e.g. 'direct') and
  // left searchQuery empty — pull the user's message in as the query. It
  // matters most for `hilfe`, whose docs tool searches the text verbatim: an
  // empty query would search nothing at all.
  const backfillSearchQuery = (): void => {
    if (classifiedState.searchQuery && classifiedState.searchQuery.trim()) return;
    if (!lastUserMessage) return;
    const userText = lastUserTextNoMentions.trim();
    if (userText) classifiedState.searchQuery = userText;
  };

  // A per-server mention (@notion/@brevo) arrives as `mcp:<serverId>` and
  // scopes the tool-loop to that one server. Bare `mcp` (legacy @mcp tokens in
  // old threads; no mention emits it anymore) still runs unscoped over all
  // enabled servers for back-compat.
  const pinContext: PinContext = {
    forcedTools,
    mcpScopedToken: forcedTools?.find((t) => t.startsWith('mcp:')),
    classifiedState,
  };

  const firedGroups = new Set<string>();
  for (const route of PIN_ROUTES) {
    if (route.group && firedGroups.has(route.group)) continue;
    const token = route.token ?? route.intent;
    const matched = route.matches
      ? route.matches(pinContext)
      : forcedTools?.includes(token) === true;
    if (!matched) continue;
    if (!isIntentAllowedForLocale(route.localeIntent ?? route.intent, initialState.userLocale))
      continue;
    classifiedState.intent = route.intent;
    // Was die Person GEWÄHLT hat — `intent` allein sagt das nicht, ein Verdikt
    // des Klassifikators sieht dort genauso aus. Der Loop nennt damit seinen
    // ersten Werkzeugaufruf beim Namen und lässt den Turn überhaupt erst hinein.
    //
    // Unbedingt zugewiesen, auch wenn die Registry für diesen Token nichts
    // führt: bei mehreren Erwähnungen gewinnt die LETZTE, und eine Erwähnung
    // ohne eigenes Werkzeug muss den Pin der vorherigen damit auch löschen.
    classifiedState.mentionPinnedTool = pinnedToolForMention(token);
    // Das Rezept dagegen NUR setzen, nie löschen und nie überschreiben: es kann
    // aus der ausdrücklichen Wahl im Composer stammen (`/presse`, `/instagram`),
    // und die gehört nicht einer Erwähnung, die zufällig danach steht.
    const skill = skillForMention(token);
    if (skill && !classifiedState.activeSkillMention) classifiedState.activeSkillMention = skill;
    forcedTool = true;
    if (route.group) firedGroups.add(route.group);
    route.onPin?.(pinContext);
    if (route.backfillQuery !== false) backfillSearchQuery();
    const context = route.logContext?.(pinContext);
    if (context) log.info(`[ChatGraph] Intent forced to "${route.intent}" via @-mention`, context);
    else log.info(`[ChatGraph] Intent forced to "${route.intent}" via @-mention`);
  }

  // Die fünf `@…-erstellen`-Token. Sie stehen ABSICHTLICH nicht in der Tabelle
  // oben: `forcedTool` würde den Turn auf die direkte Erstellroute zwingen, und
  // ein Verbund („recherchiere X und mach eine Tabelle daraus") soll gerade
  // durch die Schleife gehen. Was gefehlt hat, ist die ART — ohne sie leitet
  // `turnPlan` sie neu aus dem Substantiv im Text ab, und `@sheet-erstellen`
  // ergab eine Tabelle nur, solange das Wort „Tabelle" auch dastand.
  //
  // Wie in der Tabelle gewinnt die LETZTE Erwähnung; der Suchbegriff wird NICHT
  // nachgefüllt (die Erstellrouten lesen den Text selbst).
  for (const token of forcedTools ?? []) {
    const kind = artifactKindForCreateToken(token);
    if (kind) classifiedState.mentionPinnedArtifactKind = kind;
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
    // Diese Erwähnung war das letzte Wort — ein Werkzeug-Pin aus der Tabelle
    // oben ist damit nicht mehr gemeint. (Vorher tat das die Prüfung
    // `pinned !== intent` in `pinnedFirstTool`; seit der Pin ein Werkzeugname
    // ist und nicht mehr der Intent, muss der Löschende sagen, dass er löscht.)
    classifiedState.mentionPinnedTool = null;
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
      // Wie beim @deepresearch-Zweig: die Such-/Bild-/Sharepic-Familie
      // überschreibt den Intent, also ist ein Werkzeug-Pin von oben überholt.
      // `@umfragen @recherche` heisst Recherche, nicht PolitPro.
      //
      // Seit dem Lane-Flip (Phase R3) LÖSCHT diese Zeile nicht mehr nur, sie
      // setzt auch: die Suchfamilie läuft in der Schleife, und dort ist der
      // Erwähnungstext für das Modell entfernt — ohne Pin griffe es zur
      // generischen Suche statt zu der Quelle, die die Person gewählt hat. Was
      // gepinnt wird, steht an der Erwähnung (`IntentMention.pinsTool`), nicht
      // hier. Für jeden anderen Token der Prioritätenliste (sharepic, image,
      // summary …) liefert die Registry `null`, die Zeile löscht dort also
      // weiterhin genau wie vorher.
      //
      // Ein Token `web` (nur noch aus alten Threads — die Erwähnung dafür gibt
      // es nicht) bleibt ohne Pin: die Registry führt für ihn keine Erwähnung.
      // Der Turn geht trotzdem in die Schleife, dort wählt der Planer.
      classifiedState.mentionPinnedTool = pinnedToolForMention(forced);
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
