/**
 * Board AI service
 *
 * Turns a natural-language board-edit request into a list of structured board
 * operations (BoardOperation[]). The operations are applied CLIENT-SIDE by the
 * boards assistant against the live Yjs board — this service only plans them.
 *
 * Mirrors the docs AI controller's provider chain + strict tool-call approach,
 * but returns plain JSON (no streaming) since the executor needs the full op
 * list, not a token stream.
 */

import {
  boardOperationSchema,
  type BoardOperation,
  type CurrentBoard,
} from '@gruenerator/contracts';
import { generateText, tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../chat/agents/providers.js';
import { type AgentConfig } from '../chat/agents/types.js';

const log = createLogger('BoardAI');

// Mirror docs/aiController DOCS_AI_MODELS — these IDs are confirmed to return
// finish_reason:tool_calls on their respective providers.
const BOARD_AI_MODELS: Record<AgentConfig['provider'], string> = {
  litellm: 'gpt-oss:120b',
  regolo: 'mistral-small-4-119b',
  mistral: 'mistral-medium-2604',
  anthropic: 'mistral-medium-2604',
};

const FIELD_IDS = {
  TITLE: 'field-title',
  STATUS: 'field-status',
} as const;

const BOARD_TOOL_STRICT_PROMPT = `You translate a user's request into board operations by calling the tool applyBoardOperations.

You MUST respond ONLY by calling applyBoardOperations with { "operations": [ ... ] }.
Each operation has a "type" and the fields documented in the schema. Valid types:
- create_task { title, status?, description?, dueDate?, assignee?, assignees?, labels? }
- update_task { taskId, title?, description?, dueDate? }
- delete_task { taskId }                // permanent; archive_task is the soft option
- archive_task { taskId }               // hide the card from all views (soft-delete)
- restore_task { taskId }               // bring an archived card back
- duplicate_task { taskId }             // clone the card into the same column
- move_task { taskId, status }
- add_comment { taskId, text }
- set_assignee { taskId, assignee? }    // single person (legacy)
- set_assignees { taskId, assignees[] } // multiple people — prefer this for >1
- set_labels { taskId, labels[] }
- set_due_date { taskId, dueDate? }   // ISO date (YYYY-MM-DD) or null to clear
- add_checklist_item { taskId, checklistTitle?, text }  // appends a checklist item
- add_column { name, color? }
- rename_column { columnId, name }
- add_field { name, fieldType, options? }
- add_view { name, layout }            // layout: kanban|table|list|calendar|gantt

RULES:
- Use the EXACT taskId values from the board state for existing tasks.
- For "status", "assignee"/"assignees" and "labels" use HUMAN NAMES (e.g. "In Arbeit", "Erledigt", a member's name, "Dringend"). The client resolves them to ids and creates a column/label if it does not exist yet.
- When assigning more than one person, use set_assignees with a list; use set_assignee only for a single person.
- Prefer archive_task over delete_task unless the user explicitly wants permanent deletion.
- Combine multiple changes into one operations array when the user asks for several things.
- Dates must be ISO (YYYY-MM-DD). Resolve relative dates ("nächsten Freitag") against today.
- Only emit operations the user actually asked for. If nothing should change, return an empty operations array.
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

  const providerChain: AgentConfig['provider'][] = ['mistral', 'regolo', 'litellm'];
  const provider = providerChain.find((p) => isProviderConfigured(p));
  if (!provider) {
    throw new Error('No AI provider configured (tried: mistral, regolo, litellm)');
  }

  const modelId = BOARD_AI_MODELS[provider];
  const model = getModel(provider, modelId);
  log.info(`[BoardAI] Using provider: ${provider}, model: ${modelId}`);

  const referenceSection = referenceContent?.trim()
    ? `\n\nZUSÄTZLICHER KONTEXT (vorherige Antwort des Assistenten, auf die sich der*die Nutzer*in bezieht):\n<reference_content>\n${referenceContent.trim().slice(0, 8000)}\n</reference_content>`
    : '';

  const system = `${BOARD_TOOL_STRICT_PROMPT}\n\nAKTUELLER BOARD-ZUSTAND:\n${serializeBoard(board, today)}${referenceSection}`;

  let captured: BoardOperation[] | null = null;

  const result = await generateText({
    model,
    system,
    prompt: userPrompt,
    tools: {
      applyBoardOperations: tool({
        description: 'Apply a batch of operations to the board.',
        // No `.min(1)` here (unlike boardOperationsSchema): the prompt allows an
        // empty array to mean "nothing to change", and requiring ≥1 op would make
        // that legitimate no-op fail tool-input validation / burn a retry.
        inputSchema: z.object({ operations: z.array(boardOperationSchema).max(50) }),
      }),
    },
    toolChoice: 'required',
    maxOutputTokens: 8000,
    maxRetries: 1,
    temperature: 0.2,
  });

  for (const tc of result.toolCalls) {
    if (tc.toolName === 'applyBoardOperations') {
      // Trust-boundary assertion + typed narrow. No `.min(1)` (empty = no-op is
      // valid); the 50-op cap from boardOperationsSchema still applies.
      const parsed = z
        .array(boardOperationSchema)
        .max(50)
        .safeParse((tc.input as { operations: unknown }).operations);
      if (parsed.success) {
        captured = parsed.data;
      } else {
        log.warn(`[BoardAI] Operation validation failed: ${parsed.error.message}`);
      }
    }
  }

  log.info(`[BoardAI] Planned ${captured?.length ?? 0} operation(s) for prompt: "${userPrompt}"`);
  return captured ?? [];
}
