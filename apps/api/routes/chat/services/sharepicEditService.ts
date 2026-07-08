/**
 * sharepic_edit intent: full natural-language editing of a chat-generated
 * sharepic ("Zeile 2 kürzer", "anderes Hintergrundbild", "Balken nach oben").
 *
 * Flow per edit turn:
 *   resolve target variant → lazy-mint canvas document (first edit only) →
 *   fetch fresh state (Yjs-aware) → one tool-forced LLM call → validate ops
 *   against the template descriptor → resolve stock-image queries → apply
 *   patch via canvasStateService (live-broadcasts into open studio tabs) →
 *   version snapshot → SSE `sharepic_updated` → persist a compact tool result.
 *
 * Context discipline: the thread only ever stores `{ canvasId, variantId,
 * version, summary, canvasType }` per edit — current state is re-fetched
 * fresh each turn and travels to the client via SSE only.
 */
import {
  buildSharepicSnapshot,
  getSharepicTemplateDescriptor,
  sharepicOpsToStatePatch,
  sliderDeckOpsToPagePatches,
  type CanvasAiOperation,
  type SharepicTemplateDescriptor,
  type SliderDeckOperation,
} from '@gruenerator/contracts';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createCanvas } from '../../../services/canvas/canvasRepository.js';
import {
  applyCanvasStatePatch,
  applyDeckChanges,
  getCurrentCanvasState,
  seedCanvasFormState,
  type CanvasPageDef,
} from '../../../services/canvas/canvasStateService.js';
import {
  insertCanvasVersion,
  listCanvasVersions,
} from '../../../services/canvas/canvasVersionRepository.js';
import imagePickerService from '../../../services/image/ImageSelectionService.js';
import { createLogger } from '../../../utils/logger.js';

import { runSharepicEdit } from './sharepicEditLlm.js';
import { createMessage, touchThread } from './threadPersistenceService.js';

import type { SharepicVariant } from './sharepicVariantHelpers.js';
import type { SSEWriter } from './sseHelpers.js';
import type { AIWorkerPool } from '../../../workers/types.js';

const log = createLogger('SharepicEdit');

export { isSharepicEditInstruction } from './sharepicEditHeuristics.js';

interface ThreadCanvasRow {
  variant_id: string;
  canvas_id: string;
  canvas_type: string;
  is_active: boolean;
}

interface VariantHit {
  variant: SharepicVariant & { canvasId?: string };
  messageId: string;
}

async function listThreadCanvases(threadId: string): Promise<ThreadCanvasRow[]> {
  const pg = getPostgresInstance();
  return (await pg.query(
    `SELECT variant_id, canvas_id, canvas_type, is_active
     FROM chat_thread_canvases WHERE thread_id = $1
     ORDER BY updated_at DESC`,
    [threadId]
  )) as ThreadCanvasRow[];
}

/**
 * Walk recent assistant messages and find sharepic variants — either the one
 * matching `variantId`, or the variants of the most recent sharepic message.
 */
