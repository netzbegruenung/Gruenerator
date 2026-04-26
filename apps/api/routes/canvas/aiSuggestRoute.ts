/**
 * POST /api/canvas/ai-suggest
 *
 * ts-rest contract handler for the canvas AI suggestions endpoint.
 *
 * Pipeline:
 *   1. ts-rest validates request body against canvasAiSuggestRequestSchema.
 *   2. Build a German system prompt from the snapshot + capabilities.
 *   3. Build a Zod-derived JSON schema for the LLM tool.
 *   4. Submit to AIWorkerPool against the regolo provider with a forced
 *      tool call. One retry on validation failure.
 *   5. Validate the tool-call args against canvasAiSuggestResponseSchema.
 *   6. Filter out operations the template doesn't support.
 *   7. Return typed suggestions.
 *
 * Provider choice (regolo): user direction. Regolo is OpenAI-compatible
 * via the Vercel AI SDK and supports tool calling.
 */
import {
  canvasAiContract,
  canvasAiSuggestResponseSchema,
  type CanvasAiOperation,
  type CanvasAiOperationKind,
  type CanvasAiSnapshot,
  type CanvasAiSuggestion,
} from '@gruenerator/contracts';
import { initServer, createExpressEndpoints } from '@ts-rest/express';
import { jsonSchema } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import type { AIWorkerResult, Tool } from '../../workers/types.js';
import type { Application } from 'express';

const log = createLogger('canvasAiSuggest');

const TOOL_NAME = 'submit_canvas_suggestions';

// ── Prompt construction ─────────────────────────────────────────────────────

