/**
 * One-shot writing-style analysis for the "Texte anlernen" feature.
 *
 * Takes the user's pasted example texts and distills their COMMONALITIES into an
 * editable German style block — the per-user, self-service analogue of the central
 * LV corpus analysis (services/agents/prAgentInsightService.ts), but sourced from
 * the user's own examples instead of Qdrant. A single Mistral `generateObject`
 * call extracts structured style fields; we render them deterministically to the
 * markdown block that later gets injected into the chat system prompt.
 */

import { type TextFormType } from '@gruenerator/contracts';
import { generateObject } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel } from '../ai/providers.js';

const log = createLogger('TextFormAnalysisService');

const ANALYSIS_MODEL = 'mistral-large-latest';

const TEXT_TYPE_LABELS: Record<TextFormType, string> = {
  instagram: 'Instagram-Posts',
  facebook: 'Facebook-Posts',
  presse: 'Pressemitteilungen',
  antrag: 'Anträge',
};

// Structured extraction. Free strings/arrays — the deterministic renderer below
// turns them into the injected block, so the model never has to format markdown.
const StyleSchema = z.object({
  tonality: z
    .string()
    .describe('Tonalität und Ansprache (z.B. direkt, kämpferisch, sachlich, Du/Sie)'),
  sentenceStyle: z.string().describe('Satzbau, Satzlänge, Rhythmus, typische Konstruktionen'),
  vocabulary: z.string().describe('Typischer Wortschatz, wiederkehrende Begriffe, Anrede'),
  structure: z
    .string()
    .describe('Aufbau: Einstieg/Hook, Gliederung, Call-to-Action, Hashtags, Zitat-Architektur'),
  dos: z.array(z.string()).describe('Konkrete Stil-Merkmale, die beibehalten werden sollen'),
  donts: z.array(z.string()).describe('Was NICHT zum Stil passt und vermieden werden soll'),
  signaturePhrases: z
    .array(z.string())
    .describe('Wörtliche, wiederkehrende Formulierungen aus den Beispielen'),
});

type StyleExtract = z.infer<typeof StyleSchema>;

const SYSTEM_PROMPT = `Du bist ein Stil-Analyst. Dir werden mehrere echte Beispieltexte derselben Person oder Organisation vorgelegt. Deine Aufgabe: die GEMEINSAMKEITEN des Schreibstils herausarbeiten — nicht die Inhalte zusammenfassen.

Regeln:
- Beschreibe nur, was in den Beispielen tatsächlich erkennbar ist. Erfinde keine Merkmale.
- signaturePhrases: nur Formulierungen, die WÖRTLICH (oder fast wörtlich) in den Beispielen vorkommen.
- Schreibe auf Deutsch, knapp und präzise. Keine Meta-Kommentare.`;

function buildExamplesText(examples: ReadonlyArray<{ content: string }>): string {
  return examples.map((e, i) => `--- Beispiel ${i + 1} ---\n${e.content.trim()}`).join('\n\n');
}

function renderStyleBlock(label: string, s: StyleExtract): string {
  const parts: string[] = [];
  parts.push(`## STIL: ${label}`);
  parts.push(
    `Schreibe ${label} genau in diesem angelernten Stil. Diese Vorgaben haben Vorrang vor allgemeinen Stilregeln.`
  );
  parts.push(`**Tonalität:** ${s.tonality}`);
  parts.push(`**Satzbau:** ${s.sentenceStyle}`);
  parts.push(`**Vokabular & Anrede:** ${s.vocabulary}`);
  parts.push(`**Aufbau:** ${s.structure}`);
  if (s.dos.length > 0) {
    parts.push('**Beachte:**\n' + s.dos.map((d) => `- ${d}`).join('\n'));
  }
  if (s.donts.length > 0) {
    parts.push('**Vermeide:**\n' + s.donts.map((d) => `- ${d}`).join('\n'));
  }
  if (s.signaturePhrases.length > 0) {
    parts.push(
      '**Wiederkehrende Formulierungen:**\n' + s.signaturePhrases.map((p) => `- „${p}"`).join('\n')
    );
  }
  return parts.join('\n\n');
}

/**
 * Analyze example texts into an editable style block. `label` describes the text
 * form (a preset label like "Pressemitteilungen" or a custom title). Returns the
 * rendered markdown block the user then edits and saves.
 */
export async function analyzeTextForm(
  label: string,
  examples: ReadonlyArray<{ content: string }>
): Promise<{ styleBlock: string; model: string }> {
  const model = getModel('mistral', ANALYSIS_MODEL);

  const result = await generateObject({
    model,
    schema: StyleSchema,
    system: SYSTEM_PROMPT,
    prompt: `## ${label} — Beispiele\n\n${buildExamplesText(examples)}\n\nAnalysiere die Gemeinsamkeiten des Schreibstils.`,
    maxOutputTokens: 2000,
    temperature: 0.25,
    abortSignal: AbortSignal.timeout(45000),
  });

  const styleBlock = renderStyleBlock(label, result.object);
  log.info(
    `[analyzeTextForm] "${label}" — ${examples.length} examples → ${styleBlock.length} chars`
  );
  return { styleBlock, model: ANALYSIS_MODEL };
}

/** Human-readable label for a preset text type (for prompts & headings). */
export function textTypeLabel(textType: TextFormType): string {
  return TEXT_TYPE_LABELS[textType];
}