async function findVariants(
  threadId: string,
  variantId: string | null
): Promise<{ hits: VariantHit[]; latestMessageVariantCount: number }> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT id, tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT 30`,
    [threadId]
  )) as Array<{ id: string; tool_results: unknown }>;

  const hits: VariantHit[] = [];
  let latestMessageVariantCount = 0;
  for (const row of rows) {
    const meta = (
      typeof row.tool_results === 'string' ? JSON.parse(row.tool_results) : row.tool_results
    ) as { toolCalls?: Array<{ toolName?: string; result?: { variants?: unknown[] } }> } | null;
    const sharepicCall = meta?.toolCalls?.find((tc) => tc?.toolName === 'sharepic');
    const variants = (sharepicCall?.result?.variants ?? []) as Array<
      SharepicVariant & { canvasId?: string }
    >;
    if (variants.length === 0) continue;

    if (latestMessageVariantCount === 0) latestMessageVariantCount = variants.length;
    for (const v of variants) {
      if (variantId == null || v.id === variantId) {
        hits.push({ variant: v, messageId: row.id });
      }
    }
    if (variantId != null && hits.length > 0) break;
    if (variantId == null && hits.length > 0) break;
  }
  return { hits, latestMessageVariantCount };
}

/** Stamp `canvasId` onto the persisted variant so thread reloads see it. */
async function attachCanvasIdToMessage(
  messageId: string,
  variantId: string,
  canvasId: string
): Promise<void> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(`SELECT tool_results FROM chat_messages WHERE id = $1`, [
    messageId,
  ])) as Array<{ tool_results: unknown }>;
  const raw = rows[0]?.tool_results;
  if (!raw) return;
  const meta = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
    toolCalls?: Array<{ toolName?: string; result?: { variants?: Array<{ id?: string }> } }>;
  };
  let changed = false;
  for (const tc of meta.toolCalls ?? []) {
    if (tc?.toolName !== 'sharepic') continue;
    for (const v of tc.result?.variants ?? []) {
      if (v?.id === variantId) {
        (v as { canvasId?: string }).canvasId = canvasId;
        changed = true;
      }
    }
  }
  if (changed) {
    await pg.query(`UPDATE chat_messages SET tool_results = $2 WHERE id = $1`, [
      messageId,
      JSON.stringify(meta),
    ]);
  }
}

async function setActiveThreadCanvas(threadId: string, variantId: string): Promise<void> {
  const pg = getPostgresInstance();
  await pg.query(
    `UPDATE chat_thread_canvases
     SET is_active = (variant_id = $2), updated_at = CURRENT_TIMESTAMP
     WHERE thread_id = $1`,
    [threadId, variantId]
  );
}

function deriveCanvasTitle(canvasType: string, props: Record<string, unknown>): string {
  const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const text = s(props.line1) || s(props.quote) || s(props.header) || '';
  const base = text.length > 60 ? `${text.slice(0, 57)}…` : text;
  return base || 'Sharepic aus dem Chat';
}

export interface ResolvedTarget {
  variantId: string;
  canvasId: string | null;
  canvasType: string;
  /** Props of the original variant; mint seed when canvasId is null. */
  initialProps: Record<string, unknown>;
  /** Message holding the variant (for canvasId stamping at mint). */
  messageId: string | null;
}

/**
 * Decide which variant the instruction targets:
 * explicit selection → active/known canvas row → sole variant of the last
 * sharepic message. Returns 'ambiguous' when several variants exist and
 * nothing is selected, null when the thread has no sharepic at all.
 */
export async function resolveTarget(
  threadId: string,
  currentSharepic: {
    variantId: string;
    canvasId?: string | null | undefined;
    canvasType: string;
  } | null
): Promise<ResolvedTarget | 'ambiguous' | null> {
  const rows = await listThreadCanvases(threadId);

  if (currentSharepic) {
    const row = rows.find((r) => r.variant_id === currentSharepic.variantId);
    if (row) {
      return {
        variantId: row.variant_id,
        canvasId: row.canvas_id,
        canvasType: row.canvas_type,
        initialProps: {},
        messageId: null,
      };
    }
    const { hits } = await findVariants(threadId, currentSharepic.variantId);
    const hit = hits[0];
    if (hit) {
      return {
        variantId: hit.variant.id,
        canvasId: hit.variant.canvasId ?? null,
        canvasType: hit.variant.canvasType,
        initialProps: hit.variant.initialProps ?? {},
        messageId: hit.messageId,
      };
    }
    return null;
  }

  const active = rows.find((r) => r.is_active) ?? rows[0];
  if (active) {
    return {
      variantId: active.variant_id,
      canvasId: active.canvas_id,
      canvasType: active.canvas_type,
      initialProps: {},
      messageId: null,
    };
  }

  const { hits, latestMessageVariantCount } = await findVariants(threadId, null);
  if (hits.length === 0) return null;
  if (latestMessageVariantCount > 1) return 'ambiguous';
  const hit = hits[0];
  return {
    variantId: hit.variant.id,
    canvasId: hit.variant.canvasId ?? null,
    canvasType: hit.variant.canvasType,
    initialProps: hit.variant.initialProps ?? {},
    messageId: hit.messageId,
  };
}

/** Existing canvas bound to (thread, variant), or null. */
async function findBoundCanvas(threadId: string, variantId: string): Promise<string | null> {
  const pg = getPostgresInstance();
  const rows = (await pg.query(
    `SELECT canvas_id FROM chat_thread_canvases WHERE thread_id = $1 AND variant_id = $2`,
    [threadId, variantId]
  )) as Array<{ canvas_id: string }>;
  return rows[0]?.canvas_id ?? null;
}

/** Upsert the (thread, variant) → canvas binding. */
async function bindThreadCanvas(
  threadId: string,
  variantId: string,
  canvasId: string,
  canvasType: string
): Promise<void> {
  const pg = getPostgresInstance();
  await pg.query(
    `INSERT INTO chat_thread_canvases (thread_id, variant_id, canvas_id, canvas_type, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (thread_id, variant_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
    [threadId, variantId, canvasId, canvasType]
  );
}