function buildSystemPrompt(
  snapshot: CanvasAiSnapshot,
  capabilities: {
    supportedOperations: string[];
    colorSchemes?: Array<{ id: string; label: string }> | null | undefined;
    illustrations?: Array<{ id: string; label: string }> | null | undefined;
    assets?: Array<{ id: string; label: string }> | null | undefined;
  }
): string {
  const supported = capabilities.supportedOperations.join(', ');

  const lines: string[] = [
    'Du bist ein KI-Assistent für eine Design-Plattform der deutschen Grünen.',
    'Du erzeugst konkrete, umsetzbare Vorschläge zur Verbesserung des aktuellen Sharepic-Entwurfs.',
    '',
    'Sprachregeln (zwingend):',
    '- Verwende immer die Du-Form (informell).',
    '- Verwende Genderstern bei Personenbezeichnungen (z.B. "Bürger*innen", "Wähler*innen").',
    '- Halte Texte prägnant und kampagnentauglich.',
    '',
    `Aktive Vorlage: ${snapshot.template}`,
    `Verfügbare Operations-Typen: ${supported}`,
    '',
    'Aktueller Inhalt:',
  ];

  for (const f of snapshot.textFields) {
    const preview = f.value.length > 0 ? `"${f.value}"` : '(leer)';
    lines.push(`- ${f.label} [field=${f.field}]: ${preview}`);
  }

  if (snapshot.currentColorScheme) {
    lines.push(`- Aktuelles Farbschema: ${snapshot.currentColorScheme}`);
  }
  if (snapshot.currentBackgroundColor) {
    lines.push(`- Hintergrundfarbe: ${snapshot.currentBackgroundColor}`);
  }
  if (snapshot.currentColorMode) {
    lines.push(`- Farbmodus: ${snapshot.currentColorMode}`);
  }

  if (capabilities.colorSchemes && capabilities.colorSchemes.length > 0) {
    lines.push('');
    lines.push('Verfügbare Farbschemata (id → Bezeichnung):');
    for (const s of capabilities.colorSchemes) {
      lines.push(`- ${s.id} → ${s.label}`);
    }
  }

  if (capabilities.illustrations && capabilities.illustrations.length > 0) {
    lines.push('');
    lines.push('Verfügbare Illustrationen (id → Bezeichnung):');
    for (const i of capabilities.illustrations.slice(0, 40)) {
      lines.push(`- ${i.id} → ${i.label}`);
    }
  }

  if (capabilities.assets && capabilities.assets.length > 0) {
    lines.push('');
    lines.push('Verfügbare Elemente (id → Bezeichnung):');
    for (const a of capabilities.assets) {
      lines.push(`- ${a.id} → ${a.label}`);
    }
  }

  if (snapshot.elementsSummary.length > 0) {
    lines.push('');
    lines.push('Bereits platzierte Elemente:');
    for (const e of snapshot.elementsSummary) {
      lines.push(`- [${e.kind}] ${e.id}: ${e.label}`);
    }
  }

  lines.push('');
  lines.push(
    `Antworte ausschließlich über das Tool "${TOOL_NAME}" mit 3 bis 5 sinnvollen Vorschlägen.`
  );
  lines.push(
    'Jeder Vorschlag darf nur die oben aufgeführten Operations-Typen enthalten und nur Felder/IDs verwenden, die explizit gelistet sind.'
  );
  lines.push('');
  lines.push('PFLICHT-FORMAT eines Vorschlags (genaues Schema, andere Schlüssel sind ungültig):');
  lines.push('```json');
  lines.push('{');
  lines.push('  "title": "Kurze Bezeichnung des Vorschlags",');
  lines.push('  "description": "1-2 Sätze, warum das hilft (optional)",');
  lines.push('  "operations": [ /* eine oder mehrere Operationen, siehe Schemas unten */ ]');
  lines.push('}');
  lines.push('```');
  lines.push('');
  lines.push('Strikte Top-Level-Regeln:');
  lines.push('- Top-Level: { "suggestions": [ { Vorschlag }, ... ] }');
  lines.push(
    '- Jeder Vorschlag MUSS "title" und "operations" enthalten. "description" ist optional.'
  );
  lines.push(
    '- Operationen werden NIEMALS direkt in "suggestions" platziert — sie liegen IMMER in "operations" innerhalb eines Vorschlags.'
  );
  lines.push(
    '- Jede Operation verwendet den Schlüssel "kind" (NICHT "type"). Schlüssel sind je Operations-Typ unterschiedlich, siehe Schemas unten.'
  );
  lines.push('');
  lines.push('OPERATION-SCHEMAS (NUR diese Typen sind in dieser Vorlage erlaubt):');
  const supportedSet = new Set(capabilities.supportedOperations);
  if (supportedSet.has('set-text')) {
    lines.push(
      '  - { "kind": "set-text", "field": "<field>", "label": "<Feld-Label>", "value": "<neuer Text>" }'
    );
    lines.push(
      '    "field" MUSS einer der oben unter "Aktueller Inhalt" gelisteten Feld-Identifier sein (z.B. "quote", "line1", "title"). "value" enthält den NEUEN Text. Niemals "text" als Schlüssel verwenden.'
    );
  }
  if (supportedSet.has('set-color-scheme')) {
    lines.push('  - { "kind": "set-color-scheme", "schemeId": "<id aus Liste oben>" }');
    lines.push(
      '    "schemeId" MUSS exakt einer der gelisteten ids sein. Erfinde keine neuen Schemes.'
    );
  }
  if (supportedSet.has('set-background-color')) {
    lines.push('  - { "kind": "set-background-color", "color": "#RRGGBB" }');
    lines.push(
      '    Schlüssel ist "color" (NICHT "value"). Hex-Format mit # und 6 Ziffern (z.B. "#005538"). Lowercase oder Uppercase ok.'
    );
  }
  if (supportedSet.has('set-color-mode')) {
    lines.push('  - { "kind": "set-color-mode", "mode": "light" | "dark" }');
    lines.push('    "mode" ist EXAKT einer dieser zwei Strings. Keine anderen Werte.');
  }
  if (supportedSet.has('add-illustration')) {
    lines.push(
      '  - { "kind": "add-illustration", "illustrationId": "<id aus Liste oben>", "color"?: "#RRGGBB" }'
    );
    lines.push(
      '    "color" ist optional und tönt die Illustration. Lasse das Feld weg, wenn die Standardfarbe passt.'
    );
  }
  if (supportedSet.has('add-asset')) {
    lines.push('  - { "kind": "add-asset", "assetId": "<id aus Liste oben>" }');
    lines.push('    "assetId" MUSS exakt einer der gelisteten ids sein.');
  }
  if (supportedSet.has('remove-element')) {
    lines.push(
      '  - { "kind": "remove-element", "elementId": "<id aus den platzierten Elementen>" }'
    );
    lines.push(
      '    "elementId" MUSS aus dem Abschnitt "Bereits platzierte Elemente" stammen. Niemals raten.'
    );
  }
  if (supportedSet.has('toggle-sunflower')) {
    lines.push('  - { "kind": "toggle-sunflower", "visible": true | false }');
  }
  if (supportedSet.has('set-font-size')) {
    lines.push(
      '  - { "kind": "set-font-size", "field": "<field>", "label": "<Feld-Label>", "size": <integer 1..500> }'
    );
    lines.push(
      '    "size" ist eine ganze Zahl in Pixeln. Realistische Werte: Headlines 60–120, Body 28–48.'
    );
  }
  if (supportedSet.has('update-element')) {
    lines.push('  - { "kind": "update-element", "elementId": "<id>", "patch": { ... } }');
    lines.push('    "patch" muss MINDESTENS EIN Feld aus dieser Liste enthalten:');
    lines.push('      - "color": "#RRGGBB"');
    lines.push('      - "opacity": Zahl 0..1 (z.B. 0.5)');
    lines.push('      - "scale": positive Zahl, max 10 (z.B. 1.2)');
    lines.push('      - "rotation": Grad zwischen -360 und 360');
    lines.push('      - "x": Zahl (Pixel-Position)');
    lines.push('      - "y": Zahl (Pixel-Position)');
    lines.push(
      '    "elementId" MUSS aus "Bereits platzierte Elemente" stammen. Werte außerhalb des erlaubten Bereichs werden zurückgewiesen.'
    );
  }

  // Strong preference rules: prevent "invented hex colors" when a scheme list is available.
  if (
    supportedSet.has('set-color-scheme') &&
    capabilities.colorSchemes &&
    capabilities.colorSchemes.length > 0
  ) {
    lines.push('');
    lines.push(
      'WICHTIG zu Farben: Diese Vorlage hat ein festes Farbschema (siehe oben). Wenn du Farben ändern willst, nutze IMMER set-color-scheme mit einer schemeId aus der Liste. Erfinde NIEMALS eigene Hex-Farben (z.B. #2E7D32, #4A90E2). Set-background-color ist nur für Vorlagen ohne Farbschema gedacht.'
    );
  } else if (supportedSet.has('set-background-color')) {
    lines.push('');
    lines.push(
      'WICHTIG zu Farben: Beschränke Hex-Farben auf das Grüne CI. Bevorzugte Markenfarben: Tanne #005538, Sand #F5F1E9, Lila #6F2DA8, Pink #FF7F8E, Gelb #FFD320. Erfinde keine willkürlichen Farben (z.B. #2E7D32, #4A90E2) — die wirken off-brand.'
    );
    lines.push(
      'KONTRAST-PFLICHT: Stelle sicher, dass die Hintergrundfarbe genug Kontrast zu Texten und Elementen auf der Vorlage bietet. Wenn die aktuelle Hintergrundfarbe bereits dunkel ist (z.B. Tanne #005538), schlage KEINE weitere dunkle Farbe vor. Wenn der Text auf der Vorlage z.B. weiß ist, wähle dunkle Hintergründe. Vermeide Grün-auf-Grün, Hell-auf-Hell, Dunkel-auf-Dunkel.'
    );
  }

  return lines.join('\n');
}

