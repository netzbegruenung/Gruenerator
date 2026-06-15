/**
 * Integration test: Compare GPT-OSS vs Gemma 4 for BlockNote docs AI
 *
 * Tests whether each model correctly uses the valid operation types
 * (add, update, delete) when given the BlockNote xl-ai system prompt
 * and tool schema — or hallucinates invalid types like "replaceBlock".
 *
 * Run: cd apps/api && npx vitest run routes/docs/aiController.model-comparison.vitest.ts
 *
 * Requires: LITELLM_BASE_URL + LITELLM_API_KEY (for GPT-OSS)
 *           REGOLO_API_KEY (for Gemma 4)
 */

import { describe, it, expect } from 'vitest';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema, tool } from 'ai';

const VALID_OPERATION_TYPES = ['add', 'update', 'delete'];

// ─── BlockNote system prompt (exact copy from xl-ai source) ──────

const SYSTEM_PROMPT = `You're manipulating a text document using HTML blocks.
Make sure to follow the json schema provided. When referencing ids they MUST be EXACTLY the same (including the trailing $).
List items are 1 block with 1 list item each, so block content \`<ul><li>item1</li></ul>\` is valid, but \`<ul><li>item1</li><li>item2</li></ul>\` is invalid. We'll merge them automatically.
For code blocks, you can use the \`data-language\` attribute on a <code> block (wrapped with <pre>) to specify the language.

If the user requests updates to the document, use the "applyDocumentOperations" tool to update the document.
---
IF there is no selection active in the latest state, first, determine what part of the document the user is talking about. You SHOULD probably take cursor info into account if needed.
  EXAMPLE: if user says "below" (without pointing to a specific part of the document) he / she probably indicates the block(s) after the cursor.
  EXAMPLE: If you want to insert content AT the cursor position (UNLESS indicated otherwise by the user), then you need \`referenceId\` to point to the block before the cursor with position \`after\` (or block below and \`before\`
---
 `;

// ─── Tool schema (mirrors BlockNote's createStreamToolsArraySchema) ──

const TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    operations: {
      type: 'array' as const,
      items: {
        anyOf: [
          {
            type: 'object' as const,
            description: 'Update a block',
            properties: {
              type: { type: 'string' as const, enum: ['update'] },
              id: { type: 'string' as const, description: 'id of block to update' },
              block: {
                type: 'string' as const,
                description: 'html of block (MUST be a single HTML element)',
              },
            },
            required: ['type', 'id', 'block'],
            additionalProperties: false,
          },
          {
            type: 'object' as const,
            description: 'Insert new blocks',
            properties: {
              type: { type: 'string' as const, enum: ['add'] },
              referenceId: {
                type: 'string' as const,
                description: 'MUST be an id of a block in the document',
              },
              position: {
                type: 'string' as const,
                enum: ['before', 'after'],
                description:
                  '`after` to add blocks AFTER (below) the block with `referenceId`, `before` to add the block BEFORE (above)',
              },
              blocks: {
                type: 'array' as const,
                items: {
                  type: 'string' as const,
                  description: 'html of block (MUST be a single, VALID HTML element)',
                },
              },
            },
            required: ['type', 'referenceId', 'position', 'blocks'],
            additionalProperties: false,
          },
          {
            type: 'object' as const,
            description: 'Delete a block',
            properties: {
              type: { type: 'string' as const, enum: ['delete'] },
              id: { type: 'string' as const, description: 'id of block to delete' },
            },
            required: ['type', 'id'],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  additionalProperties: false,
  required: ['operations'],
};

// ─── Simulated document state (injected by BlockNote) ────────────

const DOCUMENT_STATE = `There is no active selection. This is the latest state of the document (ignore previous documents, you MUST issue operations against this latest version of the document).
The cursor is BETWEEN two blocks as indicated by cursor: true.
Prefer updating existing blocks over removing and adding (but this also depends on the user's question).`;

const DOCUMENT_BLOCKS = JSON.stringify([
  { id: 'ref1$', block: '<p>Willkommen bei den Grünen!</p>' },
  { cursor: true },
  { id: 'ref2$', block: '<p>Wir setzen uns für Klimaschutz und soziale Gerechtigkeit ein.</p>' },
  { id: 'ref3$', block: '<p>Gemeinsam gestalten wir die Zukunft.</p>' },
]);

// ─── Test prompts (various editing tasks) ────────────────────────

const TEST_PROMPTS = [
  {
    name: 'update text (make bold)',
    message: 'Mach den ersten Absatz fett',
  },
  {
    name: 'update text (translate)',
    message: 'Übersetze den zweiten Absatz ins Englische',
  },
  {
    name: 'add new block',
    message: 'Füge nach dem letzten Absatz einen neuen Absatz hinzu: "Jetzt mitmachen!"',
  },
  {
    name: 'delete block',
    message: 'Lösche den dritten Absatz',
  },
  {
    name: 'rewrite block',
    message: 'Schreibe den zweiten Absatz um, damit er kürzer ist',
  },
];

// ─── Model configurations ────────────────────────────────────────

interface ModelConfig {
  name: string;
  provider: () => any;
  modelId: string;
  skip?: () => boolean;
}

function litellmProvider() {
  return createOpenAI({
    baseURL: `${process.env.LITELLM_BASE_URL}/v1`,
    apiKey: process.env.LITELLM_API_KEY || '',
    name: 'litellm',
  });
}

function regoloProvider() {
  return createOpenAI({
    baseURL: 'https://api.regolo.ai/v1',
    apiKey: process.env.REGOLO_API_KEY || '',
    name: 'regolo',
  });
}

function mistralProvider() {
  return createMistral({ apiKey: process.env.MISTRAL_API_KEY });
}

const MODELS: ModelConfig[] = [
  {
    name: 'GPT-OSS 120B (LiteLLM)',
    provider: litellmProvider,
    modelId: 'verdigado-pro',
    skip: () => !process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY,
  },
  {
    name: 'Gemma 4 31B (Regolo)',
    provider: regoloProvider,
    modelId: 'gemma4-31b',
    skip: () => !process.env.REGOLO_API_KEY,
  },
  {
    name: 'Qwen 3.5 122B (Regolo)',
    provider: regoloProvider,
    modelId: 'qwen3.5-122b',
    skip: () => !process.env.REGOLO_API_KEY,
  },
  {
    name: 'Mistral Large (Mistral)',
    provider: mistralProvider as any,
    modelId: 'mistral-large-latest',
    skip: () => !process.env.MISTRAL_API_KEY,
  },
];

// ─── Helper ──────────────────────────────────────────────────────

interface TestResult {
  model: string;
  prompt: string;
  operationTypes: string[];
  validTypes: string[];
  invalidTypes: string[];
  rawOperations: unknown[];
  rawToolCalls: unknown[];
  error: string | null;
  latencyMs: number;
  tokens: { input: number; output: number } | null;
}

async function runModelTest(modelConfig: ModelConfig, prompt: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const provider = modelConfig.provider();
    const model = provider.chat
      ? provider.chat(modelConfig.modelId)
      : provider(modelConfig.modelId);

    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: DOCUMENT_STATE }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: DOCUMENT_BLOCKS }],
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      tools: {
        applyDocumentOperations: tool({
          description: 'Apply operations to the document',
          parameters: jsonSchema(TOOL_SCHEMA),
        }),
      },
      toolChoice: 'required',
      maxTokens: 2048,
      temperature: 0.3,
    });

    const latencyMs = Date.now() - start;
    const toolCalls = result.toolCalls || [];

    const allOperations: unknown[] = [];
    const allTypes: string[] = [];

    for (const tc of toolCalls) {
      // AI SDK uses `args` for typed tools, but `input` for jsonSchema tools
      const args = ((tc as any).args ?? (tc as any).input ?? {}) as {
        operations?: Array<{ type?: string }>;
      };
      if (args?.operations) {
        for (const op of args.operations) {
          allOperations.push(op);
          if (op.type) {
            allTypes.push(op.type);
          }
        }
      }
    }

    return {
      model: modelConfig.name,
      prompt,
      operationTypes: allTypes,
      validTypes: allTypes.filter((t) => VALID_OPERATION_TYPES.includes(t)),
      invalidTypes: allTypes.filter((t) => !VALID_OPERATION_TYPES.includes(t)),
      rawOperations: allOperations,
      rawToolCalls: toolCalls,
      error: null,
      latencyMs,
      tokens: result.usage
        ? { input: result.usage.promptTokens, output: result.usage.completionTokens }
        : null,
    };
  } catch (err) {
    return {
      model: modelConfig.name,
      prompt,
      operationTypes: [],
      validTypes: [],
      invalidTypes: [],
      rawOperations: [],
      rawToolCalls: [],
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
      tokens: null,
    };
  }
}

// ─── Tests ───────────────────────────────────────────────────────

