/**
 * Agentic tool loop for sharepic edits (v1 — scoped to the Sharepic-Modus).
 *
 * Same entry contract as handleSharepicEdit, but instead of one tool-forced
 * structured call the model drives a small multi-step loop via the AI SDK
 * (`streamText` + tools + stopWhen): it can read fresh state, apply several
 * operation batches and restore versions within ONE chat turn, self-correcting
 * on rejected ops. Enabled via CHAT_TOOL_LOOP=true; the router falls back to
 * the single-call path when the flag is off (see chat-tool-loop-plan.md).
 *
 * Guard rails: hard step cap, per-tool failure cap, duplicate-call detection,
 * overall timeout. Tool results stay compact — full state travels via the
 * existing `sharepic_updated` SSE events only.
 */
import {
  buildSharepicSnapshot,
  buildSliderDeckSnapshotLines,
  getSharepicTemplateDescriptor,
} from '@gruenerator/contracts';
import { streamText, tool, stepCountIs, type ModelMessage } from 'ai';
import { z } from 'zod';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import {
  applyCanvasStatePatch,
  applyDeckChanges,
  getCurrentCanvasState,
  getCurrentDeckState,
  type CanvasPageDef,
} from '../../../services/canvas/canvasStateService.js';
import {
  getCanvasVersion,
  insertCanvasVersion,
  listCanvasVersions,
} from '../../../services/canvas/canvasVersionRepository.js';
import { createLogger } from '../../../utils/logger.js';
import { getModel } from '../agents/providers.js';

import {
  applyOpsInputSchema,
  applySliderOpsInputSchema,
  createLoopGuards,
  restoreInputSchema,
} from './sharepicAgenticGuards.js';
import {
  buildOperationCatalog,
  buildSliderDeckOperationCatalog,
  buildSnapshotLines,
} from './sharepicEditLlm.js';
import {
  applySharepicOpsToCanvas,
  applySliderOpsToDeck,
  ensureMintedCanvas,
  resolveTarget,
  type HandleSharepicEditArgs,
} from './sharepicEditService.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

const log = createLogger('SharepicAgentic');

/** LLM steps per turn (each tool round trip is one step). */
const MAX_STEPS = 4;
const TURN_TIMEOUT_MS = 90_000;

export function isChatToolLoopEnabled(): boolean {
  return process.env.CHAT_TOOL_LOOP === 'true';
}

function resolveLoopModel(): { provider: string; modelName: string } {
  return {
    provider: process.env.CHAT_TOOL_LOOP_PROVIDER || 'mistral',
    modelName: process.env.CHAT_TOOL_LOOP_MODEL || 'mistral-medium-2604',
  };
}

/**
 * Last assistant reply of the thread, truncated. Instructions like "setze
 * Vorschlag 1 ein" reference text the assistant JUST suggested — without it
 * the loop model has nothing to insert.
 */
