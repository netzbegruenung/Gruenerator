/**
 * Wie lange ein Anbieter einen Prompt einliest, bevor er das erste Byte
 * streamt — gemessen, nicht geschätzt.
 *
 * Unsere Stream-Fristen messen SCHWEIGEN (`createIdleDeadline`): ein Lauf, der
 * eine Weile nichts liefert, gilt als hängend und geht an die Ausweich-Lane.
 * Mistral und Melious schweigen aber während des Einlesens vollständig — kein
 * Denk-Delta, kein Leer-Chunk. Ohne Zuschlag riss die 20-s-Frist deshalb bei
 * Ultra schon ab ~100k Eingabe-Tokens, und ein Zug, den Mistral sauber
 * beantwortet hätte, landete bei Gemma mit 128k: das grosse Fenster der Lane
 * stand nur auf dem Papier.
 *
 * Gemessen am 22.10.2026 mit Prod-Schlüsseln, gestreamt, Nadel bei 60 % der
 * Tiefe in echter Doku-Prosa, jedes Mal gefunden (Sekunden bis zum ersten
 * Denk- oder Text-Delta):
 *
 *   mistral-large-4        97.493 tok → 17,3 s / 22,2 s
 *                         191.011 tok → 45,7 s   (≈ 4.200 tok/s, der langsamste Punkt)
 *                         241.041 tok → 35,3 s   (56k davon gecacht)
 *                         861.094 tok → 111,2 s
 *   deepseek-v4.1-flash   114.507 tok → 6,1 s
 *   (Melious)             884.661 tok → 52,9 s
 *
 * Die Raten liegen unter dem langsamsten Messpunkt, und die Schätzung zählt mit
 * `CHARS_PER_TOKEN` (3,5) mehr Tokens als Mistrals Tokenizer an deutscher Prosa
 * (≈ 4,1) — beides macht den Zuschlag grosszügig. Er fängt das Einlesen, nicht
 * den Stillstand: die Grundfrist bleibt obendrauf.
 *
 * Die ersten `FREE_PROMPT_TOKENS` deckt die Grundfrist selbst (bei 4.000 tok/s
 * fünf Sekunden von zwanzig): ein gewöhnlicher Zug bekommt keinen Zuschlag, und
 * seine Fristen sind auf die Millisekunde die alten.
 *
 * Ohne Messung kein Zuschlag. Andere Anbieter bleiben bei 0, ihre Fristen
 * verhalten sich wie vorher.
 */
import { type LanguageModel, type ModelMessage } from 'ai';

/** Ohne Import aus messageHelpers.ts, damit Tests, die das Modul mocken, diesen
 *  Zuschlag nicht mit abschalten — dieselbe Zahl wie dort `CHARS_PER_TOKEN`. */
const CHARS_PER_TOKEN = 3.5;

const FREE_PROMPT_TOKENS = 20_000;

const PREFILL_TOKENS_PER_SECOND: Readonly<Record<string, number>> = {
  mistral: 4_000,
  melious: 10_000,
};

/** `mistral.chat` (AI-SDK-Provider) und `mistral` (Lane-Tabelle) sind derselbe Anbieter. */
function providerKey(provider: string): string {
  return provider.split('.')[0] ?? provider;
}

/** Zuschlag in ms für einen Prompt dieser Länge auf diesem Anbieter. */
export function prefillAllowanceMs(provider: string, promptChars: number): number {
  const rate = PREFILL_TOKENS_PER_SECOND[providerKey(provider)];
  const tokens = promptChars / CHARS_PER_TOKEN - FREE_PROMPT_TOKENS;
  if (!rate || tokens <= 0) return 0;
  return Math.ceil((tokens / rate) * 1000);
}

/** Zeichen, die der Anbieter einlesen muss: System-Prompt plus Verlauf. */
export function promptChars(
  system: string | null | undefined,
  messages: ReadonlyArray<{ content: ModelMessage['content'] | unknown[] }>
): number {
  let total = system?.length ?? 0;
  for (const m of messages) {
    if (typeof m.content === 'string') {
      total += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const part of m.content as unknown[]) {
        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          total += part.text.length;
        }
      }
    }
  }
  return total;
}

/** Derselbe Zuschlag für ein Modell-Objekt der agentischen Schleife. */
export function prefillAllowanceForModel(
  model: LanguageModel,
  system: string | null | undefined,
  messages: readonly ModelMessage[]
): number {
  // `provider` fehlt bei Modell-Attrappen — wie in `modelLabel` (loopEngine.ts).
  const provider =
    typeof model === 'string'
      ? (model.split('/')[0] ?? '')
      : ((model.provider as string | undefined) ?? '');
  return prefillAllowanceMs(provider, promptChars(system, messages));
}