// Gated behind RUN_LLM_EVAL_TESTS=1 because these call real LLM APIs and are
// non-deterministic. Run manually when evaluating new models or tool schemas:
//   RUN_LLM_EVAL_TESTS=1 pnpm --filter @gruenerator/api exec vitest run routes/docs/aiController.model-comparison.vitest.ts
const RUN_LLM_EVAL = process.env.RUN_LLM_EVAL_TESTS === '1';

describe.skipIf(!RUN_LLM_EVAL)('Model Comparison: BlockNote Docs AI tool-use compliance', () => {
  const allResults: TestResult[] = [];

  for (const modelConfig of MODELS) {
    describe(modelConfig.name, () => {
      const shouldSkip = modelConfig.skip?.() ?? false;

      for (const testPrompt of TEST_PROMPTS) {
        it.skipIf(shouldSkip)(
          `${testPrompt.name}: generates valid operation types`,
          async () => {
            const result = await runModelTest(modelConfig, testPrompt.message);
            allResults.push(result);

            console.log(`\n  ┌─ ${modelConfig.name} | "${testPrompt.name}"`);
            console.log(`  │ Latency: ${result.latencyMs}ms`);
            if (result.tokens) {
              console.log(`  │ Tokens: ${result.tokens.input} in / ${result.tokens.output} out`);
            }
            if (result.error) {
              console.log(`  │ ERROR: ${result.error}`);
              console.log(`  └─ FAIL (error)\n`);
              expect.fail(`Model error: ${result.error}`);
              return;
            }

            console.log(`  │ Operation types: [${result.operationTypes.join(', ')}]`);
            console.log(`  │ Valid:   [${result.validTypes.join(', ')}]`);
            console.log(`  │ Invalid: [${result.invalidTypes.join(', ') || 'none'}]`);

            if (result.rawOperations.length === 0 && result.rawToolCalls.length > 0) {
              console.log(`  │ ⚠ Tool called but NO operations extracted!`);
              for (const tc of result.rawToolCalls) {
                console.log(`  │ Raw TC: ${JSON.stringify(tc).slice(0, 200)}`);
              }
            }

            for (const op of result.rawOperations) {
              console.log(`  │ Op: ${JSON.stringify(op).slice(0, 150)}`);
            }

            const verdict = result.invalidTypes.length === 0 ? 'PASS' : 'FAIL';
            console.log(`  └─ ${verdict}\n`);

            expect(result.operationTypes.length).toBeGreaterThan(0);
            expect(result.invalidTypes).toEqual([]);
          },
          30000
        );
      }
    });
  }

  // ─── Summary report ──────────────────────────────────────────

  it('prints comparison summary', () => {
    if (allResults.length === 0) {
      console.log('\n  No results collected (all models skipped?)');
      return;
    }

    console.log('\n' + '═'.repeat(70));
    console.log('  MODEL COMPARISON SUMMARY');
    console.log('═'.repeat(70));

    for (const modelConfig of MODELS) {
      const modelResults = allResults.filter((r) => r.model === modelConfig.name);
      if (modelResults.length === 0) continue;

      const passed = modelResults.filter((r) => r.invalidTypes.length === 0 && !r.error);
      const failed = modelResults.filter((r) => r.invalidTypes.length > 0);
      const errors = modelResults.filter((r) => r.error);
      const avgLatency = Math.round(
        modelResults.reduce((s, r) => s + r.latencyMs, 0) / modelResults.length
      );

      const allInvalidTypes = [...new Set(modelResults.flatMap((r) => r.invalidTypes))];

      console.log(`\n  ┌─ ${modelConfig.name}`);
      console.log(`  │ Tests:    ${modelResults.length}`);
      console.log(`  │ Passed:   ${passed.length}/${modelResults.length}`);
      console.log(`  │ Failed:   ${failed.length} (invalid types)`);
      console.log(`  │ Errors:   ${errors.length}`);
      console.log(`  │ Avg latency: ${avgLatency}ms`);
      if (allInvalidTypes.length > 0) {
        console.log(`  │ Invalid types seen: [${allInvalidTypes.join(', ')}]`);
      }

      const score = modelResults.length > 0 ? (passed.length / modelResults.length) * 100 : 0;
      console.log(`  │ Score:    ${score.toFixed(0)}%`);
      console.log(`  └─ ${score === 100 ? '✓ RECOMMENDED' : '✗ NOT RECOMMENDED'}`);
    }

    console.log('\n' + '═'.repeat(70));
  });
});