export interface MintVariantResult {
  canvasId: string;
  /** true only when this call created the canvas (SSE / logging cue). */
  minted: boolean;
}

/**
 * The single mint path shared by the chat-edit flow (`ensureMintedCanvas`) and
 * the studio-open endpoint (`POST /api/canvas/from-variant`). Idempotent on the
 * `chat_thread_canvases (thread_id, variant_id)` binding, so both entry points
 * converge on ONE canvas per variant and can never diverge. A newly created
 * canvas is authoritatively Yjs-seeded from `{...defaultState, ...initialProps}`
 * (lossless, race-free) BEFORE any studio tab opens.
 */
export async function mintCanvasForVariant(args: {
  userId: string;
  threadId: string;
  variantId: string;
  canvasType: string;
  initialProps: Record<string, unknown>;
  /** Message holding the variant, for canvasId stamping; null in the endpoint. */
  messageId: string | null;
  /** Pre-resolved canvasId (decks minted at generation); null to look it up. */
  existingCanvasId: string | null;
}): Promise<MintVariantResult> {
  const { userId, threadId, variantId, canvasType, initialProps, messageId } = args;

  const existing = args.existingCanvasId ?? (await findBoundCanvas(threadId, variantId));
  if (existing) {
    await bindThreadCanvas(threadId, variantId, existing, canvasType);
    await setActiveThreadCanvas(threadId, variantId);
    return { canvasId: existing, minted: false };
  }

  const descriptor = getSharepicTemplateDescriptor(canvasType);
  const initialState = { ...(descriptor?.defaultState ?? {}), ...initialProps };
  const canvas = await createCanvas(userId, {
    title: deriveCanvasTitle(canvasType, initialProps),
    template_type: canvasType,
    initial_state: initialState,
  });
  // Authoritative server-side Yjs seed (full state + `_seeded` watermark).
  await seedCanvasFormState(canvas.id, initialState);
  await bindThreadCanvas(threadId, variantId, canvas.id, canvasType);
  await insertCanvasVersion({
    canvasId: canvas.id,
    state: initialState,
    summary: 'Aus dem Chat erstellt',
    origin: 'mint',
    userId,
  });
  if (messageId) {
    await attachCanvasIdToMessage(messageId, variantId, canvas.id);
  }
  await setActiveThreadCanvas(threadId, variantId);
  log.info(`[SharepicMint] Minted canvas ${canvas.id} for variant ${variantId}`);
  return { canvasId: canvas.id, minted: true };
}

