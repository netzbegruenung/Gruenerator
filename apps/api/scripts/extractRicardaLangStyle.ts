/**
 * Phase 3 Step B: read the exported Ricarda Lang tweet corpus and call an LLM
 * with a meta-prompt to produce a structured German-language style guide
 * suitable for embedding into the system agent's `systemRole`.
 *
 * Usage: pnpm --filter @gruenerator/api exec tsx scripts/extractRicardaLangStyle.ts
 *
 * Input:  apps/api/data/ricarda-lang-tweets.jsonl (from exportRicardaLangTweets.ts)
 * Output: apps/api/data/ricarda-lang-style.md  (the style block to paste into systemRole)
 *
 * Model: Mistral Large (the codebase workhorse). The plan suggested Claude;
 * we use Mistral here because the codebase has no direct Anthropic client —
 * `anthropic` is only referenced as a regex pattern in provider routing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

import * as dotenv from 'dotenv';

dotenv.config();

const { generateText } = await import('ai');
const { getModel } = await import('../services/ai/providers.js');

interface TweetRecord {
  tweet_id: string;
  content: string;
  published_at: string | null;
  lang: string | null;
  url: string;
}

const INPUT = 'data/ricarda-lang-tweets.jsonl';
const OUTPUT = 'data/ricarda-lang-style.md';

const META_PROMPT = `Du bist eine erfahrene Sprachanalystin und Stilforscherin. Deine Aufgabe ist es, den **Tweet-Stil von Ricarda Lang** anhand eines echten Tweet-Korpus zu rekonstruieren — so präzise, dass eine andere Person mit deiner Anleitung Tweets im selben Stil schreiben könnte.

Du bekommst unten **alle** Originaltweets von @Ricarda_Lang aus den letzten zwölf Monaten (deutschsprachig, keine Retweets, keine Replies). Analysiere sie gründlich und produziere ein strukturiertes deutschsprachiges Stil-Handbuch im Markdown-Format.

Das Stil-Handbuch MUSS folgende Abschnitte enthalten (in dieser Reihenfolge, mit den genauen Überschriften):

## Stimme & Tonalität
Beschreibe Register (Du-Form? Sie-Form? gemischt?), Genderstern-Konsistenz, emotionale Färbung (sachlich, kämpferisch, ironisch, warmherzig?), und 3–5 charakteristische Wendungen oder Lieblingswörter mit Zitatbeleg.

## Aufbau eines typischen Tweets
Erkläre den typischen Aufbau (z. B. Hook → Position → Forderung; oder rhetorische Frage → Pointe). Beschreibe 2–3 wiederkehrende Strukturen mit kurzen Beispielen.

## Länge & Format
Durchschnittliche Tweet-Länge in Zeichen, Spannweite, ob Threads vorkommen, ob Zeilenumbrüche genutzt werden.

## Hashtag-, Mention- und Link-Muster
Wie oft Hashtags? An welcher Position (Anfang, Ende, mitten im Satz)? Wiederkehrende Hashtags? Wie wird @-mentioned? Wie häufig sind Links/Bilder?

## Emoji-Nutzung
Häufigkeit (selten, gelegentlich, oft), typische Emojis, Position im Tweet.

## Wiederkehrende Themen
Top 5–8 inhaltliche Schwerpunkte mit je 1 Zitat aus dem Korpus als Beleg.

## Rhetorische Mittel
Anapher, rhetorische Frage, Du-Ansprache, "Es geht um …"-Frames, Zuspitzung, Pointen — welche werden wie häufig eingesetzt?

## Was Ricarda NICHT tut
Klare Negativliste: Was kommt im Korpus nicht vor? (z. B. Phrasen wie "Liebe Mitbürgerinnen und Mitbürger", übertriebene Floskeln, ChatGPT-Stil-Listen mit Bulletpoints, etc.)

## 5 archetypische Beispiel-Tweets
Wähle 5 Tweets aus dem Korpus, die zusammen ihre Bandbreite einfangen. Zitiere sie **wortwörtlich** und ergänze pro Tweet eine kurze Erklärung, welches Stil-Element er repräsentiert.

WICHTIG:
- Schreibe das Handbuch komplett auf Deutsch.
- Sei konkret und beleg-basiert: jede Behauptung über den Stil muss mit einem Zitat aus dem Korpus untermauert sein.
- Keine Plattitüden ("authentisch", "nahbar") ohne konkreten Beleg.
- Keine Meta-Kommentare über deine Analyse-Methode — nur das fertige Handbuch.
- Format: reines Markdown, beginnend mit "# Ricarda Lang — Tweet-Stil-Handbuch".

Hier ist der Tweet-Korpus:

`;

async function main(): Promise<void> {
  const raw = readFileSync(INPUT, 'utf8');
  const tweets: TweetRecord[] = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TweetRecord)
    .filter((t) => t.lang === 'de' || t.lang === null);

  console.log(`[extract] loaded ${tweets.length} German tweets from ${INPUT}`);

  const corpus = tweets
    .map((t, i) => {
      const date = t.published_at ? t.published_at.slice(0, 10) : 'unbekannt';
      return `[${i + 1}] (${date}) ${t.content.replace(/\s+/g, ' ').trim()}`;
    })
    .join('\n');

  const fullPrompt = META_PROMPT + corpus;
  console.log(`[extract] prompt length: ${fullPrompt.length} chars`);

  const model = getModel('mistral', 'mistral-large-latest');
  const start = Date.now();
  const result = await generateText({
    model,
    prompt: fullPrompt,
    temperature: 0.3,
    maxOutputTokens: 6000,
  });
  const duration = Date.now() - start;

  console.log(
    `[extract] done in ${(duration / 1000).toFixed(1)}s — output ${result.text.length} chars, usage: ${JSON.stringify(result.usage)}`
  );

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, result.text, 'utf8');
  console.log(`[extract] wrote style guide to ${OUTPUT}`);
}

main().catch((err) => {
  console.error('[extract] failed', err);
  process.exit(1);
});
