/**
 * Real-API evaluation: BlockNote HTML format compliance for list-heavy edits.
 *
 * Companion to `aiController.htmlFormat.vitest.ts` (which is a static fixture
 * test). This harness calls real LLM endpoints with BlockNote-style prompts
 * that include bullet lists — the exact failure case observed in production
 * (gpt-oss:120b returning `<ul><li>…</li></ul>` instead of `<li>…</li>`).
 *
 * Each (model, prompt) pair is run N times (default 3) so we can measure
 * reliability rather than one-shot luck. Logs raw HTML of every returned
 * operation so format violations are visible at a glance.
 *
 * Gated behind `RUN_LLM_EVAL_TESTS=1`. Run manually:
 *   RUN_LLM_EVAL_TESTS=1 pnpm --filter @gruenerator/api exec vitest run \
 *     routes/docs/aiController.htmlFormat-eval.vitest.ts
 *
 * Requires: LITELLM_BASE_URL + LITELLM_API_KEY (gpt-oss)
 *           REGOLO_API_KEY (mistral-small-4-119b)
 *           MISTRAL_API_KEY (mistral-large-latest)
 */

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, jsonSchema, tool } from 'ai';
import { describe, expect, it } from 'vitest';

const ITERATIONS_PER_CASE = Number(process.env.LLM_EVAL_ITERATIONS) || 3;

// ─── BlockNote system prompt (verbatim from xl-ai bundle) ─────────────
const SYSTEM_PROMPT = `You're manipulating a text document using HTML blocks.
Make sure to follow the json schema provided. When referencing ids they MUST be EXACTLY the same (including the trailing $).
List items are 1 block with 1 list item each, so block content \`<ul><li>item1</li></ul>\` is valid, but \`<ul><li>item1</li><li>item2</li></ul>\` is invalid. We'll merge them automatically.
For code blocks, you can use the \`data-language\` attribute on a <code> block (wrapped with <pre>) to specify the language.

If the user requests updates to the document, use the "applyDocumentOperations" tool to update the document.
---
IF there is no selection active in the latest state, first, determine what part of the document the user is talking about. You SHOULD probably take cursor info into account if needed.
---
 `;