/**
 * Lazy mint from the chat-edit flow: first edit turns the variant into a real
 * canvas document. Delegates to the shared `mintCanvasForVariant` and emits the
 * `sharepic_minted` SSE on a fresh mint.
 */
export async function ensureMintedCanvas(args: {
  target: ResolvedTarget;
  threadId: string;
  userId: string;
  sse: SSEWriter;
}): Promise<string> {
  const { target, threadId, userId, sse } = args;
  const { canvasId, minted } = await mintCanvasForVariant({
    userId,
    threadId,
    variantId: target.variantId,
    canvasType: target.canvasType,
    initialProps: target.initialProps,
    messageId: target.messageId,
    existingCanvasId: target.canvasId,
  });
  if (minted) {
    sse.send('sharepic_minted', { variantId: target.variantId, canvasId });
  }
  return canvasId;
}

export type ApplySharepicOpsOutcome =
  | {
      ok: true;
      version: number;
      newState: Record<string, unknown>;
      appliedKinds: string[];
      rejected: Array<{ kind: string; reason: string }>;
    }
  | { ok: false; reason: string; rejected: Array<{ kind: string; reason: string }> };

/**
 * Core of an edit: validate ops against the descriptor, resolve stock-image
 * queries, apply the patch (live-broadcasts into open studio tabs), snapshot
 * a version and emit `sharepic_updated`. Shared by the single-call edit path
 * and the agentic tool loop.
 */
export async function applySharepicOpsToCanvas(args: {
  canvasId: string;
  variantId: string;
  canvasType: string;
  descriptor: SharepicTemplateDescriptor;
  state: Record<string, unknown>;
  operations: CanvasAiOperation[];
  summary: string;
  userId: string;
  sse: SSEWriter;
  aiWorkerPool: AIWorkerPool;
  req?: unknown;
}): Promise<ApplySharepicOpsOutcome> {
  const { canvasId, variantId, canvasType, descriptor, state, operations, summary, userId, sse } =
    args;

  const opsResult = sharepicOpsToStatePatch(descriptor, operations, state);

  // Resolve stock-photo queries server-side (dreizeilen background).
  if (opsResult.imageQueries.length > 0 && descriptor.backgroundImage) {
    try {
      const selection = await imagePickerService.selectBestImage(
        opsResult.imageQueries[0],
        args.aiWorkerPool,
        { sharepicType: descriptor.id },
        args.req
      );
      const filename = selection.selectedImage.filename;
      opsResult.patch[descriptor.backgroundImage.stateKey] =
        `/api/image-picker/stock-image/${encodeURIComponent(filename)}`;
      opsResult.patch.hasBackgroundImage = true;
    } catch (err) {
      log.warn(`[SharepicEdit] Image selection failed: ${err}`);
    }
  }

  const rejected = opsResult.rejected.map((r) => ({ kind: r.op.kind, reason: r.reason }));
  if (rejected.length > 0) {
    log.warn(
      `[SharepicEdit] Rejected ops: ${rejected.map((r) => `${r.kind}: ${r.reason}`).join(' | ')}`
    );
  }

  if (Object.keys(opsResult.patch).length === 0) {
    return {
      ok: false,
      reason: rejected[0]?.reason ?? 'Keine anwendbare Änderung',
      rejected,
    };
  }

  const newState = { ...state, ...opsResult.patch };
  await applyCanvasStatePatch(canvasId, opsResult.patch, { seedState: newState });
  const version = await insertCanvasVersion({
    canvasId,
    state: newState,
    summary,
    origin: 'chat-edit',
    userId,
  });

  sse.send('sharepic_updated', {
    variantId,
    canvasId,
    version,
    canvasType,
    state: newState,
    summary,
  });

  log.info(
    `[SharepicEdit] Applied v${version} on ${canvasId} (${operations.length} op(s): ${operations
      .map((o) => o.kind)
      .join(', ')})`
  );

  return {
    ok: true,
    version,
    newState,
    appliedKinds: opsResult.applied.map((o) => o.kind),
    rejected,
  };
}

