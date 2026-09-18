/**
 * Recipe-draft synthesis for the Agentura's "Rezept beschreiben → Entwurf" flow.
 *
 * Turns a description (or creator conversation) into a validated recipe spec
 * via a single Mistral structured-generation call — model, token budget,
 * temperature and timeout are pinned exactly like `draftAgentSpec` in
 * `../userAgents/agentDraftService.ts` (same conversational-creator shape).
 * Mirrored rather than shared: the closed sets (icons vs. tools/skills) and
 * the post-clamps (mention collision loop) differ enough that a shared helper
 * would need its own indirection layer for a single call site each.
 *
 * MUST NOT import the party-internal skill-prompt loader (`services/skills/`)
 * or otherwise read system recipe bodies — this stays few-shot-free of
 * party-internal content.
 */

import {
  type DraftedRecipeSpec,
  MAX_TEXT_FORM_DESCRIPTION_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
  textFormMentionSchema,
} from '@gruenerator/contracts';
import {
  SUGGESTED_AGENT_ICONS,
  DEFAULT_AGENT_ICON,
  isSuggestedAgentIcon,
} from '@gruenerator/shared/agents';
import { generateObject } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel } from '../ai/providers.js';

import { deriveRecipeMention, normalizeTextFormMention } from './textFormKind.js';

const log = createLogger('TextFormDraftService');

const ICON_CATALOG = SUGGESTED_AGENT_ICONS.join(', ');
/** How many already-taken mentions get listed in the prompt — keeps the call
 * cheap for accounts with a large Rezept library. */
const MAX_LISTED_MENTIONS = 60;
/** Matches `textFormMentionSchema.max(48)` — kept as a constant here so the
 * collision loop can truncate a stem before appending a suffix. */
const MENTION_MAX_LENGTH = 48;
/** Used only if both the model's mention and the title-derived fallback fail
 * validation (e.g. a title with no latin/umlaut characters at all). */
const FALLBACK_MENTION_STEM = 'rezept';

// LLM output schema. `mention`/`iconKey` are free strings here and clamped
// against the closed sets after generation — a strict enum would make the
// call fail on a single near-miss value. Min/max on title/description/
// styleBlock mirror the save body (saveTextFormBodySchema) so a synthesized
// spec can always be persisted.
const DraftSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(80)
    .describe('Kurzer Titel des Rezepts, z.B. "Einladung Ortsverband"'),
  mention: z
    .string()
    .min(2)
    .max(48)
    .describe('Slug in Kleinbuchstaben mit Bindestrichen, ohne @, z.B. "einladung-ortsverband"'),
  description: z.string().min(1).max(500).describe('Ein bis zwei Sätze: wofür das Rezept ist'),
  iconKey: z
    .string()
    .describe('Icon-Schlüssel, ausschließlich aus dem Katalog (z.B. PiSparkle, PiMegaphone)'),
  styleBlock: z
    .string()
    .min(50)
    .describe(
      'Markdown-Schreibvorgabe für eine Textsorte mit den Abschnitten Zweck, Aufbau und Struktur, Tonalität und Ansprache, Länge und Format, Was vermieden wird.'
    ),
});

function buildSystemPrompt(takenMentions: ReadonlySet<string>): string {
  const listed = [...takenMentions].slice(0, MAX_LISTED_MENTIONS);
  const takenList = listed.length > 0 ? listed.join(', ') : '(keine)';

  return `Du bist der Rezept-Generator des Grünerator. Aus der folgenden Beschreibung der Nutzer*in (eine kurze Vorgabe oder ein Gespräch) erstellst du ein Rezept: eine Schreibvorgabe für eine Textsorte — NICHT den Text selbst.

Regeln:
- Schreibe alle nutzersichtbaren Texte auf Deutsch, in Du-Form und mit Genderstern (*innen).
- styleBlock ist der wichtigste Teil: Markdown mit genau diesen Abschnitten (als Überschriften): Zweck, Aufbau und Struktur, Tonalität und Ansprache, Länge und Format, Was vermieden wird. Formuliere Instruktionen an eine*n Schreiber*in — keine konkreten Fakten, Namen, Daten oder Beispielinhalte.
- mention: Kleinbuchstaben mit Bindestrichen, ohne @. Bereits vergebene Mentions (erste ${MAX_LISTED_MENTIONS}): ${takenList}. Wähle eine, die davon nicht abgedeckt ist.
- iconKey: Wähle GENAU EINEN passenden Icon-Schlüssel aus dieser Liste: ${ICON_CATALOG}
- Erfinde keine Werte außerhalb der Kataloge.`;
}

function buildTranscript(messages: ReadonlyArray<{ role: string; content: string }>): string {
  return messages
    .map((m) => `${m.role === 'user' ? 'Nutzer*in' : 'Creator'}: ${m.content}`)
    .join('\n\n');
}

