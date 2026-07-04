/**
 * Sheet AI service
 *
 * Turns a natural-language spreadsheet-edit request into a list of structured
 * sheet operations (SheetOperation[]). The operations are applied CLIENT-SIDE
 * by the sheets editor via the Univer Facade API (and then flow through the
 * mutation-log collab bridge) — this service only plans them.
 *
 * Mirrors boards/boardAiService.ts (plan-then-apply, plain JSON, no streaming).
 */

import { sheetOperationSchema, type SheetOperation } from '@gruenerator/contracts';
import { generateText, tool } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../chat/agents/providers.js';
import { type AgentConfig } from '../chat/agents/types.js';

const log = createLogger('SheetAI');

// Mirror boards/docs AI model choices — confirmed to return tool calls.
const SHEET_AI_MODELS: Record<AgentConfig['provider'], string> = {
  litellm: 'verdigado-pro',
  regolo: 'mistral-small-4-119b',
  mistral: 'mistral-medium-2604',
  anthropic: 'mistral-medium-2604',
};

const SHEET_TOOL_STRICT_PROMPT = `You translate a user's request into spreadsheet operations by calling the tool applySheetOperations.

You MUST respond ONLY by calling applySheetOperations with { "operations": [ ... ] }.

Permitted operation types:
- set_range_values { range, values, sheet? }   // range in A1 notation ("A1:C3"); values is a 2D array matching the range shape
- set_formula { cell, formula, sheet? }        // single cell; formula starts with "=" and uses A1 references
- format_range { range, bold?, background?, fontColor?, sheet? }  // colors as hex, e.g. "#e8f5e9"
- add_sheet { name }
- clear_range { range, sheet? }

RULES:
- Ranges/cells ALWAYS in A1 notation. Row 1 is the first row, column A the first column.
- The current sheet state below shows values with their A1 coordinates — target EXISTING data precisely; do not overwrite unrelated cells.
- In set_range_values, a string starting with "=" is treated as a formula.
- Numbers must be JSON numbers (1234.5), not localized strings.
- "sheet" is the sheet NAME; omit it to target the active sheet.
- Write German content with gender-inclusive language (Genderstern *) where text is generated.
- Only emit operations the user actually asked for. If nothing should change, return an empty operations array.
- Return ONLY the tool call. No prose.`;

/**
 * Plan sheet operations for a user request. Returns a validated
 * SheetOperation[] (possibly empty). Throws only on provider/model failure.
 */
export async function generateSheetOperations(opts: {
  userPrompt: string;
  sheetContext: string;
  referenceContent?: string | null;
}): Promise<SheetOperation[]> {
  const { userPrompt, sheetContext, referenceContent } = opts;

  const providerChain: AgentConfig['provider'][] = ['mistral', 'regolo', 'litellm'];
  const provider = providerChain.find((p) => isProviderConfigured(p));
  if (!provider) {
    throw new Error('No AI provider configured (tried: mistral, regolo, litellm)');
  }

  const modelId = SHEET_AI_MODELS[provider];
  const model = getModel(provider, modelId);
  log.info(`[SheetAI] Using provider: ${provider}, model: ${modelId}`);

  const referenceSection = referenceContent?.trim()
    ? `\n\nZUSÄTZLICHER KONTEXT (vorherige Antwort des Assistenten, auf die sich der*die Nutzer*in bezieht):\n<reference_content>\n${referenceContent.trim().slice(0, 8000)}\n</reference_content>`
    : '';

  const system = `${SHEET_TOOL_STRICT_PROMPT}\n\nAKTUELLER TABELLEN-ZUSTAND:\n${sheetContext.slice(0, 24_000)}${referenceSection}`;

  let captured: SheetOperation[] | null = null;

  const result = await generateText({
    model,
    system,
    prompt: userPrompt,
    tools: {
      applySheetOperations: tool({
        description: 'Apply a batch of operations to the spreadsheet.',
        // No `.min(1)`: an empty array is the legitimate "nothing to change".
        inputSchema: z.object({ operations: z.array(sheetOperationSchema).max(50) }),
      }),
    },
    toolChoice: 'required',
    maxOutputTokens: 8000,
    maxRetries: 1,
    temperature: 0.2,
  });

  for (const tc of result.toolCalls) {
    if (tc.toolName === 'applySheetOperations') {
      const parsed = z
        .array(sheetOperationSchema)
        .max(50)
        .safeParse((tc.input as { operations: unknown }).operations);
      if (parsed.success) {
        captured = parsed.data;
      } else {
        log.warn(`[SheetAI] Operation validation failed: ${parsed.error.message}`);
      }
    }
  }

  log.info(`[SheetAI] Planned ${captured?.length ?? 0} operation(s) for prompt: "${userPrompt}"`);
  return captured ?? [];
}