async function getPriorAssistantText(threadId: string): Promise<string | null> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT content FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant'
     ORDER BY created_at DESC LIMIT 1`,
    [threadId]
  )) as Array<{ content: string | null }>;
  const content = rows[0]?.content?.trim();
  if (!content) return null;
  return content.length > 4000 ? `${content.slice(0, 4000)}…` : content;
}

interface PersistedStep {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

function buildLoopSystemPrompt(args: {
  descriptor: NonNullable<ReturnType<typeof getSharepicTemplateDescriptor>>;
  snapshotLines: string[];
  recentEditSummaries: string[];
  isDeck: boolean;
}): string {
  const { descriptor, snapshotLines, recentEditSummaries, isDeck } = args;
  const applyTool = isDeck ? 'apply_slider_ops' : 'apply_sharepic_ops';
  const readTool = isDeck ? 'read_slider_deck' : 'read_sharepic_state';
  const artifact = isDeck ? 'Folien-Karussell' : 'Sharepic';
  const lines: string[] = [
    `Du bist der Bearbeitungs-Assistent für ${isDeck ? 'Instagram-Karussells' : 'Sharepics'} der deutschen Grünen.`,
    `Der*die Nutzer*in beschreibt gewünschte Änderungen am aktuellen ${artifact}.`,
    'Du setzt sie mit deinen Tools um und bestätigst danach kurz im Chat.',
    '',
    'Sprachregeln: Du-Form, Genderstern (z.B. "Bürger*innen"), prägnante Kampagnen-Texte.',
    '',
    `Vorlage: ${descriptor.label} (${descriptor.id})`,
    '',
    'Aktueller Inhalt:',
    ...snapshotLines,
  ];

  if (recentEditSummaries.length > 0) {
    lines.push('', 'Letzte Änderungen (neueste zuerst):');
    for (const s of recentEditSummaries) lines.push(`- ${s}`);
  }

  lines.push(
    '',
    ...(isDeck ? buildSliderDeckOperationCatalog(descriptor) : buildOperationCatalog(descriptor)),
    '',
    'ARBEITSWEISE:',
    `- Setze Änderungen SOFORT mit "${applyTool}" um. Stelle KEINE Rückfragen und beschreibe keine Entwürfe im Chat — bei Spielraum (z.B. "Text kürzen") entscheide selbst und formuliere kampagnentauglich.`,
    '- Fasse zusammengehörige Operationen in EINEN Aufruf.',
    `- Bestätigt der*die Nutzer*in einen früheren Vorschlag ("ja", "mach das so"), wende GENAU diesen Vorschlag aus der vorigen Antwort jetzt mit "${applyTool}" an.`,
    '- Wird eine Operation abgelehnt (rejected), korrigiere sie EINMAL mit angepassten Werten.',
    `- "${readTool}" nur, wenn du den aktuellen Zustand wirklich brauchst (z.B. nach Ablehnungen).`,
    '- "restore_version" nur auf ausdrücklichen Wunsch ("zurück zur vorherigen Version").',
    `- Du hast maximal ${MAX_STEPS} Schritte. Antworte am Ende IMMER mit 1–2 freundlichen Sätzen auf Deutsch.`,
    '- Ändere NUR, was verlangt wurde. Nutze nur die gelisteten Felder, IDs und Werte.',
    '- Bezieht sich die Nachricht auf Texte aus der vorigen Antwort ("setz das ein", "nimm Vorschlag 2"), übernimm sie sinngemäß in die passenden Felder — kürze auf die Feldlängen der Vorlage.',
    `- NUR wenn die Nachricht erkennbar nichts mit dem ${artifact} zu tun hat, antworte ohne Tool-Aufruf kurz im Chat.`
  );

  if (isDeck) {
    lines.push(
      '',
      'KARUSSELL-REGELN:',
      '- Slides sind 1-basiert nummeriert: Slide 1 = Cover, letzte Slide = Abschluss.',
      '- "Folie"/"Seite"/"Slide" + Zahl bezeichnet die Slide-Nummer aus dem Snapshot oben.',
      '- Das Farbschema gilt immer für das ganze Karussell, nie für einzelne Folien.'
    );
  }

  return lines.join('\n');
}

/**
 * Run a sharepic edit turn as an agentic tool loop. Same return semantics as
 * handleSharepicEdit: true = turn handled (stream closed), false = caller
 * falls through to the next branch.
 */
export async function handleSharepicAgenticEdit(args: HandleSharepicEditArgs): Promise<boolean> {
  const { sse, req, threadId, userId, instruction, currentSharepic, aiWorkerPool } = args;

  try {
    const target = await resolveTarget(threadId, currentSharepic);
    if (!target) return false;

    if (target === 'ambiguous') {
      await endTurn(
        args,
        [],
        'Welche Variante soll ich bearbeiten? Aktiviere auf der gewünschten Karte "Im Chat bearbeiten" und schick mir die Änderung dann noch einmal.'
      );
      return true;
    }

    const descriptor = getSharepicTemplateDescriptor(target.canvasType);
    if (!descriptor) {
      log.info(`[Agentic] No descriptor for canvasType=${target.canvasType} — falling back`);
      return false;
    }

    const isDeck = Boolean(descriptor.deck);

    sse.send('progress_step', {
      stepId: `sharepic_agentic_${Date.now()}`,
      toolName: 'sharepic_edit',
      title: isDeck ? 'Bearbeite Karussell…' : 'Bearbeite Sharepic…',
      status: 'in_progress',
    });

    const canvasId = await ensureMintedCanvas({ target, threadId, userId, sse });

    let deckPages: CanvasPageDef[] = [];
    if (isDeck) {
      deckPages = (await getCurrentDeckState(canvasId)).pages;
      if (deckPages.length === 0) {
        await endTurn(
          args,
          [],
          'Ich finde die Folien dieses Karussells gerade nicht. Öffne es einmal im Studio oder versuch es gleich noch einmal.'
        );
        return true;
      }
    }

    const current = isDeck ? null : await getCurrentCanvasState(canvasId);
    const initialMergedState = {
      ...descriptor.defaultState,
      ...target.initialProps,
      ...(current?.state ?? {}),
    };

    const recentEditSummaries = (await listCanvasVersions(canvasId))
      .filter((v) => v.origin !== 'mint' && v.summary)
      .slice(0, 2)
      .map((v) => v.summary as string);

    // Mutable per-turn context — apply/restore update `state`/`pages` so later
    // steps (and the read tools) see their own effects without a DB round trip.
    const ctx = { state: initialMergedState, pages: deckPages };
    const guards = createLoopGuards();
    const steps: PersistedStep[] = [];

    const recordStep = (
      toolCallId: string,
      toolName: string,
      input: Record<string, unknown>,
      result: Record<string, unknown>
    ) => {
      steps.push({ toolCallId, toolName, args: input, result });
    };

    const sharepicTools = {
      read_sharepic_state: tool({
        description:
          'Liest den aktuellen Zustand des Sharepics (Texte, Farben, Elemente). Nutze dies nach abgelehnten Operationen oder wenn du unsicher über den Ist-Zustand bist.',
        inputSchema: z.object({}),
        execute: async (_input, { toolCallId }) => {
          const fresh = await getCurrentCanvasState(canvasId);
          ctx.state = { ...descriptor.defaultState, ...target.initialProps, ...fresh.state };
          const snapshot = buildSharepicSnapshot(descriptor, ctx.state);
          recordStep(toolCallId, 'read_sharepic_state', {}, { ok: true });
          return { snapshot: buildSnapshotLines(snapshot).join('\n') };
        },
      }),

      apply_sharepic_ops: tool({
        description:
          'Wendet 1–8 Operationen auf das Sharepic an (Texte, Schriftgrößen, Farben, Elemente, Hintergrundbild-Suche). Operationen werden validiert; abgelehnte kommen mit Begründung zurück.',
        inputSchema: applyOpsInputSchema,
        execute: async (input, { toolCallId }) => {
          const guardError =
            guards.checkFailureCap('apply_sharepic_ops') ??
            guards.checkDuplicate('apply_sharepic_ops', input);
          if (guardError) return { error: guardError };

          const outcome = await applySharepicOpsToCanvas({
            canvasId,
            variantId: target.variantId,
            canvasType: target.canvasType,
            descriptor,
            state: ctx.state,
            operations: input.operations,
            summary: input.summary,
            userId,
            sse,
            aiWorkerPool,
            req,
          });

          if (!outcome.ok) {
            guards.noteFailure('apply_sharepic_ops');
            recordStep(
              toolCallId,
              'apply_sharepic_ops',
              { summary: input.summary },
              {
                ok: false,
                reason: outcome.reason,
              }
            );
            return {
              error: `Keine Änderung angewendet: ${outcome.reason}`,
              rejected: outcome.rejected,
            };
          }

          ctx.state = outcome.newState;
          recordStep(
            toolCallId,
            'apply_sharepic_ops',
            { summary: input.summary },
            {
              canvasId,
              variantId: target.variantId,
              version: outcome.version,
              summary: input.summary,
              canvasType: target.canvasType,
            }
          );
          return {
            version: outcome.version,
            applied: outcome.appliedKinds,
            ...(outcome.rejected.length > 0 ? { rejected: outcome.rejected } : {}),
          };
        },
      }),

      restore_version: tool({
        description:
          'Stellt eine frühere Version des Sharepics wieder her (als neue Version, nichts geht verloren). Nur auf ausdrücklichen Nutzer*innen-Wunsch.',
        inputSchema: restoreInputSchema,
        execute: async (input, { toolCallId }) => {
          const guardError =
            guards.checkFailureCap('restore_version') ??
            guards.checkDuplicate('restore_version', input);
          if (guardError) return { error: guardError };

          const snapshot = await getCanvasVersion(canvasId, input.version);
          if (!snapshot) {
            guards.noteFailure('restore_version');
            recordStep(toolCallId, 'restore_version', input, { ok: false, reason: 'not_found' });
            return { error: `Version ${input.version} existiert nicht.` };
          }
          // Forward patch — never rewinds Yjs history (same as the REST restore).
          await applyCanvasStatePatch(canvasId, snapshot.state, { seedState: snapshot.state });
          const newVersion = await insertCanvasVersion({
            canvasId,
            state: snapshot.state,
            summary: `Version ${snapshot.version} wiederhergestellt`,
            origin: 'restore',
            userId,
          });
          ctx.state = { ...ctx.state, ...snapshot.state };
          sse.send('sharepic_updated', {
            variantId: target.variantId,
            canvasId,
            version: newVersion,
            canvasType: target.canvasType,
            state: snapshot.state,
            summary: `Version ${snapshot.version} wiederhergestellt`,
          });
          recordStep(toolCallId, 'restore_version', input, {
            canvasId,
            variantId: target.variantId,
            version: newVersion,
            canvasType: target.canvasType,
          });
          return { version: newVersion, restoredFrom: snapshot.version };
        },
      }),
    };

    const isPageDefArray = (v: unknown): v is CanvasPageDef[] =>
      Array.isArray(v) &&
      v.every(
        (p) =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as CanvasPageDef).id === 'string' &&
          typeof (p as CanvasPageDef).state === 'object'
      );

    const deckTools = {
      read_slider_deck: tool({
        description:
          'Liest den aktuellen Zustand aller Folien des Karussells. Nutze dies nach abgelehnten Operationen oder wenn du unsicher über den Ist-Zustand bist.',
        inputSchema: z.object({}),
        execute: async (_input, { toolCallId }) => {
          const fresh = await getCurrentDeckState(canvasId);
          if (fresh.pages.length > 0) ctx.pages = fresh.pages;
          recordStep(toolCallId, 'read_slider_deck', {}, { ok: true });
          return { snapshot: buildSliderDeckSnapshotLines(descriptor, ctx.pages).join('\n') };
        },
      }),

      apply_slider_ops: tool({
        description:
          'Wendet 1–6 Deck-Operationen auf das Karussell an (Folien-Texte/-Schriftgrößen ändern, Farbschema deck-weit wechseln, Folien hinzufügen/entfernen). Operationen werden validiert; abgelehnte kommen mit Begründung zurück.',
        inputSchema: applySliderOpsInputSchema,
        execute: async (input, { toolCallId }) => {
          const guardError =
            guards.checkFailureCap('apply_slider_ops') ??
            guards.checkDuplicate('apply_slider_ops', input);
          if (guardError) return { error: guardError };

          const outcome = await applySliderOpsToDeck({
            canvasId,
            variantId: target.variantId,
            descriptor,
            pages: ctx.pages,
            operations: input.operations,
            summary: input.summary,
            userId,
            sse,
          });

          if (!outcome.ok) {
            guards.noteFailure('apply_slider_ops');
            recordStep(
              toolCallId,
              'apply_slider_ops',
              { summary: input.summary },
              { ok: false, reason: outcome.reason }
            );
            return {
              error: `Keine Änderung angewendet: ${outcome.reason}`,
              rejected: outcome.rejected,
            };
          }

          ctx.pages = outcome.newPages;
          recordStep(
            toolCallId,
            'apply_slider_ops',
            { summary: input.summary },
            {
              canvasId,
              variantId: target.variantId,
              version: outcome.version,
              summary: input.summary,
              canvasType: target.canvasType,
            }
          );
          return {
            version: outcome.version,
            applied: outcome.appliedKinds,
            slideCount: ctx.pages.length,
            ...(outcome.rejected.length > 0 ? { rejected: outcome.rejected } : {}),
          };
        },
      }),

      restore_version: tool({
        description:
          'Stellt eine frühere Version des Karussells wieder her (als neue Version, nichts geht verloren). Nur auf ausdrücklichen Nutzer*innen-Wunsch.',
        inputSchema: restoreInputSchema,
        execute: async (input, { toolCallId }) => {
          const guardError =
            guards.checkFailureCap('restore_version') ??
            guards.checkDuplicate('restore_version', input);
          if (guardError) return { error: guardError };

          const snapshot = await getCanvasVersion(canvasId, input.version);
          const restoredPages = snapshot ? (snapshot.state as { pages?: unknown }).pages : null;
          if (!snapshot || !isPageDefArray(restoredPages) || restoredPages.length === 0) {
            guards.noteFailure('restore_version');
            recordStep(toolCallId, 'restore_version', input, { ok: false, reason: 'not_found' });
            return { error: `Version ${input.version} existiert nicht oder ist kein Karussell.` };
          }
          await applyDeckChanges(canvasId, {
            seedPages: ctx.pages,
            replacePages: restoredPages,
            newPages: restoredPages,
          });
          const newVersion = await insertCanvasVersion({
            canvasId,
            state: { pages: restoredPages },
            summary: `Version ${snapshot.version} wiederhergestellt`,
            origin: 'restore',
            userId,
          });
          ctx.pages = restoredPages;
          sse.send('sharepic_updated', {
            variantId: target.variantId,
            canvasId,
            version: newVersion,
            canvasType: target.canvasType,
            pages: restoredPages.map((p) => p.state),
            summary: `Version ${snapshot.version} wiederhergestellt`,
          });
          recordStep(toolCallId, 'restore_version', input, {
            canvasId,
            variantId: target.variantId,
            version: newVersion,
            canvasType: target.canvasType,
          });
          return { version: newVersion, restoredFrom: snapshot.version };
        },
      }),
    };

    const tools = isDeck ? deckTools : sharepicTools;

    const { provider, modelName } = resolveLoopModel();
    const system = buildLoopSystemPrompt({
      descriptor,
      snapshotLines: isDeck
        ? buildSliderDeckSnapshotLines(descriptor, ctx.pages)
        : buildSnapshotLines(buildSharepicSnapshot(descriptor, ctx.state)),
      recentEditSummaries,
      isDeck,
    });

    let text = '';
    let responseStarted = false;

    const priorAssistantText = await getPriorAssistantText(threadId);
    const messages: ModelMessage[] = [
      ...(priorAssistantText ? [{ role: 'assistant' as const, content: priorAssistantText }] : []),
      { role: 'user' as const, content: instruction },
    ];

    const result = streamText({
      model: getModel(provider, modelName),
      system,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      temperature: 0.2,
      maxOutputTokens: 800,
      abortSignal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    });

    // Manual iteration — fullStream is a ReadableStream whose async-iterator
    // protocol the lint type info doesn't see (same pattern as
    // responseStreamingService).
    const iterator = result.fullStream[Symbol.asyncIterator]();
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const part = next.value;
      if (part.type === 'error') throw part.error;
      if (part.type === 'tool-call') {
        sse.send('tool_step_start', {
          stepId: part.toolCallId,
          toolName: part.toolName,
          args: (part.input ?? {}) as Record<string, unknown>,
        });
      } else if (part.type === 'tool-result') {
        const output = (part.output ?? {}) as Record<string, unknown>;
        const ok = !('error' in output);
        sse.send('tool_step_result', {
          stepId: part.toolCallId,
          toolName: part.toolName,
          ok,
          ...(typeof output.error === 'string'
            ? { summary: output.error }
            : typeof output.version === 'number'
              ? { summary: `Version ${output.version}` }
              : {}),
        });
      } else if (part.type === 'text-delta' && part.text.length > 0) {
        if (!responseStarted) {
          responseStarted = true;
          sse.send('response_start', { message: 'Antwort wird erstellt...' });
        }
        text += part.text;
        sse.send('text_delta', { text: part.text });
      }
    }

    // A model that only called tools still owes the user a confirmation.
    if (text.trim().length === 0) {
      const lastApply = [...steps]
        .reverse()
        .find((s) => s.toolName === 'apply_sharepic_ops' || s.toolName === 'apply_slider_ops');
      text =
        typeof lastApply?.args.summary === 'string'
          ? `Erledigt: ${lastApply.args.summary}.`
          : 'Ich konnte daraus keine Änderung ableiten. Magst du es konkreter beschreiben?';
      sse.send('response_start', { message: 'Antwort wird erstellt...' });
      sse.send('text_delta', { text });
    }

    await endTurn(args, steps, text, { streamed: true });
    log.info(`[Agentic] Turn done on ${canvasId}: ${steps.length} tool step(s)`);
    return true;
  } catch (error) {
    log.error('[Agentic] Turn failed:', error);
    if (!sse.isEnded()) {
      sse.send('sharepic_edit_error', {
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });
      await endTurn(
        args,
        [],
        'Bei der Bearbeitung ist etwas schiefgelaufen. Versuch es bitte noch einmal.'
      );
    }
    return true;
  }
}

/** Persist the assistant message (with all tool steps), emit done, close SSE. */
async function endTurn(
  args: HandleSharepicEditArgs,
  steps: PersistedStep[],
  text: string,
  opts?: { streamed?: boolean }
): Promise<void> {
  const { sse, threadId } = args;
  if (!opts?.streamed) {
    sse.send('response_start', { message: 'Antwort wird erstellt...' });
    sse.send('text_delta', { text });
  }
  sse.sendRaw('done', {
    threadId,
    citations: [],
    metadata: {
      intent: 'sharepic_edit',
      searchCount: 0,
      totalTimeMs: Date.now() - args.startTime,
      ...(args.classificationTimeMs != null && {
        classificationTimeMs: args.classificationTimeMs,
      }),
      searchTimeMs: 0,
    },
  });
  try {
    await createMessage(threadId, 'assistant', text, {
      intent: 'sharepic_edit',
      ...(steps.length > 0 ? { toolCalls: steps as unknown as Record<string, unknown>[] } : {}),
    });
    await touchThread(threadId);
  } catch (err) {
    log.error('[Agentic] Failed to persist message:', err);
  }
  sse.end();
}
