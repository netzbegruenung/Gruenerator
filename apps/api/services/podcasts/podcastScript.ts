/**
 * Source text → two-voice podcast script. Speaker `a` hosts and asks, `b`
 * explains; both speak einfache Sprache, because the result is listened to,
 * not read.
 */
import {
  PODCAST_MAX_TURN_CHARS,
  PODCAST_MAX_TURNS,
  podcastScriptDraftSchema,
  type PodcastScriptDraft,
} from '@gruenerator/contracts';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { aiObject } from '../ai/generate.js';
import { type StructuredValidation } from '../ai/structuredParsing.js';

const DRAFT_TOOL_SCHEMA = zodToJsonSchema(podcastScriptDraftSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
}) as Record<string, unknown>;

const TITLE_MAX_CHARS = 120;

const BASE_PROMPT = `Du schreibst das Skript für einen kurzen Erklär-Podcast mit zwei Stimmen. Du bekommst einen Ausgangstext und machst daraus ein lockeres, gut verständliches Gespräch.

## ROLLEN
- Sprecher "a" moderiert: begrüßt kurz, stellt die Fragen, die sich Zuhörende ohne Vorwissen stellen, fasst zwischendurch zusammen und verabschiedet sich am Ende.
- Sprecher "b" erklärt: antwortet anschaulich, mit Beispielen aus dem Alltag.
- Die beiden wechseln sich ab. Ein Beitrag hat ein bis vier Sätze.

## SPRACHE
- Einfache Sprache: kurze Sätze, gängige Wörter, Fachbegriffe sofort erklären.
- Geschrieben zum Hören: keine Aufzählungszeichen, keine Überschriften, kein Markdown, keine Emojis, keine Quellenverweise wie [1], keine URLs. Zahlen so schreiben, wie man sie spricht.
- Keine Namen für die Sprecher*innen und keinen Namen für die Sendung.

## INHALT
- Nur Fakten aus dem Ausgangstext. Nichts erfinden, nichts weglassen, was für das Verständnis wichtig ist.
- Insgesamt etwa 2400 bis 5000 Zeichen, das sind zwei bis fünf Minuten.
- Gib einen kurzen Titel für die Folge zurück, höchstens acht Wörter.`;

const AUSTRIA_BLOCK = `

## LÄNDERKONTEXT: ÖSTERREICH
Die Zuhörenden leben in Österreich. Sprich österreichisches Deutsch (z. B. „Jänner“, „heuer“) und erkläre Einrichtungen aus dem österreichischen Zusammenhang (z. B. Nationalrat, Landtag, Gemeinderat).`;

export type PodcastLocale = 'de-DE' | 'de-AT';

export function buildSystemPrompt(locale: PodcastLocale): string {
  return locale === 'de-AT' ? BASE_PROMPT + AUSTRIA_BLOCK : BASE_PROMPT;
}

export function buildPrompt(sourceText: string, title: string | null): string {
  return `${title ? `Thema: ${title}\n\n` : ''}Ausgangstext:\n"""\n${sourceText}\n"""`;
}

/** Cuts a turn at the last sentence end before `max`, else hard at `max`. */
function clipAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
  return end > max / 2 ? head.slice(0, end + 1) : head;
}

/** Strips what a voice would read out literally: markdown, [n] markers, URLs. */
function speakable(text: string): string {
  return text
    .replace(/\[\d+(?:,\s?\d+)*\]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Brings an over-long or messy draft into shape instead of failing the job. */
export function fitScript(draft: PodcastScriptDraft): PodcastScriptDraft {
  const turns = draft.turns
    .map((turn) => ({ speaker: turn.speaker, text: speakable(turn.text) }))
    .filter((turn) => turn.text.length > 0)
    .map((turn) => ({ ...turn, text: clipAtSentence(turn.text, PODCAST_MAX_TURN_CHARS) }))
    .slice(0, PODCAST_MAX_TURNS);
  return { title: speakable(draft.title).slice(0, TITLE_MAX_CHARS), turns };
}

export function validateDraft(input: unknown): StructuredValidation<PodcastScriptDraft> {
  const parsed = podcastScriptDraftSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Ungültiges Podcast-Skript: ${issues}` };
  }
  const fitted = fitScript(parsed.data);
  const fitCheck = podcastScriptDraftSchema.safeParse(fitted);
  if (!fitCheck.success) return { ok: false, error: 'Das Podcast-Skript ist zu kurz.' };
  return { ok: true, value: fitted };
}

export async function generatePodcastScript(
  sourceText: string,
  title: string | null,
  locale: PodcastLocale
): Promise<PodcastScriptDraft> {
  const generated = await aiObject<PodcastScriptDraft>({
    lane: 'podcast_script',
    system: buildSystemPrompt(locale),
    prompt: buildPrompt(sourceText, title),
    toolName: 'write_podcast_script',
    toolDescription: 'Schreibt das Skript für einen Erklär-Podcast mit zwei Stimmen.',
    schema: DRAFT_TOOL_SCHEMA,
    validate: validateDraft,
    temperature: 0.6,
    label: 'podcast_script',
  });
  if (!generated.ok) throw new Error(generated.error);
  return generated.data;
}