// ─── Tool schema (mirrors BlockNote's createStreamToolsArraySchema) ────
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
              id: { type: 'string' as const },
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
              referenceId: { type: 'string' as const },
              position: { type: 'string' as const, enum: ['before', 'after'] },
              blocks: {
                type: 'array' as const,
                items: { type: 'string' as const },
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
              id: { type: 'string' as const },
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

// ─── List-heavy document state (the failure case in production) ────────
const DOCUMENT_STATE = `There is no active selection. This is the latest state of the document.`;

const DOCUMENT_BLOCKS = JSON.stringify([
  { id: 'h1$', block: '<h2>Anforderungen an die Stelle</h2>' },
  { id: 'l1$', block: '<li>Du bist mit den Zielen grüner Politik vertraut.</li>' },
  { id: 'l2$', block: '<li>Du hast Erfahrung mit Newslettern und Website-Pflege.</li>' },
  { id: 'l3$', block: '<li>Du arbeitest zuverlässig und strukturiert.</li>' },
  { id: 'l4$', block: '<li>Du bist kommunikationsstark.</li>' },
  { cursor: true },
]);

// ─── Test prompts focused on list manipulation ─────────────────────────
const TEST_PROMPTS = [
  {
    name: 'rewrite-bullets-du-form',
    message: 'Schreibe alle Stichpunkte im Du-Stil um, damit sie persönlicher klingen.',
    expectedOpType: 'update',
    expectListItems: true,
  },
  {
    name: 'add-bullet-at-end',
    message: 'Füge am Ende der Liste einen neuen Stichpunkt hinzu: "Du bist bereit, gelegentlich abends zu arbeiten."',
    expectedOpType: 'add',
    expectListItems: true,
  },
  {
    name: 'translate-bullets',
    message: 'Übersetze alle Stichpunkte ins Englische.',
    expectedOpType: 'update',
    expectListItems: true,
  },
];

// ─── Models under test ─────────────────────────────────────────────────
interface ModelConfig {
  name: string;
  shortName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: () => any;
  modelId: string;
  skip: () => boolean;
}

const MODELS: ModelConfig[] = [
  {
    name: 'mistral-small-4-119b (Regolo)',
    shortName: 'mistral-small-4',
    provider: () =>
      createOpenAI({
        baseURL: 'https://api.regolo.ai/v1',
        apiKey: process.env.REGOLO_API_KEY ?? '',
        name: 'regolo',
      }),
    modelId: 'mistral-small-4-119b',
    skip: () => !process.env.REGOLO_API_KEY,
  },
  {
    name: 'mistral-large-latest (Mistral)',
    shortName: 'mistral-large',
    provider: () => createMistral({ apiKey: process.env.MISTRAL_API_KEY }),
    modelId: 'mistral-large-latest',
    skip: () => !process.env.MISTRAL_API_KEY,
  },
  {
    name: 'gpt-oss:120b (LiteLLM)',
    shortName: 'gpt-oss',
    provider: () =>
      createOpenAI({
        baseURL: `${process.env.LITELLM_BASE_URL}/v1`,
        apiKey: process.env.LITELLM_API_KEY ?? '',
        name: 'litellm',
      }),
    modelId: 'gpt-oss:120b',
    skip: () => !process.env.LITELLM_BASE_URL || !process.env.LITELLM_API_KEY,
  },
];

// ─── Format validators (the actual contract) ───────────────────────────

interface FormatViolation {
  kind: 'over-wrapped-li' | 'multi-item-ul' | 'no-tool-call' | 'invalid-op-type' | 'missing-id-suffix';
  detail: string;
}

interface OperationCheck {
  op: unknown;
  blockHtml: string | null;
  violations: FormatViolation[];
}

function isOverWrappedListItem(html: string): boolean {
  const trimmed = html.trim();
  return /^<ul[\s>]/i.test(trimmed) && /<\/ul>\s*$/i.test(trimmed) && (trimmed.match(/<li[\s>]/gi)?.length ?? 0) === 1;
}

function isMultiItemUl(html: string): boolean {
  return (html.match(/<li[\s>]/gi)?.length ?? 0) > 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkOperation(op: any): OperationCheck {
  const violations: FormatViolation[] = [];
  let blockHtml: string | null = null;

  if (!op || typeof op !== 'object') {
    violations.push({ kind: 'invalid-op-type', detail: 'op is not an object' });
    return { op, blockHtml: null, violations };
  }

  const validTypes = ['update', 'add', 'delete'];
  if (!validTypes.includes(op.type)) {
    violations.push({ kind: 'invalid-op-type', detail: `type=${op.type ?? 'undefined'}` });
  }

  if ((op.type === 'update' || op.type === 'delete') && typeof op.id === 'string') {
    if (!op.id.endsWith('$')) {
      violations.push({ kind: 'missing-id-suffix', detail: `id=${op.id}` });
    }
  }
  if (op.type === 'add' && typeof op.referenceId === 'string') {
    if (!op.referenceId.endsWith('$')) {
      violations.push({ kind: 'missing-id-suffix', detail: `referenceId=${op.referenceId}` });
    }
  }

  if (op.type === 'update' && typeof op.block === 'string') {
    blockHtml = op.block;
    if (isOverWrappedListItem(op.block)) {
      violations.push({ kind: 'over-wrapped-li', detail: op.block.slice(0, 120) });
    }
    if (isMultiItemUl(op.block)) {
      violations.push({ kind: 'multi-item-ul', detail: op.block.slice(0, 120) });
    }
  }

  if (op.type === 'add' && Array.isArray(op.blocks)) {
    blockHtml = op.blocks.join(' | ');
    for (const b of op.blocks) {
      if (typeof b !== 'string') continue;
      if (isOverWrappedListItem(b)) {
        violations.push({ kind: 'over-wrapped-li', detail: b.slice(0, 120) });
      }
      if (isMultiItemUl(b)) {
        violations.push({ kind: 'multi-item-ul', detail: b.slice(0, 120) });
      }
    }
  }

  return { op, blockHtml, violations };
}

interface RunResult {
  model: string;
  prompt: string;
  iteration: number;
  latencyMs: number;
  operationCount: number;
  checks: OperationCheck[];
  totalViolations: number;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

async function runOnce(
  modelConfig: ModelConfig,
  promptText: string,
  iteration: number
): Promise<RunResult> {
  const start = Date.now();
  try {
    const provider = modelConfig.provider();
    const model = provider.chat ? provider.chat(modelConfig.modelId) : provider(modelConfig.modelId);

    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: DOCUMENT_STATE }] },
        { role: 'assistant', content: [{ type: 'text', text: DOCUMENT_BLOCKS }] },
        { role: 'user', content: promptText },
      ],
      tools: {
        applyDocumentOperations: tool({
          description: 'Apply operations to the document',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parameters: jsonSchema(TOOL_SCHEMA as any),
        }),
      },
      toolChoice: 'required',
      maxTokens: 2048,
      temperature: 0.3,
    });

    const latencyMs = Date.now() - start;
    const toolCalls = result.toolCalls ?? [];

    if (toolCalls.length === 0) {
      return {
        model: modelConfig.shortName,
        prompt: promptText,
        iteration,
        latencyMs,
        operationCount: 0,
        checks: [],
        totalViolations: 1,
        error: 'no tool call',
        inputTokens: result.usage?.promptTokens ?? null,
        outputTokens: result.usage?.completionTokens ?? null,
      };
    }

    const allOps: unknown[] = [];
    for (const tc of toolCalls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = ((tc as any).args ?? (tc as any).input ?? {}) as { operations?: unknown[] };
      if (Array.isArray(args.operations)) allOps.push(...args.operations);
    }

    const checks = allOps.map((op) => checkOperation(op));
    const totalViolations = checks.reduce((s, c) => s + c.violations.length, 0);

    return {
      model: modelConfig.shortName,
      prompt: promptText,
      iteration,
      latencyMs,
      operationCount: allOps.length,
      checks,
      totalViolations,
      error: null,
      inputTokens: result.usage?.promptTokens ?? null,
      outputTokens: result.usage?.completionTokens ?? null,
    };
  } catch (err) {
    return {
      model: modelConfig.shortName,
      prompt: promptText,
      iteration,
      latencyMs: Date.now() - start,
      operationCount: 0,
      checks: [],
      totalViolations: 1,
      error: err instanceof Error ? err.message : String(err),
      inputTokens: null,
      outputTokens: null,
    };
  }
}