// ── Validation + filtering ──────────────────────────────────────────────────

function isSupported(op: CanvasAiOperation, supported: ReadonlyArray<string>): boolean {
  return supported.includes(op.kind as CanvasAiOperationKind);
}

function filterSuggestions(
  suggestions: CanvasAiSuggestion[],
  supported: ReadonlyArray<string>
): CanvasAiSuggestion[] {
  return suggestions
    .map((s) => ({
      ...s,
      operations: s.operations.filter((op) => isSupported(op, supported)),
    }))
    .filter((s) => s.operations.length > 0);
}

// ── Tool call extraction ────────────────────────────────────────────────────

/**
 * Pull the tool-call args for our submit_canvas_suggestions tool out of
 * an AIWorkerResult. Adapters return tool calls in either of two shapes
 * (canonical `tool_calls[]` or Anthropic-style `raw_content_blocks[]`),
 * both of which are typed at the worker pool boundary — no casts needed.
 */
function extractToolCall(result: AIWorkerResult): Record<string, unknown> | null {
  if (result.tool_calls) {
    const match = result.tool_calls.find((c) => c.name === TOOL_NAME);
    if (match) return match.input;
  }
  if (result.raw_content_blocks) {
    for (const block of result.raw_content_blocks) {
      if (block.type === 'tool_use' && block.name === TOOL_NAME && block.input) {
        return block.input;
      }
    }
  }
  return null;
}

// ── Contract router ─────────────────────────────────────────────────────────

const s = initServer();

