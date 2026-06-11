/**
 * LLM call for the chat's sharepic_edit intent: one tool-forced request that
 * turns a natural-language instruction ("Zeile 2 kürzer, Balken nach oben")
 * into a validated batch of CanvasAiOperations plus a version summary and a
 * chat reply. Modeled on runCanvasSuggest (retry, Zod validation, capability
 * filtering) but returns a single applied edit instead of suggestions.
 */
import {
  sharepicEditResponseSchema,
  type CanvasAiSnapshot,
  type SharepicEditResponse,
  type SharepicTemplateDescriptor,
} from '@gruenerator/contracts';
import { jsonSchema } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createLogger } from '../../../utils/logger.js';

import type { AIWorkerPool, AIWorkerResult, Tool } from '../../../workers/types.js';

const log = createLogger('sharepicEditLlm');

export const SHAREPIC_EDIT_TOOL_NAME = 'apply_sharepic_edit';
const MAX_ATTEMPTS = 2;

export interface RunSharepicEditArgs {
  instruction: string;
  descriptor: SharepicTemplateDescriptor;
  snapshot: CanvasAiSnapshot;
  /** Summaries of the most recent prior edits, newest first (pronoun context). */
  recentEditSummaries: string[];
  aiWorkerPool: AIWorkerPool;
  req?: unknown;
}

export type RunSharepicEditResult =
  | { ok: true; edit: SharepicEditResponse }
  | { ok: false; error: string };

/** Compact German description of the current sharepic content for prompts. */
export function buildSnapshotLines(snapshot: CanvasAiSnapshot): string[] {
  const lines: string[] = [];
  for (const f of snapshot.textFields) {
    lines.push(`- ${f.label} [field=${f.field}]: ${f.value ? `"${f.value}"` : '(leer)'}`);
  }
  if (snapshot.currentColorScheme) {
    lines.push(`- Farbschema: ${snapshot.currentColorScheme}`);
  }
  if (snapshot.currentBackgroundColor) {
    lines.push(`- Hintergrundfarbe: ${snapshot.currentBackgroundColor}`);
  }
  for (const el of snapshot.elementsSummary) {
    lines.push(`- Element [id=${el.id}]: ${el.label}`);
  }
  return lines;
}

/**
 * Per-template catalog of allowed operations with exact schemas and bounds.
 * Shared between the single-call edit prompt and the agentic tool loop so the
 * two paths can't drift apart.
 */
export function buildOperationCatalog(descriptor: SharepicTemplateDescriptor): string[] {
  const lines: string[] = [];
  const supported = new Set(descriptor.supportedOperations);
  lines.push('ERLAUBTE OPERATIONEN (genaue Schemas, Schlüssel ist "kind"):');
  if (supported.has('set-text')) {
    lines.push(
      '  - { "kind": "set-text", "field": "<field>", "label": "<Label>", "value": "<neuer Text>" }'
    );
  }
  if (supported.has('set-font-size')) {
    const bounds = descriptor.textFields
      .filter((f) => f.fontSize)
      .map((f) => `${f.field}: ${f.fontSize!.min}–${f.fontSize!.max}px`)
      .join(', ');
    lines.push(
      `  - { "kind": "set-font-size", "field": "<field>", "label": "<Label>", "size": <Zahl> } (${bounds})`
    );
  }
  if (supported.has('set-color-scheme') && descriptor.colorSchemes) {
    const ids = descriptor.colorSchemes.options.map((o) => `"${o.id}" (${o.label})`).join(', ');
    lines.push(`  - { "kind": "set-color-scheme", "schemeId": <id> } — nur: ${ids}`);
  }
  if (supported.has('set-background-color') && descriptor.backgroundColors) {
    const colors = descriptor.backgroundColors.options
      .map((o) => `"${o.color}" (${o.label})`)
      .join(', ');
    lines.push(`  - { "kind": "set-background-color", "color": <hex> } — nur: ${colors}`);
  }
  if (supported.has('toggle-sunflower')) {
    lines.push('  - { "kind": "toggle-sunflower", "visible": true | false }');
  }
  if (supported.has('update-element') && descriptor.elements.length > 0) {
    lines.push(
      '  - { "kind": "update-element", "elementId": "<id>", "patch": { "x"?: Zahl, "y"?: Zahl, "scale"?: Zahl } }'
    );
    for (const el of descriptor.elements) {
      const scalePart = el.scale ? `, scale ${el.scale.min}–${el.scale.max}` : '';
      // Offset elements (bounds spanning negative y) move relative to their
      // anchor; absolute elements use canvas coordinates where smaller y is
      // higher up. The wrong hint sends the model in the wrong direction.
      const directionHint =
        el.bounds.minY < 0
          ? 'Negative y = nach oben.'
          : 'Absolute Position: kleinere y-Werte = weiter oben.';
      lines.push(
        `    elementId "${el.id}" (${el.label}): x ${el.bounds.minX}..${el.bounds.maxX}, y ${el.bounds.minY}..${el.bounds.maxY}${scalePart}. ${directionHint}`
      );
    }
  }
  if (supported.has('set-background-image')) {
    lines.push(
      '  - { "kind": "set-background-image", "query": "<deutsche Bildsuche, z.B. Windräder Sonnenuntergang>" }'
    );
  }
  return lines;
}

