/**
 * Board AI service
 *
 * Turns a natural-language board-edit request into a list of structured board
 * operations (BoardOperation[]). The operations are applied CLIENT-SIDE by the
 * boards assistant against the live Yjs board — this service only plans them.
 *
 * Routed through the facade (`aiTools`, lane `editor_ops_board`) rather than
 * calling the AI SDK directly — see services/ai/generate.ts and the forced
 * tool-call pattern in routes/chat/services/toolForcedEdit.ts, which this
 * mirrors: a JSON-Schema tool built from the zod schema via `zodToJsonSchema`
 * (the facade's `Tool.input_schema` is a plain schema, not a zod object), one
 * retry when the provider fails or answers without the forced tool call, and a
 * manual post-call zod validation of whatever came back.
 */

import {
  boardOperationSchema,
  type BoardOperation,
  type CurrentBoard,
} from '@gruenerator/contracts';
import { jsonSchema } from 'ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { aiTools } from '../../services/ai/generate.js';
import { createLogger } from '../../utils/logger.js';

import type { AiResult, Tool } from '../../services/ai/types.js';

const log = createLogger('BoardAI');

const FIELD_IDS = {
  TITLE: 'field-title',
  STATUS: 'field-status',
} as const;

const BOARD_TOOL_STRICT_PROMPT = `You translate a user's request into board operations by calling the tool applyBoardOperations.

You MUST respond ONLY by calling applyBoardOperations with { "operations": [ ... ] }.

IMPORTANT — you may ONLY CREATE NEW things in the board. You must NOT modify, move,
assign, comment on, archive, duplicate or delete EXISTING entries. Only these
operation types are permitted:
- create_task { title, status?, description?, dueDate?, assignee?, assignees?, labels? }
- add_column { name, color? }
- add_field { name, fieldType, options? }
- add_view { name, layout }            // layout: kanban|table|list|calendar|gantt

Operations that touch existing entries are DISABLED and will be rejected — do NOT
emit them: update_task, delete_task, archive_task, restore_task, duplicate_task,
move_task, add_comment, set_assignee, set_assignees, set_labels, set_due_date,
add_checklist_item, rename_column.

RULES:
- For "status", "assignee"/"assignees" and "labels" use HUMAN NAMES (e.g. "In Arbeit",
  "Erledigt", a member's name, "Dringend"). The client resolves them to ids and
  creates a column/label if it does not exist yet.
- If the user asks to change, move, assign, comment on or delete an existing task,
  briefly explain (in the next turn) that you can only create new items — but for
  THIS tool call still return an empty operations array.
- Dates must be ISO (YYYY-MM-DD). Resolve relative dates ("nächsten Freitag") against today.
- Only emit operations the user actually asked for. If nothing should be created,
  return an empty operations array.
- Return ONLY the tool call. No prose.`;

/**
 * Resolve a row's assignee cell to a human name. The cell is a JSON blob
 * (`{id,name,avatarRobotId}`); we read `.name` (and resolve `.id` against the
 * member map when present). Falls back to id-map lookup / raw string for legacy
 * plain-string cells. Returns null when unassigned.
 */
function resolveAssigneeName(raw: unknown, assigneeById: Map<string, string>): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: string; name?: string };
    if (parsed && typeof parsed === 'object') {
      if (parsed.id && assigneeById.has(parsed.id)) return assigneeById.get(parsed.id)!;
      if (parsed.name) return parsed.name;
    }
  } catch {
    // Not JSON — legacy plain value below.
  }
  return assigneeById.get(raw) ?? raw;
}

/**
 * Serialize the live board into a compact, model-readable context block.
 * Caps rows so very large boards stay within token limits.
 */
