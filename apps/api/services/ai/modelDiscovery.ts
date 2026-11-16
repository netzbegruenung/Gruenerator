// Mistral Medium 3.5, Gemma 4 and gpt-oss are all reasoning
// models with configurable thinking. `reasoning: true` here flags that; how (or
// whether) that reasoning is surfaced to the UI depends on the streaming path
// (SDK fullStream for Mistral; the raw streamer in openAiReasoningStream.ts for
// hosts that emit `reasoning_content`).
//
// `vision` is a property of the ENDPOINT, not of the weights: catalogs listed
// image input for hosts that answered a real image turn with HTTP 500. The
// 2026-10-07 endpoint check used one PNG
// (two shapes plus a text line, read back correctly): Mistral Medium 3.5 and
// Small on the Mistral API, Gemma 4 31B on Cortecs and Melious, Mistral Small
// 3.2 on Cortecs, Mistral Small 4 on Melious. Later checks, including Mistral
// Large 4 on the Mistral API (2026-10-19), are documented per entry below.
const MODEL_METADATA: Record<string, { name: string; reasoning: boolean; vision: boolean }> = {
  'mistral-medium-2604': { name: 'Mistral Medium 3.5', reasoning: true, vision: true },
  'mistral-medium-3.5': { name: 'Mistral Medium 3.5', reasoning: true, vision: true },
  // Am 06.10.2026 (Preview-Start) kamen 3 von 4 Bild-Anfragen mit 503 zurück.
  // Am 19.10.2026 gemessen: 96 Bild-Anfragen, 0 Fehler, einfache Bildfragen in
  // 3–13 s korrekt gelesen. Unter einem langen Regel-Prompt lief das Denken bei
  // 17 von 86 Anfragen bis ins Token-Limit (leere Antwort) — ein Denk-, kein
  // Bildproblem; der Alt-Text-Dienst bleibt deshalb bei VISION_MODEL.
  'mistral-large-4': { name: 'Mistral Large 4', reasoning: true, vision: true },
  'mistral-large-2512': { name: 'Mistral Large', reasoning: false, vision: false },
  'mistral-large-latest': { name: 'Mistral Large', reasoning: false, vision: false },
  'mistral-small-latest': { name: 'Mistral Small', reasoning: false, vision: true },
  'mistral-small-3.2-24b-instruct-2506': {
    name: 'Mistral Small 3.2',
    reasoning: false,
    vision: true,
  },
  'mistral-small-2503': { name: 'Mistral Small (Vision)', reasoning: false, vision: true },
  // F0: Name aus gespeicherten Modell-Einstellungen (früher ein anderer Host); Bildannahme ist bei keinem lebenden Gemma-Host belegt.
  'gemma4-31b': { name: 'Gemma 4 31B', reasoning: true, vision: false },
  // DASSELBE Modell über Cortecs (infercom) — der Primär aller
  // Gemma-Lanes seit 25.08.2026, siehe services/ai/gemmaHosts.ts. Zwei Flags,
  // die absichtlich vom Zwilling darüber abweichen:
  //
  //   `reasoning: false` — es denkt auf diesem Host OHNE Flag nicht (gemessen
  //   21.08. und 25.08.2026: 0 Zeichen Denken im Baseline). Dieses Feld
  //   beschreibt genau das und nicht mehr; angeschaltet wird über
  //   `chat_template_kwargs.enable_thinking` im Denk-Strom, den
  //   `isReasoningStreamModel` gesondert führt.
  //
  //   `vision: true` — am 25.08.2026 noch HTTP 500 (`unexpected_error`) auf
  //   einen echten Bild-Turn, am 07.10.2026 HTTP 200 mit korrekter Antwort.
  'gemma-4-31b-it': { name: 'Gemma 4 31B', reasoning: false, vision: true },
  // Dasselbe Modell über Melious. Beide Flags aus demselben Grund wie eine
  // Zeile höher: `reasoning: false`, weil der SDK-Pfad das Denken abschaltet
  // (meliousThinkingFetch.ts); `vision: true` GEMESSEN — am 23.09.2026 noch
  // HTTP 400 auf einen Bild-Turn, am 02.10.2026 HTTP 200 mit korrekten Boxen
  // für `:speed`, `:balanced` und ohne Flavor, als data-URL und https-URL
  // (#4008). Nur ein Bild pro Zug geprüft.
  'gemma-4-31b:balanced': { name: 'Gemma 4 31B', reasoning: false, vision: true },
  // Lane „Panda" auf Melious (Ausweich GreenPT). `reasoning: true` ehrlich:
  // es denkt standardmäßig, `reasoning_effort: 'none'` schaltet ab (gemessen
  // 01.10.2026). Bewusst `vision: false`, obwohl Melious am 07.10.2026 eine
  // Bildfrage richtig beantwortete: die Gewichte sind ein Textmodell, das Bild
  // hat also ein anderes, ungenanntes Modell gelesen. Bild-Züge gehen an
  // VISION_MODEL.
  'deepseek-v4.1-flash': { name: 'DeepSeek V4.1 Flash', reasoning: true, vision: false },
  // Gemma 4 als MoE mit 4B aktiven Parametern — früher die `heavy`-Stufe,
  // direkt bei Scaleway (als direkter Anbieter seit 01.10.2026 entfernt).
  // `reasoning: true`, weil es standardmässig denkt; Vision laut Modellkarte.
  'gemma-4-26b-a4b-it': { name: 'Gemma 4 26B-A4B', reasoning: true, vision: true },
  // Verdigado/LiteLLM serves Gemma 4 under the 'verdigado-think' alias
  // (resolves server-side to gemma4:31b-ctx128k). Without this entry,
  // isVisionCapable would return false and the vision-override would hijack
  // every image request on the gemma-4 overflow lane to the vision model,
  // defeating alternation.
  'verdigado-think': { name: 'Gemma 4', reasoning: true, vision: true },
  // The bare 'gemma' alias resolves to gemma4:26b-ctx16k — a smaller model
  // with an eighth of the context. It is EXCLUDE_IDS'd out of discovery so
  // nobody can pick it, but the metadata stays so anyone whose stored model
  // choice still names it keeps sane reasoning/vision flags.
  gemma: { name: 'Gemma 4 (26B, veraltet)', reasoning: true, vision: true },
  'mistral-medium-latest': { name: 'Mistral Medium', reasoning: false, vision: false },
  'gpt-oss-120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  // Verdigado/LiteLLM official alias for GPT-OSS (resolves server-side to
  // gpt-oss:120b-ctx128k); the hidden legacy alias 'gpt-oss:120b' is kept
  // below during rollout.
  'verdigado-pro': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'gpt-oss:120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'openai/gpt-oss-120b': { name: 'GPT-OSS 120B', reasoning: true, vision: false },
  'mistral-small-4-119b': { name: 'Mistral Small 4 119B', reasoning: true, vision: true },
  'mistral-small-4-119b-instruct': {
    name: 'Mistral Small 4 119B',
    reasoning: false,
    vision: true,
  },
  'Llama-3.3-70B-Instruct': { name: 'Llama 3.3 70B', reasoning: false, vision: false },
  'mistral-small3.2': { name: 'Mistral Small 3.2', reasoning: false, vision: false },
};

/**
 * Check if a model ID is known to support vision.
 * Uses MODEL_METADATA (synchronous, no API call needed).
 */
export function isVisionCapable(modelId: string): boolean {
  const meta = MODEL_METADATA[modelId];
  return meta?.vision ?? false;
}

/**
 * Check if a model ID is a reasoning/thinking model.
 * Uses MODEL_METADATA (synchronous, no API call needed). Drives request-level
 * reasoning enablement (e.g. Mistral `reasoningEffort`).
 */
export function isReasoningCapable(modelId: string): boolean {
  const meta = MODEL_METADATA[modelId];
  return meta?.reasoning ?? false;
}