export type ApplySliderOpsOutcome =
  | {
      ok: true;
      version: number;
      newPages: CanvasPageDef[];
      appliedKinds: string[];
      rejected: Array<{ kind: string; reason: string }>;
    }
  | { ok: false; reason: string; rejected: Array<{ kind: string; reason: string }> };

/**
 * Deck sibling of `applySharepicOpsToCanvas`: validate deck ops, write
 * pageId-addressed patches / page ops through the Hocuspocus internal API
 * (live-broadcasts into open studio tabs), snapshot a `{ pages }` version
 * and emit `sharepic_updated` with the full page set.
 */
export async function applySliderOpsToDeck(args: {
  canvasId: string;
  variantId: string;
  descriptor: SharepicTemplateDescriptor;
  pages: CanvasPageDef[];
  operations: SliderDeckOperation[];
  summary: string;
  userId: string;
  sse: SSEWriter;
}): Promise<ApplySliderOpsOutcome> {
  const { canvasId, variantId, descriptor, pages, operations, summary, userId, sse } = args;

  const result = sliderDeckOpsToPagePatches(descriptor, operations, pages);
  const rejected = result.rejected.map((r) => ({ kind: r.op.kind, reason: r.reason }));
  if (rejected.length > 0) {
    log.warn(
      `[SliderDeck] Rejected ops: ${rejected.map((r) => `${r.kind}: ${r.reason}`).join(' | ')}`
    );
  }

  if (result.pagePatches.length === 0 && result.pageOps.length === 0) {
    return {
      ok: false,
      reason: rejected[0]?.reason ?? 'Keine anwendbare Änderung',
      rejected,
    };
  }

  await applyDeckChanges(canvasId, {
    // Always sent: re-seeds decks whose mint ran while Hocuspocus was down.
    seedPages: pages,
    pagePatches: result.pagePatches,
    pageOps: result.pageOps,
    newPages: result.newPages,
  });

  const version = await insertCanvasVersion({
    canvasId,
    state: { pages: result.newPages },
    summary,
    origin: 'chat-edit',
    userId,
  });

  sse.send('sharepic_updated', {
    variantId,
    canvasId,
    version,
    canvasType: descriptor.id,
    pages: result.newPages.map((p) => p.state),
    summary,
  });

  log.info(
    `[SliderDeck] Applied v${version} on ${canvasId} (${operations.length} op(s): ${operations
      .map((o) => o.kind)
      .join(', ')}, ${result.newPages.length} pages)`
  );

  return {
    ok: true,
    version,
    newPages: result.newPages,
    appliedKinds: result.applied.map((o) => o.kind),
    rejected,
  };
}

export interface HandleSharepicEditArgs {
  sse: SSEWriter;
  req: unknown;
  threadId: string;
  userId: string;
  instruction: string;
  currentSharepic: {
    variantId: string;
    canvasId?: string | null | undefined;
    canvasType: string;
  } | null;
  aiWorkerPool: AIWorkerPool;
  startTime: number;
  classificationTimeMs?: number;
}

/** Stream a fixed reply, persist it, and close the turn. */
async function finishWithText(
  args: HandleSharepicEditArgs,
  text: string,
  toolCalls?: Record<string, unknown>[]
): Promise<void> {
  const { sse, threadId } = args;
  sse.send('response_start', { message: 'Antwort wird erstellt...' });
  sse.send('text_delta', { text });
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
      ...(toolCalls ? { toolCalls } : {}),
    });
    await touchThread(threadId);
  } catch (err) {
    log.error('[SharepicEdit] Failed to persist message:', err);
  }
  sse.end();
}

/**
 * Run a full sharepic edit turn. Returns true when the turn was handled
 * (stream closed) — the router then returns without running stages 2–4.
 */