function serializeBoard(board: CurrentBoard, today: string): string {
  const statusById = new Map(board.statusOptions.map((o) => [o.id, o.name]));
  const assigneeById = new Map(board.assignableMembers.map((m) => [m.id, m.name]));

  const lines: string[] = [];
  lines.push(`Heutiges Datum: ${today}`);
  lines.push(`Board: ${board.title ?? '(ohne Titel)'}`);

  lines.push('\nSpalten (Status):');
  if (board.statusOptions.length === 0) lines.push('- (keine)');
  for (const opt of board.statusOptions) lines.push(`- ${opt.name}`);

  const selectFields = board.fields.filter(
    (f) => f.id !== FIELD_IDS.STATUS && (f.type === 'singleSelect' || f.type === 'multiSelect')
  );
  if (selectFields.length > 0) {
    lines.push('\nWeitere Auswahlfelder:');
    for (const f of selectFields) {
      const opts = (f.typeOptions.options as Array<{ name: string }> | undefined) ?? [];
      lines.push(`- ${f.name}: ${opts.map((o) => o.name).join(', ') || '(keine Optionen)'}`);
    }
  }

  lines.push('\nMitglieder (zuweisbar):');
  if (board.assignableMembers.length === 0) lines.push('- (keine)');
  for (const m of board.assignableMembers) lines.push(`- ${m.name}`);

  lines.push('\nAufgaben:');
  const MAX_ROWS = 300;
  const rows = board.rows.slice(0, MAX_ROWS);
  if (rows.length === 0) lines.push('- (keine Aufgaben)');
  for (const row of rows) {
    const title = (row.cells[FIELD_IDS.TITLE] as string) || '(kein Titel)';
    const statusId = row.cells[FIELD_IDS.STATUS];
    const statusName = typeof statusId === 'string' ? (statusById.get(statusId) ?? statusId) : '—';
    // The assignee cell is a JSON blob ({id,name,avatarRobotId}) written by the
    // card UI / executor — not a bare user id. Parse it to surface the human
    // name; fall back to id-map lookup then the raw value for legacy cells.
    const assigneeName = resolveAssigneeName(row.cells['field-assignee'], assigneeById);
    const due = row.cells['field-due-date'];
    let line = `- [${row.id}] "${title}" (Status: ${statusName}`;
    if (assigneeName) line += `, Zuständig: ${assigneeName}`;
    if (typeof due === 'string' && due) line += `, Fällig: ${due}`;
    line += ')';
    lines.push(line);
  }
  if (board.rows.length > MAX_ROWS) {
    lines.push(`- … (${board.rows.length - MAX_ROWS} weitere Aufgaben ausgelassen)`);
  }

  return lines.join('\n');
}

const TOOL_NAME = 'applyBoardOperations';
const OPERATIONS_SCHEMA = z.object({ operations: z.array(boardOperationSchema).max(50) });

/** How many times the forced tool call is attempted — one retry, as before. */
const MAX_ATTEMPTS = 2;

/** The tool call by NAME, in either transport shape the adapters produce. */
function extractToolInput(result: AiResult): Record<string, unknown> | null {
  const call = result.tool_calls?.find((c) => c.name === TOOL_NAME);
  if (call) return call.input;
  for (const block of result.raw_content_blocks ?? []) {
    if (block.type === 'tool_use' && block.name === TOOL_NAME && block.input) return block.input;
  }
  return null;
}

/**
 * Plan board operations for a user request. Returns a validated BoardOperation[]
 * (possibly empty). Throws only on provider/model failure.
 */
export async function generateBoardOperations(opts: {
  userPrompt: string;
  board: CurrentBoard;
  referenceContent?: string | null;
  today: string;
}): Promise<BoardOperation[]> {
  const { userPrompt, board, referenceContent, today } = opts;

  const referenceSection = referenceContent?.trim()
    ? `\n\nRECHERCHIERTE QUELLEN (Faktenbasis für die Bearbeitung — übernimm konkrete Zahlen, Namen und Fakten WÖRTLICH aus diesen Quellen; erfinde keine Beispielwerte):\n<recherchierte_quellen>\n${referenceContent.trim().slice(0, 8000)}\n</recherchierte_quellen>`
    : '';

  const system = `${BOARD_TOOL_STRICT_PROMPT}\n\nAKTUELLER BOARD-ZUSTAND:\n${serializeBoard(board, today)}${referenceSection}`;

  // jsonSchema() wrapping is required — the AI SDK's asSchema helper rejects
  // raw JSON-Schema objects (see toolForcedEdit.ts).
  const rawSchema = zodToJsonSchema(OPERATIONS_SCHEMA, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  const tool: Tool = {
    name: TOOL_NAME,
    description: 'Apply a batch of operations to the board.',
    input_schema: jsonSchema(
      rawSchema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  let toolInput: Record<string, unknown> | null = null;
  let lastResult: AiResult | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await aiTools({
        lane: 'editor_ops_board',
        system,
        prompt: userPrompt,
        tools: [tool],
        toolChoice: 'required',
        temperature: 0.2,
      });
      lastResult = result;
      toolInput = extractToolInput(result);
      if (toolInput) break;
      log.warn(
        `[BoardAI] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
      );
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      log.warn(`[BoardAI] attempt ${attempt} threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let captured: BoardOperation[] | null = null;
  if (toolInput) {
    // Trust-boundary assertion + typed narrow. No `.min(1)` (empty = no-op is
    // valid); the 50-op cap from boardOperationsSchema still applies.
    const parsed = z
      .array(boardOperationSchema)
      .max(50)
      .safeParse((toolInput as { operations: unknown }).operations);
    if (parsed.success) {
      captured = parsed.data;
    } else {
      log.warn(`[BoardAI] Operation validation failed: ${parsed.error.message}`);
    }
  } else if (lastResult) {
    log.warn(`[BoardAI] no tool call after ${MAX_ATTEMPTS} attempt(s)`);
  }

  log.info(`[BoardAI] Planned ${captured?.length ?? 0} operation(s) for prompt: "${userPrompt}"`);
  return captured ?? [];
}