function buildSystemPrompt(
  descriptor: SharepicTemplateDescriptor,
  snapshot: CanvasAiSnapshot,
  recentEditSummaries: string[]
): string {
  const lines: string[] = [
    'Du bist der Bearbeitungs-Assistent für Sharepics der deutschen Grünen.',
    'Der*die Nutzer*in beschreibt EINE gewünschte Änderung am aktuellen Sharepic.',
    'Du setzt sie als konkrete Operationen um — keine Vorschläge, keine Rückfragen.',
    '',
    'Sprachregeln: Du-Form, Genderstern (z.B. "Bürger*innen"), prägnante Kampagnen-Texte.',
    '',
    `Vorlage: ${descriptor.label} (${descriptor.id})`,
    '',
    'Aktueller Inhalt:',
    ...buildSnapshotLines(snapshot),
  ];

  if (recentEditSummaries.length > 0) {
    lines.push('');
    lines.push('Letzte Änderungen (neueste zuerst):');
    for (const s of recentEditSummaries) lines.push(`- ${s}`);
  }

  lines.push('');
  lines.push(...buildOperationCatalog(descriptor));

  lines.push('');
  lines.push(`Antworte AUSSCHLIESSLICH über das Tool "${SHAREPIC_EDIT_TOOL_NAME}" mit:`);
  lines.push('- "operations": 1–8 Operationen, die die Anweisung vollständig umsetzen.');
  lines.push(
    '- "summary": Kurzlabel der Änderung auf Deutsch, max. 120 Zeichen (z.B. "Zeile 2 gekürzt").'
  );
  lines.push('- "reply": 1–2 freundliche Sätze Bestätigung für den Chat.');
  lines.push('');
  lines.push('Ändere NUR, was verlangt wurde. Nutze nur die gelisteten Felder, IDs und Werte.');

  return lines.join('\n');
}

function extractToolCall(result: AIWorkerResult): Record<string, unknown> | null {
  if (result.tool_calls) {
    const match = result.tool_calls.find((c) => c.name === SHAREPIC_EDIT_TOOL_NAME);
    if (match) return match.input;
  }
  if (result.raw_content_blocks) {
    for (const block of result.raw_content_blocks) {
      if (block.type === 'tool_use' && block.name === SHAREPIC_EDIT_TOOL_NAME && block.input) {
        return block.input;
      }
    }
  }
  return null;
}

export async function runSharepicEdit(args: RunSharepicEditArgs): Promise<RunSharepicEditResult> {
  const { instruction, descriptor, snapshot, recentEditSummaries, aiWorkerPool, req } = args;

  const systemPrompt = buildSystemPrompt(descriptor, snapshot, recentEditSummaries);
  const userMessage =
    `Setze JETZT diese Änderung mit dem Tool ${SHAREPIC_EDIT_TOOL_NAME} um:\n\n${instruction}\n\n` +
    'Antworte ausschließlich über den Tool-Aufruf — keinen Begleittext.';

  // Same jsonSchema() wrapping as runCanvasSuggest — the AI SDK's asSchema
  // helper rejects raw JSON-Schema objects.
  const rawSchema = zodToJsonSchema(sharepicEditResponseSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  const tool: Tool = {
    name: SHAREPIC_EDIT_TOOL_NAME,
    description: 'Wendet eine Änderung auf das aktuelle Sharepic an.',
    input_schema: jsonSchema(
      rawSchema as Parameters<typeof jsonSchema>[0]
    ) as unknown as Tool['input_schema'],
  };

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await aiWorkerPool.processRequest(
        {
          type: 'canvas_ai_suggest',
          systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          options: {
            tools: [tool],
            tool_choice: 'required',
            temperature: 0.2,
          },
        },
        req
      );

      if (!result.success) {
        lastError = result.error || 'AI request failed';
        log.warn(`[sharepic_edit] attempt ${attempt} provider error: ${lastError}`);
        continue;
      }

      const toolInput = extractToolCall(result);
      if (!toolInput) {
        lastError = 'No tool call in response';
        log.warn(
          `[sharepic_edit] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
        );
        continue;
      }

      const parsed = sharepicEditResponseSchema.safeParse(toolInput);
      if (!parsed.success) {
        lastError = `Schema mismatch: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`;
        log.warn(
          `[sharepic_edit] attempt ${attempt}: ${lastError}\n  raw: ${JSON.stringify(toolInput).slice(0, 600)}`
        );
        continue;
      }

      return { ok: true, edit: parsed.data };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`[sharepic_edit] attempt ${attempt} threw: ${lastError}`);
    }
  }

  return { ok: false, error: lastError || 'unknown error' };
}
