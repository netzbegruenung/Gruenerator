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

import { runToolForcedEdit } from './toolForcedEdit.js';

import type { AiClient } from '../../../services/ai/types.js';

export const REEL_EDIT_TOOL_NAME = 'apply_reel_subtitle_edit';

export interface RunReelEditArgs {
  instruction: string;
  segments: SubtitleSegment[];
  /** Summaries of the most recent prior edits, newest first (pronoun context). */
  recentEditSummaries: string[];
  aiClient: AiClient;
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

export async function runReelEdit(args: RunReelEditArgs): Promise<RunReelEditResult> {
  const { instruction, segments, recentEditSummaries, aiClient, req } = args;

  return runToolForcedEdit({
    toolName: REEL_EDIT_TOOL_NAME,
    description: 'Wendet Text-Änderungen auf die Untertitel des aktuellen Reels an.',
    schema: reelEditResponseSchema,
    systemPrompt: buildSystemPrompt(segments, recentEditSummaries),
    instruction,
    logPrefix: '[reel_edit]',
    aiClient,
    ...(req !== undefined && { req }),
  });
}
