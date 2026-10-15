import {
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
} from '@gruenerator/contracts';
import { hasSystemRecipe } from '@gruenerator/shared/agents';
import {
  classifyRecipeMention,
  splitExamples,
  splitStrategyLabel,
} from '@gruenerator/shared/grueneratoren';
import { slugifyName } from '@gruenerator/shared/utils';

/** `slugifyName` kappt bei 40 Zeichen — das Feld darf nicht mehr zulassen. */
export const MAX_MENTION_CHARS = 40;

/** Pfadsegmente der Rezept-Routen; als Erwähnung wäre die Detailseite unerreichbar. */
const RESERVED_MENTIONS = ['neu', 'bearbeiten'];

/** Wie `textFormMentionSchema` in den Contracts. */
const MENTION_PATTERN = /^[a-z0-9äöüß-]+$/;

export const NUM = (n: number): string => n.toLocaleString('de-DE');

/**
 * Beim Tippen slugifizieren, ohne den gerade getippten Trenner zu schlucken
 * (sonst wird aus „mein-" sofort „mein"). Wie im Web-Editor.
 */
export function typeMention(raw: string): string {
  const slug = slugifyName(raw, '');
  const endsOnSeparator = /[^a-zA-Z0-9]$/.test(raw);
  return endsOnSeparator && slug.length > 0 && slug.length < MAX_MENTION_CHARS ? `${slug}-` : slug;
}

/** Endstand des Feldes, ohne hängenden Bindestrich. */
export function normalizeMention(value: string): string {
  return slugifyName(value, '');
}

export function isValidMention(mention: string): boolean {
  return mention.length >= 2 && mention.length <= 48 && MENTION_PATTERN.test(mention);
}

export interface MentionNotice {
  text: string;
  /** Rezept, zu dem der Hinweis verlinkt — `null` ohne Link. */
  recipeMention: string | null;
}

/**
 * Was einer frei getippten Erwähnung im Weg steht, bevor etwas zum Server geht:
 * reservierte Namen, Presets, Landesverbands- und Katalog-Rezepte.
 */
export function mentionBlocker(
  mention: string,
  lvIds: readonly string[] | null,
  isCatalogueMention: (mention: string) => boolean
): MentionNotice | null {
  if (RESERVED_MENTIONS.includes(mention)) {
    return { text: 'Dieser Name ist reserviert.', recipeMention: null };
  }
  const classification = classifyRecipeMention(mention, lvIds);
  if (classification.kind === 'custom' && !isCatalogueMention(mention)) return null;
  return {
    text: `@${mention} gehört zu einem mitgelieferten Rezept — dort kannst du deinen eigenen Stil hinterlegen.`,
    recipeMention: mention,
  };
}

/** Die Zeile unter einer festen Erwähnung — gleiche Aussage wie `recipeMetaLine` im Web. */
export function recipeMetaLine(mention: string): string {
  return hasSystemRecipe(mention)
    ? `Ersetzt das mitgelieferte Rezept @${mention}`
    : `Eigenständiges Rezept · im Chat als @${mention}`;
}

export interface ExamplesStatus {
  examples: string[];
  usedChars: number;
  tooManyExamples: boolean;
  tooManyChars: boolean;
  /** Zusammenfassung unter dem Eingabefeld. */
  summary: string;
  /** Warum gespeichert/analysiert werden darf nicht, sonst `null`. */
  blockReason: string | null;
}

export function examplesStatus(rawExamples: string): ExamplesStatus {
  const split = splitExamples(rawExamples);
  const count = split.examples.length;
  const usedChars = rawExamples.trim().length;
  const tooManyExamples = count > MAX_TEXT_FORM_EXAMPLES;
  const tooManyChars = usedChars > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;
  const summary =
    count === 0
      ? `0 Beispiele — noch nichts eingefügt (${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen Platz)`
      : `${count} ${count === 1 ? 'Beispiel' : 'Beispiele'} erkannt (${splitStrategyLabel(split.strategy)}) · ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen`;
  const blockReason = tooManyExamples
    ? `${count} Beispiele erkannt — höchstens ${MAX_TEXT_FORM_EXAMPLES} sind möglich.`
    : tooManyChars
      ? `Zu viel Text: ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen.`
      : null;
  return {
    examples: split.examples,
    usedChars,
    tooManyExamples,
    tooManyChars,
    summary,
    blockReason,
  };
}

export function styleBlockValid(styleBlock: string): boolean {
  const length = styleBlock.trim().length;
  return length > 0 && length <= MAX_TEXT_FORM_STYLE_CHARS;
}