export const canvasAiContractRouter = s.router(canvasAiContract, {
  suggest: async (args) => {
    const { req } = args;
    const { prompt, snapshot, capabilities } = args.body;

    const systemPrompt = buildSystemPrompt(snapshot, capabilities);

    // zod-to-json-schema returns a plain JSON Schema 7 object. The Vercel
    // AI SDK's `asSchema` helper expects a Zod schema OR a `Schema` object
    // wrapped via `jsonSchema()` — passing the raw JSON Schema causes
    // `TypeError: schema is not a function` at the adapter boundary.
    // Wrapping with `jsonSchema()` gives the SDK what it needs.
    //
    // The cast to Tool['input_schema'] is a deliberate widening — the
    // worker pool's transport type is plain JSON, but adapters cast it
    // back to the SDK's Schema shape. The Schema object is structurally
    // compatible (it's still a JS object).
    // zod-to-json-schema's return type is structurally a JSONSchema7 but
    // typed as a narrower union. The cast here bridges the two
    // independent JSON-Schema-7 representations between the two libs.
    const rawSchema = zodToJsonSchema(canvasAiSuggestResponseSchema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    });
    const wrappedSchema = jsonSchema(rawSchema as Parameters<typeof jsonSchema>[0]);

    const tool: Tool = {
      name: TOOL_NAME,
      description:
        'Reicht 3 bis 5 konkrete Vorschläge zur Verbesserung des aktuellen Sharepic-Entwurfs ein.',
      input_schema: wrappedSchema as unknown as Tool['input_schema'],
    };

    let attempt = 0;
    const maxAttempts = 2;
    let lastError = '';

    while (attempt < maxAttempts) {
      attempt++;
      try {
        const result = await getAIWorkerPool(req).processRequest(
          {
            type: 'canvas_ai_suggest',
            // No explicit provider — the AIService routes by request type
            // and configured providers. Forcing 'regolo' caused a model
            // mismatch (regolo doesn't serve gpt-oss:120b which the
            // service's selector picked).
            systemPrompt,
            // User message is prefixed with an explicit tool-use directive.
            // gpt-oss tends to fall back to plain-text answers on long
            // prompts even with `tool_choice: 'required'`; weighting the
            // user turn shifts its preference toward calling the tool.
            messages: [
              {
                role: 'user',
                content: `Verwende JETZT das Tool ${TOOL_NAME} mit 3 bis 5 Vorschlägen für folgende Anweisung:\n\n${prompt}\n\nAntworte ausschließlich über den Tool-Aufruf — keinen Begleittext.`,
              },
            ],
            options: {
              tools: [tool],
              // 'required' forces the model to emit a tool call. We only
              // ship one tool, so the choice is unambiguous. The
              // `{type:'tool', name:...}` Anthropic-style format is not
              // recognized by the adapter's translation layer (it
              // downgrades unknown shapes to 'auto'), which let
              // models silently skip the tool call.
              tool_choice: 'required',
              // Low temperature: this is a tool-call task with strict schema
              // adherence. 0.7 caused the model to generalize keys across
              // operation kinds (e.g. emitting "value" for set-background-color
              // because set-text uses "value"). 0.3 keeps schemas precise.
              temperature: 0.3,
            },
          },
          req
        );

        if (!result.success) {
          lastError = result.error || 'AI request failed';
          log.warn(`[canvas_ai_suggest] attempt ${attempt} provider error: ${lastError}`);
          continue;
        }

        const toolInput = extractToolCall(result);
        if (!toolInput) {
          lastError = 'No tool call in response';
          // Diagnostic: when the model skips the tool, log stop_reason +
          // content preview so we can see what it returned instead.
          const contentPreview = (result.content ?? '').slice(0, 400);
          log.warn(
            `[canvas_ai_suggest] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'}) content="${contentPreview}"`
          );
          continue;
        }

        const parsed = canvasAiSuggestResponseSchema.safeParse(toolInput);
        if (!parsed.success) {
          lastError = `Schema mismatch: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}`;
          // Log the raw tool-call payload so we can see what shape the
          // model actually returned vs what the schema expected. Truncate
          // to keep logs sane.
          const rawPreview = JSON.stringify(toolInput).slice(0, 800);
          log.warn(
            `[canvas_ai_suggest] attempt ${attempt}: ${lastError}\n  raw payload: ${rawPreview}`
          );
          continue;
        }

        const filtered = filterSuggestions(
          parsed.data.suggestions,
          capabilities.supportedOperations
        );

        return {
          status: 200 as const,
          body: { suggestions: filtered },
        };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        log.error(`[canvas_ai_suggest] attempt ${attempt} threw: ${lastError}`);
      }
    }

    return {
      status: 500 as const,
      body: { error: `Konnte keine Vorschläge erzeugen (${lastError})` },
    };
  },
});

export function mountCanvasAiContractRouter(app: Application): void {
  createExpressEndpoints(canvasAiContract, canvasAiContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'canvasAiContract'),
  });
}
