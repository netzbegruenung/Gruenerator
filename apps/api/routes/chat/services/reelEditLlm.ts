/**
 * LLM call for the chat's reel-edit branch: one tool-forced request that
 * turns a natural-language instruction ("Korrigiere den Tippfehler in
 * Segment 2") into validated text-only subtitle operations plus a summary
 * and a chat reply. Modeled on runSharepicEdit (retry, Zod validation) —
 * much simpler because the operation vocabulary is just {segmentIndex,
 * newText} and timestamps are never touched.
 */
import { reelEditResponseSchema, type ReelEditResponse } from '@gruenerator/contracts';
import { formatTimeWithFraction, type SubtitleSegment } from '@gruenerator/shared/subtitle-editor';
import { jsonSchema } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { createLogger } from '../../../utils/logger.js';

import type { AIWorkerPool, AIWorkerResult, Tool } from '../../../workers/types.js';

const log = createLogger('reelEditLlm');

export const REEL_EDIT_TOOL_NAME = 'apply_reel_subtitle_edit';
const MAX_ATTEMPTS = 2;

export interface RunReelEditArgs {
  instruction: string;
  segments: SubtitleSegment[];
  /** Summaries of the most recent prior edits, newest first (pronoun context). */
  recentEditSummaries: string[];
  aiWorkerPool: AIWorkerPool;
  req?: unknown;
}

export type RunReelEditResult = { ok: true; edit: ReelEditResponse } | { ok: false; error: string };

function buildSegmentLines(segments: SubtitleSegment[]): string[] {
  return segments.map(
    (s, index) =>
      `[${index}] ${formatTimeWithFraction(s.startTime)}–${formatTimeWithFraction(s.endTime)}: "${s.text}"`
  );
}

function buildSystemPrompt(segments: SubtitleSegment[], recentEditSummaries: string[]): string {
  const lines: string[] = [
    'Du bist der Untertitel-Assistent für Reels von Bündnis 90/Die Grünen und den österreichischen Grünen.',
    'Der*die Nutzer*in beschreibt eine gewünschte TEXT-Änderung an den Untertiteln des Videos.',
    'Du setzt sie als konkrete Operationen um — keine Vorschläge, keine Rückfragen.',
    '',
    'Sprachregeln: Du-Form, Genderstern (z.B. "Bürger*innen").',
    'Die Untertitel sind gesprochene Sprache — behalte den mündlichen Ton bei.',
    'Behalte die regionale Schreibweise des vorhandenen Texts bei: deutschland- oder',
    'österreichspezifische Begriffe (z.B. "Jänner", "heuer") NICHT "korrigieren".',
    '',
    'Aktuelle Untertitel (Index | Zeit | Text):',
    ...buildSegmentLines(segments),
  ];

  if (recentEditSummaries.length > 0) {
    lines.push('');
    lines.push('Letzte Änderungen (neueste zuerst):');
    for (const s of recentEditSummaries) lines.push(`- ${s}`);
  }

  lines.push('');
  lines.push('REGELN:');
  lines.push('- Du änderst NUR Text. Zeiten, Reihenfolge und Anzahl der Segmente sind fix.');
  lines.push(
    '- Ein Segment wird in ca. 2,5 Sekunden gelesen — halte neue Texte ähnlich lang wie das Original.'
  );
  lines.push('- Ändere nur Segmente, die die Anweisung betreffen.');
  lines.push('');
  lines.push(`Antworte AUSSCHLIESSLICH über das Tool "${REEL_EDIT_TOOL_NAME}" mit:`);
  lines.push(
    '- "operations": [{ "segmentIndex": <Index aus der Liste>, "newText": "<neuer Text>" }] (1–20 Operationen).'
  );
  lines.push(
    '- "summary": Kurzlabel der Änderung auf Deutsch, max. 120 Zeichen (z.B. "Tippfehler in Segment 2 korrigiert").'
  );
  lines.push('- "reply": 1–2 freundliche Sätze Bestätigung für den Chat.');

  return lines.join('\n');
}

function extractToolCall(result: AIWorkerResult): Record<string, unknown> | null {
  if (result.tool_calls) {
    const match = result.tool_calls.find((c) => c.name === REEL_EDIT_TOOL_NAME);
    if (match) return match.input;
  }
  if (result.raw_content_blocks) {
    for (const block of result.raw_content_blocks) {
      if (block.type === 'tool_use' && block.name === REEL_EDIT_TOOL_NAME && block.input) {
        return block.input;
      }
    }
  }
  return null;
}

export async function runReelEdit(args: RunReelEditArgs): Promise<RunReelEditResult> {
  const { instruction, segments, recentEditSummaries, aiWorkerPool, req } = args;

  const systemPrompt = buildSystemPrompt(segments, recentEditSummaries);
  const userMessage =
    `Setze JETZT diese Änderung mit dem Tool ${REEL_EDIT_TOOL_NAME} um:\n\n${instruction}\n\n` +
    'Antworte ausschließlich über den Tool-Aufruf — keinen Begleittext.';

  // Same jsonSchema() wrapping as runSharepicEdit — the AI SDK's asSchema
  // helper rejects raw JSON-Schema objects.
  const rawSchema = zodToJsonSchema(reelEditResponseSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  });
  const tool: Tool = {
    name: REEL_EDIT_TOOL_NAME,
    description: 'Wendet Text-Änderungen auf die Untertitel des aktuellen Reels an.',
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
        log.warn(`[reel_edit] attempt ${attempt} provider error: ${lastError}`);
        continue;
      }

      const toolInput = extractToolCall(result);
      if (!toolInput) {
        lastError = 'No tool call in response';
        log.warn(
          `[reel_edit] attempt ${attempt}: no tool call (stop_reason=${result.stop_reason ?? 'unknown'})`
        );
        continue;
      }

      const parsed = reelEditResponseSchema.safeParse(toolInput);
      if (!parsed.success) {
        lastError = `Schema mismatch: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`;
        log.warn(
          `[reel_edit] attempt ${attempt}: ${lastError}\n  raw: ${JSON.stringify(toolInput).slice(0, 600)}`
        );
        continue;
      }

      return { ok: true, edit: parsed.data };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      log.error(`[reel_edit] attempt ${attempt} threw: ${lastError}`);
    }
  }

  return { ok: false, error: lastError || 'unknown error' };
}
