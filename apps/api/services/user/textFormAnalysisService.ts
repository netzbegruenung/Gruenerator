/**
 * One-shot writing-style analysis for the "Texte anlernen" feature.
 *
 * Takes the user's pasted example texts and distills their COMMONALITIES into an
 * editable German style block, sourced from the user's own pasted examples
 * instead of a central corpus. A single forced tool call on the `creator_draft`
 * lane extracts structured style fields; we render them deterministically to the
 * markdown block that later gets injected into the chat system prompt.
 */

import {
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  TEXT_FORM_TYPE_LABELS,
  type TextFormType,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { aiObject } from '../ai/generate.js';
import { laneTarget } from '../ai/lanes.js';
import { type StructuredValidation } from '../ai/structuredParsing.js';
import { toolInputJsonSchema } from '../ai/toolJsonSchema.js';

const log = createLogger('TextFormAnalysisService');

/**
 * Dieselbe Gemma-Lane wie Entwurf und „Mit KI erstellen" (`textFormDraftService`):
 * alles, was über ein Rezept schreibt. Bis 11/2026 ging die Analyse direkt mit
 * `generateObject` an Mistral Large — an Tabelle, Ausweichkette und
 * Gesundheitsvermerk vorbei; zwei kurze Beispiele brauchten dort ~90 s, der
 * Browser gab nach 60 s auf.
 */
const ANALYSIS_LANE = 'creator_draft' as const;

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

const STYLE_TOOL_SCHEMA = toolInputJsonSchema(StyleSchema);

/**
 * Gemma schreibt Abfolgen gern als LaTeX-Pfeil `$\rightarrow$`, und beim
 * Transport über den Tool-Aufruf wird aus `\r` ein Steuerzeichen — im Feld stand
 * dann `$\nightarrow$`. Nur dieses Muster wird zum Pfeil; sonst bleibt der Text.
 */
function unLatexArrows(text: string): string {
  return text.replace(/\$\s*\\?[\r\n]?r?ightarrow\s*\$/g, '→');
}

function cleanStyle(s: StyleExtract): StyleExtract {
  const list = (xs: string[]) => xs.map(unLatexArrows);
  return {
    tonality: unLatexArrows(s.tonality),
    sentenceStyle: unLatexArrows(s.sentenceStyle),
    vocabulary: unLatexArrows(s.vocabulary),
    structure: unLatexArrows(s.structure),
    dos: list(s.dos),
    donts: list(s.donts),
    signaturePhrases: s.signaturePhrases,
  };
}

function validateStyle(input: unknown): StructuredValidation<StyleExtract> {
  const parsed = StyleSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error: `Ungültige Stil-Analyse: ${issues}` };
}

const SYSTEM_PROMPT = `Du bist ein Stil-Analyst. Dir werden mehrere echte Beispieltexte derselben Person oder Organisation vorgelegt. Deine Aufgabe: die GEMEINSAMKEITEN des Schreibstils herausarbeiten — nicht die Inhalte zusammenfassen.

Regeln:
- Beschreibe nur, was in den Beispielen tatsächlich erkennbar ist. Erfinde keine Merkmale.
- signaturePhrases: nur Formulierungen, die WÖRTLICH (oder fast wörtlich) in den Beispielen vorkommen.
- Schreibe auf Deutsch, knapp und präzise. Keine Meta-Kommentare.
- Reiner Text: kein LaTeX, keine Formeln. Für eine Abfolge schreibe „→“.`;

/**
 * Rendert die Beispiele und hält dabei das Zeichenbudget ein. Zod deckelt die
 * Summe schon am Contract; der Deckel hier ist die zweite Grenze für Rezepte,
 * die vor der Anhebung des Limits gespeichert wurden oder über einen anderen
 * Aufrufer hereinkommen — ein gesprengtes Kontextfenster ist ein 500er, kein
 * Validierungsfehler.
 */
function buildExamplesText(examples: ReadonlyArray<{ content: string }>): string {
  const blocks: string[] = [];
  let used = 0;
  for (const [i, example] of examples.entries()) {
    const content = example.content.trim();
    if (content.length === 0) continue;
    const remaining = MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS - used;
    if (remaining <= 0) break;
    used += content.length;
    blocks.push(`--- Beispiel ${i + 1} ---\n${content.slice(0, remaining)}`);
  }
  return blocks.join('\n\n');
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
  const examplesText = buildExamplesText(examples);

  const result = await aiObject<StyleExtract>({
    lane: ANALYSIS_LANE,
    system: SYSTEM_PROMPT,
    prompt: `## ${label} — Beispiele\n\n${examplesText}\n\nAnalysiere die Gemeinsamkeiten des Schreibstils.`,
    toolName: 'describe_writing_style',
    toolDescription: 'Gibt die Gemeinsamkeiten des Schreibstils der Beispiele zurück.',
    schema: STYLE_TOOL_SCHEMA,
    validate: validateStyle,
    maxOutputTokens: 8000,
    temperature: 0.25,
    label: 'text_form_analysis',
  });
  if (!result.ok) throw result.cause ?? new Error(result.error);

  const styleBlock = renderStyleBlock(label, cleanStyle(result.data));
  log.info(
    `[analyzeTextForm] "${label}" — ${examples.length} examples / ${examplesText.length} chars → ${styleBlock.length} chars`
  );
  return { styleBlock, model: laneTarget(ANALYSIS_LANE).model ?? ANALYSIS_LANE };
}

/** Human-readable label for a preset text type (for prompts & headings). */
export function textTypeLabel(textType: TextFormType): string {
  return TEXT_FORM_TYPE_LABELS[textType];
}

/**
 * The label a style is analyzed and rendered under. The title wins: it is what
 * the person named the recipe, and since the contract requires it there is
 * always one. `textType` only fills in for a caller that has none.
 *
 * It used to be the other way round, which quietly discarded the more precise
 * name — a Landesverband's "Pressemitteilungen Hessen" carries `textType:
 * 'presse'` and was analyzed and rendered as plain "Pressemitteilungen". The
 * preset case loses nothing: a preset's title IS its canonical label
 * (`TEXT_FORM_TYPE_LABELS`, seeded by `classifyRecipeMention`).
 *
 * Single source for a decision `analyze`, `create` and `add_examples` each
 * re-implemented.
 */
export function textFormLabel(textType: TextFormType | null | undefined, title: string): string {
  const named = title.trim();
  if (named.length > 0) return named;
  return textType ? textTypeLabel(textType) : named;
}