/** A base mention (already normalized/derived), truncated so a suffix still
 * fits within `MENTION_MAX_LENGTH`. */
function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, MENTION_MAX_LENGTH - suffix.length)}${suffix}`;
}

/** Exactly 4 base36 characters, zero-padded. */
function randomBase36Suffix(): string {
  return Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
}

/** Bounded retries over random suffixes before falling back to the
 * pigeonhole scan below — 10 draws from a 36^4 (~1.68M) space makes an
 * all-collisions run astronomically unlikely for any real `taken` set. */
const RANDOM_SUFFIX_ATTEMPTS = 10;

/**
 * Resolves a validated base mention against already-taken mentions: `m`,
 * then `m-2` … `m-20`, then up to `RANDOM_SUFFIX_ATTEMPTS` draws of
 * `m-<4 random base36 chars>`. Every candidate is checked against BOTH
 * `taken` and `textFormMentionSchema` (a truncated stem could in theory
 * produce a shape the regex still rejects) and the stem is truncated so
 * each suffixed candidate stays within the 48-char contract max.
 *
 * If every random draw above collides too (not provably impossible, just
 * vanishingly unlikely), the final fallback keeps counting numeric suffixes
 * past `-20`: `taken` is a finite set of size N, so scanning N+1 further
 * distinct numeric suffixes is guaranteed — by pigeonhole — to hit one that
 * isn't in `taken`, so this loop always terminates before its bound. The
 * `return` after it is therefore unreachable by construction (every
 * numeric-suffixed candidate is schema-valid by regex, so only the
 * `taken`-membership check can ever fail, and the loop already exhausts
 * every option that check could reject); it exists only so the function is
 * total and typed.
 */
function resolveMentionCollision(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base) && textFormMentionSchema.safeParse(base).success) return base;

  for (let i = 2; i <= 20; i++) {
    const attempt = withSuffix(base, `-${i}`);
    if (!taken.has(attempt) && textFormMentionSchema.safeParse(attempt).success) return attempt;
  }

  for (let i = 0; i < RANDOM_SUFFIX_ATTEMPTS; i++) {
    const attempt = withSuffix(base, `-${randomBase36Suffix()}`);
    if (!taken.has(attempt) && textFormMentionSchema.safeParse(attempt).success) return attempt;
  }

  for (let i = 21; i <= 21 + taken.size; i++) {
    const attempt = withSuffix(base, `-${i}`);
    if (!taken.has(attempt) && textFormMentionSchema.safeParse(attempt).success) return attempt;
  }

  return withSuffix(base, `-${21 + taken.size}`);
}

/** The model's mention if valid, else a slug derived from the title, else a
 * static fallback stem — always something `resolveMentionCollision` can work
 * with. */
function resolveBaseMention(draftMention: string, draftTitle: string): string {
  const normalized = normalizeTextFormMention(draftMention);
  if (textFormMentionSchema.safeParse(normalized).success) return normalized;

  const derived = deriveRecipeMention(draftTitle);
  return textFormMentionSchema.safeParse(derived).success ? derived : FALLBACK_MENTION_STEM;
}

/** Synthesize a validated recipe spec from the creator conversation. */
export async function draftRecipeSpec(params: {
  messages: ReadonlyArray<{ role: string; content: string }>;
  takenMentions: ReadonlySet<string>;
}): Promise<DraftedRecipeSpec> {
  const model = getModel('mistral');

  const result = await generateObject({
    model,
    schema: DraftSchema,
    system: buildSystemPrompt(params.takenMentions),
    prompt: `## Gespräch\n\n${buildTranscript(params.messages)}\n\nErstelle daraus die Rezept-Spezifikation.`,
    maxOutputTokens: 1800,
    temperature: 0.4,
    abortSignal: AbortSignal.timeout(40000),
  });

  const draft = result.object;

  // Clamp to the curated set so the synthesized icon always resolves.
  const iconKey = isSuggestedAgentIcon(draft.iconKey.trim())
    ? draft.iconKey.trim()
    : DEFAULT_AGENT_ICON;
  const mention = resolveMentionCollision(
    resolveBaseMention(draft.mention, draft.title),
    params.takenMentions
  );
  const title = draft.title.trim().slice(0, 80);
  const description = draft.description.trim().slice(0, MAX_TEXT_FORM_DESCRIPTION_CHARS);
  const styleBlock = draft.styleBlock.trim().slice(0, MAX_TEXT_FORM_STYLE_CHARS);

  log.info(
    `[draftRecipeSpec] "${title}" mention=${mention} icon=${iconKey} styleBlock=${styleBlock.length}chars`
  );

  return { title, mention, description, iconKey, styleBlock };
}