// ─── Test runner ───────────────────────────────────────────────────────

const RUN_EVAL = process.env.RUN_LLM_EVAL_TESTS === '1';

describe.skipIf(!RUN_EVAL)('BlockNote HTML format compliance — real-API eval', () => {
  const allResults: RunResult[] = [];

  for (const modelConfig of MODELS) {
    describe(modelConfig.name, () => {
      const shouldSkip = modelConfig.skip();

      for (const testPrompt of TEST_PROMPTS) {
        it.skipIf(shouldSkip)(
          `${testPrompt.name} (${ITERATIONS_PER_CASE}×)`,
          async () => {
            console.log(`\n┌── ${modelConfig.shortName} | ${testPrompt.name}`);

            for (let i = 1; i <= ITERATIONS_PER_CASE; i++) {
              const result = await runOnce(modelConfig, testPrompt.message, i);
              allResults.push(result);

              const status = result.error
                ? `ERROR: ${result.error}`
                : result.totalViolations === 0
                  ? `OK (${result.operationCount} ops)`
                  : `${result.totalViolations} violation(s) across ${result.operationCount} ops`;

              console.log(`│ run ${i}: ${result.latencyMs}ms — ${status}`);

              for (const check of result.checks) {
                if (check.violations.length > 0) {
                  for (const v of check.violations) {
                    console.log(`│   ⚠ ${v.kind}: ${v.detail}`);
                  }
                  if (check.blockHtml) {
                    console.log(`│   raw block: ${check.blockHtml.slice(0, 200)}`);
                  }
                }
              }
            }

            console.log(`└──`);
          },
          60000
        );
      }
    });
  }

  it('print final summary', () => {
    if (allResults.length === 0) {
      console.log('\n(no results — all models skipped)');
      return;
    }

    console.log('\n' + '═'.repeat(72));
    console.log('  HTML FORMAT COMPLIANCE — SUMMARY');
    console.log('═'.repeat(72));

    for (const modelConfig of MODELS) {
      const rs = allResults.filter((r) => r.model === modelConfig.shortName);
      if (rs.length === 0) continue;

      const errors = rs.filter((r) => r.error).length;
      const clean = rs.filter((r) => !r.error && r.totalViolations === 0).length;
      const dirty = rs.filter((r) => !r.error && r.totalViolations > 0).length;
      const violationKinds = new Set<string>();
      for (const r of rs) {
        for (const c of r.checks) for (const v of c.violations) violationKinds.add(v.kind);
      }
      const avgLatency = Math.round(rs.reduce((s, r) => s + r.latencyMs, 0) / rs.length);
      const avgOutTokens =
        Math.round(
          rs.reduce((s, r) => s + (r.outputTokens ?? 0), 0) /
            Math.max(1, rs.filter((r) => r.outputTokens != null).length)
        ) || 0;

      const total = rs.length;
      const pct = total === 0 ? 0 : Math.round((clean / total) * 100);

      console.log(`\n  ${modelConfig.shortName}`);
      console.log(`    runs:        ${total}`);
      console.log(`    clean:       ${clean}/${total} (${pct}%)`);
      console.log(`    violations:  ${dirty}`);
      console.log(`    errors:      ${errors}`);
      console.log(`    avg latency: ${avgLatency}ms`);
      console.log(`    avg out tok: ${avgOutTokens}`);
      if (violationKinds.size > 0) {
        console.log(`    seen kinds:  ${[...violationKinds].join(', ')}`);
      }
      console.log(`    verdict:     ${pct === 100 ? '✓ recommended' : pct >= 80 ? '~ usable' : '✗ avoid'}`);
    }
    console.log('\n' + '═'.repeat(72));

    expect(allResults.length).toBeGreaterThan(0);
  });
});