export async function handleSharepicEdit(args: HandleSharepicEditArgs): Promise<boolean> {
  const { sse, req, threadId, userId, instruction, currentSharepic, aiWorkerPool } = args;

  try {
    const target = await resolveTarget(threadId, currentSharepic);
    if (!target) return false;

    if (target === 'ambiguous') {
      await finishWithText(
        args,
        'Welche Variante soll ich bearbeiten? Aktiviere auf der gewünschten Karte ' +
          '"Im Chat bearbeiten" und schick mir die Änderung dann noch einmal.'
      );
      return true;
    }

    const descriptor = getSharepicTemplateDescriptor(target.canvasType);
    if (!descriptor) {
      log.info(`[SharepicEdit] No descriptor for canvasType=${target.canvasType} — falling back`);
      return false;
    }

    if (descriptor.deck) {
      // Deck NL-editing runs only on the agentic tool-loop path (v1). The
      // single tool-forced call has no slide targeting — point at the Studio.
      await finishWithText(
        args,
        'Folien-Karusselle kann ich hier gerade nicht direkt bearbeiten. ' +
          'Öffne das Karussell im Studio, um einzelne Folien anzupassen.'
      );
      return true;
    }

    sse.send('progress_step', {
      stepId: `sharepic_edit_${Date.now()}`,
      toolName: 'sharepic_edit',
      title: 'Wende Änderung an…',
      status: 'in_progress',
    });

    const canvasId = await ensureMintedCanvas({ target, threadId, userId, sse });

    // Fresh state every turn — picks up studio edits made in between.
    const current = await getCurrentCanvasState(canvasId);
    const state = { ...descriptor.defaultState, ...target.initialProps, ...current.state };

    const recentEditSummaries = (await listCanvasVersions(canvasId))
      .filter((v) => v.origin !== 'mint' && v.summary)
      .slice(0, 2)
      .map((v) => v.summary as string);

    const editResult = await runSharepicEdit({
      instruction,
      descriptor,
      snapshot: buildSharepicSnapshot(descriptor, state),
      recentEditSummaries,
      aiWorkerPool,
      req,
    });

    if (!editResult.ok) {
      sse.send('sharepic_edit_error', { variantId: target.variantId, error: editResult.error });
      await finishWithText(
        args,
        'Die Änderung hat leider nicht geklappt. Magst du sie anders formulieren?'
      );
      return true;
    }

    const { operations, summary, reply } = editResult.edit;
    const outcome = await applySharepicOpsToCanvas({
      canvasId,
      variantId: target.variantId,
      canvasType: target.canvasType,
      descriptor,
      state,
      operations,
      summary,
      userId,
      sse,
      aiWorkerPool,
      req,
    });

    if (!outcome.ok) {
      sse.send('sharepic_edit_error', { variantId: target.variantId, error: outcome.reason });
      await finishWithText(
        args,
        outcome.rejected[0]?.reason
          ? `Das kann ich bei dieser Vorlage leider nicht ändern (${outcome.rejected[0].reason}). ` +
              'Für Feinarbeit kannst du das Sharepic im Studio öffnen.'
          : 'Ich konnte daraus keine Änderung ableiten. Magst du es konkreter beschreiben?'
      );
      return true;
    }

    await finishWithText(args, reply, [
      {
        toolCallId: `tc_${Date.now()}`,
        toolName: 'sharepic_edit',
        args: { query: instruction },
        result: {
          canvasId,
          variantId: target.variantId,
          version: outcome.version,
          summary,
          canvasType: target.canvasType,
        },
      },
    ]);

    return true;
  } catch (error) {
    log.error('[SharepicEdit] Edit turn failed:', error);
    if (!sse.isEnded()) {
      sse.send('sharepic_edit_error', {
        error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      });
      await finishWithText(
        args,
        'Bei der Bearbeitung ist etwas schiefgelaufen. Versuch es bitte noch einmal.'
      );
    }
    return true;
  }
}
