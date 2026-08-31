import { describe, it, expect, vi } from 'vitest';

import {
  AVAILABLE_MODELS,
  getContextWindow,
  loopSynthChoice,
  getModelConfig,
  resolveLoopPlannerLane,
  loopPlannerModelName,
  prefersUnifiedLoop,
  resolveModelTuple,
} from './providers.js';
import {
  GEMMA_31B_ALTERNATE,
  GEMMA_31B_ON_CORTECS,
  GEMMA_31B_ON_REGOLO,
  GEMMA_31B_PRIMARY,
} from '../../../services/ai/gemmaHosts.js';

import { LOOP_SYNTH_FALLBACK, LOOP_SYNTH_PRIMARY, mayWriteAnswer } from './autoPolicy.js';

/**
 * Die Lanes, die eine Nutzer-Antwort schreiben dürfen.
 *
 * `verdigado-pro` stand hier bis 19.08.2026 und war ein Irrtum, den der Name
 * gedeckt hat: am LiteLLM-Proxy nachgemessen antwortet der Alias mit
 * `model: "gpt-oss:120b-ctx128k"` — also mit genau dem Modell, das
 * AVOID_AS_SYNTH ausschliesst. Die Ausweichkette bei zähem Primär zeigte
 * damit auf ein Verbots-Modell.
 */
const WRITER_MODELS = new Set([
  GEMMA_31B_ON_REGOLO.model,
  GEMMA_31B_ON_CORTECS.model,
  'mistral-medium-2604',
]);

describe('prefersUnifiedLoop (unified vs planner/executor split)', () => {
  it('Mistral (fast native tool-caller) runs the unified single-model loop', () => {
    expect(prefersUnifiedLoop('mistral', 'mistral-medium-2604')).toBe(true);
  });
  it('every other provider runs the split (planner does tools, selection writes)', () => {
    expect(prefersUnifiedLoop('litellm', 'verdigado-think')).toBe(false);
    expect(prefersUnifiedLoop('litellm', 'verdigado-pro')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'gemma4-31b')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'gpt-oss-120b')).toBe(false);
    expect(prefersUnifiedLoop('regolo', 'qwen3.5-122b')).toBe(false);
  });
});

describe('split-mode model policy (getLoopSynthModel / loopPlannerModelName)', () => {
  it('planner is a verified NON-Chinese tool-caller', () => {
    // Die deklarierten Stufen (autoPolicy.ts): GreenPTs Mistral Small zuerst,
    // dann Cortecs, dann das selbstgehostete Regolo, zuletzt Mistral Medium.
    // Die letzte Stufe war bis zum 29.08.2026 `litellm/verdigado-pro`, also
    // gpt-oss — das Modell, das `AVOID_AS_SYNTH` ausschliesst und einen
    // erzwungenen Werkzeugaufruf mit Prosa beantwortet.
    // Werkzeugaufrufe wurden auf den Mistral-Stufen am 13.08.2026 live geprüft;
    // für die Cortecs-Stufe steht diese Prüfung aus (siehe
    // LOOP_PLANNER_HEALTHY_ALT).
    const planner = loopPlannerModelName();
    expect([
      'mistral-small-3.2-24b-instruct-2506',
      GEMMA_31B_ON_CORTECS.model,
      'mistral-small-4-119b',
      'mistral-medium-2604',
    ]).toContain(planner);
    // The invariant behind that list, spelled out so widening the constants
    // cannot quietly slip a banned lane into the slot.
    expect(planner).not.toMatch(/qwen|glm|kimi|minimax|deepseek|think/i);
  });

  it('the planner never runs Mistral Small on the vendor API', () => {
    // Mistral Small is served from GreenPT (Scaleway Paris) or self-hosted on
    // Regolo — never `mistral-small-latest`, which would bill the Mistral API.
    // The lane moved hosts on 13.08.2026; the rule about the vendor API did not.
    expect(loopPlannerModelName()).not.toBe('mistral-small-latest');
  });

  it('resolves to a usable model even when NO provider is configured', () => {
    // The slot must never land on a lane whose getter throws on a missing key.
    // It did between 13. and 14.08.2026: the last-resort branch returned the
    // GreenPT tier, so with nothing configured every agentic turn died with
    // "GREENPT_API_KEY environment variable is required" before its first model
    // call — ten loop scenarios red, and in production a deployment that forgot
    // the key would have lost the whole loop rather than one lane.
    //
    // This assertion holds in both worlds: with a key the primary builds, and
    // in a keyless CI the litellm tier does (default base URL, empty key
    // tolerated). What it forbids is the throw.
    expect(() => resolveLoopPlannerLane()).not.toThrow();
  });

  it('auto selection writes with the best writer, NEVER a think model', () => {
    const choice = loopSynthChoice('verdigado-think', true);
    expect(choice.provider).not.toBeNull();
    expect(WRITER_MODELS.has(choice.model)).toBe(true);
    expect(choice.model).not.toBe('verdigado-think');
  });

  it('a think-lane selection is ALSO rewritten to a fast writer (latency fix)', () => {
    // The user picking the gemma-4 lane resolves to verdigado-think as primary;
    // synthesis must not run on the reasoning model even though it isn't "auto".
    const choice = loopSynthChoice('verdigado-think', false);
    expect(choice.provider).not.toBeNull();
    expect(choice.model).not.toBe('verdigado-think');
    expect(WRITER_MODELS.has(choice.model)).toBe(true);
  });

  it('an explicit fast model selection is honored verbatim (no swap)', () => {
    // gemma4-31b statt verdigado-pro: die Aussage des Tests ist „eine bewusste
    // Wahl wird nicht umgeschrieben", und dafür braucht es eine Lane, die
    // schreiben DARF. verdigado-pro ist seit der Proxy-Messung vom 19.08.2026
    // keine mehr — siehe WRITER_MODELS.
    const choice = loopSynthChoice('gemma4-31b', false);
    expect(choice.provider).toBeNull();
    expect(choice.model).toBe('gemma4-31b');
  });

  it('verdigado-pro schreibt nie die Antwort — der Alias ist gpt-oss', () => {
    // Am Proxy gemessen (19.08.2026): der Alias antwortet mit
    // `model: "gpt-oss:120b-ctx128k"`, und die Probe zeigt den Ausfallgrund
    // gleich mit — `content: ""` bei gefuelltem `reasoning`. Im Abnahmelauf
    // landete Planer-Text als Nutzer-Antwort („We will call gruenerator_search
    // …"). Der Name verraet das Modell nicht, deshalb dieser Test.
    for (const undecided of [true, false]) {
      const choice = loopSynthChoice('verdigado-pro', undecided);
      expect(choice.model).not.toBe('verdigado-pro');
      expect(WRITER_MODELS.has(choice.model)).toBe(true);
    }
    expect(mayWriteAnswer({ model: 'verdigado-pro' })).toBe(false);
  });

  it('der erklaerte Synth-Ausweich ist selbst policy-konform', () => {
    // Er war es nicht: LOOP_SYNTH_FALLBACK zeigte auf litellm/verdigado-pro.
    expect(mayWriteAnswer({ model: LOOP_SYNTH_FALLBACK.model })).toBe(true);
    expect(mayWriteAnswer({ model: LOOP_SYNTH_PRIMARY.model })).toBe(true);
  });

  it('never routes a Chinese model into the synth slot', () => {
    for (const isAuto of [true, false]) {
      expect(loopSynthChoice('qwen3.5-122b', isAuto).model).not.toMatch(/qwen/);
    }
  });
});

describe('AVAILABLE_MODELS', () => {
  it('all entries have contextWindow field', () => {
    for (const [id, config] of Object.entries(AVAILABLE_MODELS)) {
      expect(config.contextWindow, `${id} missing contextWindow`).toBeGreaterThan(0);
    }
  });
});

describe('getContextWindow', () => {
  // Measured, not copied from datasheets. Mistral reports its own limit on
  // overflow (`262144 maximum context length`); the Ollama-backed Verdigado
  // lanes silently truncate instead of erroring, so they stay below the
  // measured fallback rather than at the nominal window.
  //
  // Re-measured 2026-07-31 (needle at prompt start): ~130k sent came back with
  // prompt_tokens 122,956 and the needle intact, ~155k collapsed to 65,539
  // with the needle gone. 120k sits under the highest verified value; the
  // tag's 128k would sit in the unmeasured stretch right before the cliff.
  it('returns correct context window for known models', () => {
    expect(getContextWindow('mistral-large')).toBe(262_144);
    // 131.000: was Cortecs' `GET /v1/models` am 29.08.2026 für
    // `mistral-small-3.2-24b-instruct-2506` meldet. Die 120k davor waren
    // Ollamas gemessene Kürzungsschwelle auf Verdigado — dorthin routet diese
    // Lane nicht mehr (services/ai/litellmRetired.ts).
    expect(getContextWindow('gpt-oss')).toBe(131_000);
    // Gemma 4 trägt die 128k des Cortecs-Endpunkts, nicht die 262k der
    // Gewichte. Die Begründung steht an EINER Stelle und wird hier bewusst
    // nicht wiederholt: `GEMMA_31B_ON_CORTECS` in services/ai/gemmaHosts.ts.
    // Kurz: der Katalog meldet inzwischen 262000, aber er ist für diese Zahl
    // keine Quelle, und eine zu grosse Zahl ist keine Fehlermeldung, sondern
    // eine stille Kürzung. Bewegen darf den Wert nur eine Nadelprobe (#3067).
    // Die 64k-Decke davor war Ollamas Kürzungs-Schutz auf Verdigado; dorthin
    // routet diese Lane nicht mehr.
    expect(getContextWindow('gemma-4')).toBe(128_000);
    // Der Regolo-Ausweich derselben Gewichte trägt weiterhin das volle Fenster
    // — die beiden Seiten dieser Lane sind hier NICHT gleich gross.
    expect(getContextWindow('gemma-regolo')).toBe(262_144);
    expect(getContextWindow('regolo')).toBe(262_144);
  });

  it('returns default for unknown model', () => {
    expect(getContextWindow('nonexistent-model')).toBe(32768);
  });

  it('returns default for null/undefined model', () => {
    expect(getContextWindow(null)).toBe(32768);
    expect(getContextWindow(undefined)).toBe(32768);
  });

  it('uses provider fallback when model is unknown', () => {
    expect(getContextWindow('auto', 'mistral')).toBe(262_144);
    // `litellm` wird nur noch als Name gelesen und bedient Cortecs.
    expect(getContextWindow('auto', 'litellm')).toBe(131_000);
    expect(getContextWindow('auto', 'regolo')).toBe(262_144);
  });

  it('legacy litellm ID resolves to the small answer lane window', () => {
    expect(getContextWindow('litellm', 'mistral')).toBe(131_000);
  });

  // The unknown-model fallback stays conservative on purpose: an unrecognised
  // model may be small, and over-declaring costs silent truncation upstream.
  it('keeps the unknown-model fallback conservative', () => {
    expect(getContextWindow('nonexistent-model')).toBe(32768);
  });
});

describe('getModelConfig', () => {
  it('returns single config for pinned models', () => {
    const config = getModelConfig('mistral-large');
    expect(config).not.toBeNull();
    expect(config!.kind).toBe('single');
    if (config!.kind === 'single') {
      expect(config.provider).toBe('mistral');
      expect(config.contextWindow).toBe(262_144);
    }
  });

  /**
   * Die Lane hiess einmal nach ihrem Modell und tut es nicht mehr: gpt-oss ist
   * hier weg, weil `AVOID_AS_SYNTH` es vom Antwortschreiben ausschliesst und
   * seine Denk-Tokens gegen `max_tokens` zählen (#3064). Der NAME bleibt, er
   * steckt in persistierten Thread-Zuständen (F0).
   */
  it('serves the gpt-oss lane id from the small answer lane', () => {
    const config = getModelConfig('gpt-oss');
    expect(config).not.toBeNull();
    expect(config!.kind).toBe('single');
    expect(config!.provider).toBe('cortecs');
    expect(config!.model).toBe('mistral-small-3.2-24b-instruct-2506');
    expect(config!.contextWindow).toBe(131_000);
  });

  it('aliases legacy IDs to the small answer lane', () => {
    expect(getModelConfig('litellm')).toBe(getModelConfig('gpt-oss'));
    expect(getModelConfig('gpt-oss-regolo')).toBe(getModelConfig('gpt-oss'));
    expect(getModelConfig('gemma-litellm')).toBe(getModelConfig('gemma-4'));
    // `gemma-regolo` ist seit dem 25.08.2026 NICHT mehr dasselbe Objekt wie
    // `gemma-4`: die Antwortlane liegt auf Cortecs, und dieser Alias ist die
    // ausdrücklich Regolo benennende Kennung — zugleich das Ausweichziel der
    // Cortecs-Seite. Zwei Kennungen, die verschiedene Hosts MEINEN, dürfen
    // nicht auf dieselbe Konfiguration zeigen, sonst zeigt der Ausweg auf sich
    // selbst. Was der Alias garantieren muss, ist nur: er löst auf, und er
    // meint Regolo.
    expect(getModelConfig('gemma-regolo')).not.toBeNull();
    expect(getModelConfig('gemma-regolo')).toMatchObject({
      provider: GEMMA_31B_ON_REGOLO.provider,
      model: GEMMA_31B_ON_REGOLO.model,
    });
  });

  it('returns null for unknown model', () => {
    expect(getModelConfig('nonexistent')).toBeNull();
  });
});

describe('resolveModelTuple — size-aware overflow routing', () => {
  // Stufe 2: an overflow lane serves two very differently sized backends. The
  // reported contextWindow must follow the side actually chosen, otherwise the
  // request is pruned to the small lane's budget while running on the big one.
  // Gemma 4 left the overflow scheme on 2026-07-31: Verdigado's Gemma answers
  // in 38s against Regolo's 4s and thinks unstoppably (no flag disables it on
  // that host), so there is no load-balancing decision left to make — see
  // GEMMA_4_REGOLO. Seit 19.08.2026 bedient Verdigado diese Lane auch als
  // Ausweg nicht mehr; diese Fälle halten fest, dass kein Zug dort landet.
  it('resolves Gemma 4 to the zentral gewählten Host, never to Verdigado', async () => {
    const tuple = await resolveModelTuple('gemma-4', 'req-primary');
    expect(tuple).not.toBeNull();
    // Gegen `GEMMA_31B_PRIMARY` und nicht gegen einen abgetippten Namen: WER
    // Gemma bedient, ist seit dem 25.08.2026 eine Zeile in
    // services/ai/gemmaHosts.ts. Ein Test, der den Host hier wiederholt, macht
    // aus einem Einzeiler-Wechsel wieder eine Suche — und das ist genau das,
    // was die Zentralisierung beseitigt hat.
    expect(tuple!.provider).toBe(GEMMA_31B_PRIMARY.provider);
    expect(tuple!.model).toBe(GEMMA_31B_PRIMARY.model);
    // Was NICHT vom Host abhängt und deshalb hart steht: Verdigado bedient
    // diese Lane nie, weder als Primär noch als Ausweg.
    expect(tuple!.provider).not.toBe('litellm');
    expect(tuple!.sibling?.provider).not.toBe('litellm');
    // Das Fenster folgt dem HOST, nicht den Gewichten: Cortecs' Endpunkt
    // führt 128k (Katalog), Regolos 262k. Genau diese Asymmetrie war der
    // Fehler, den der Verdigado-Ausweich schon einmal hatte — der Prompt wurde
    // gegen das grössere Fenster bemessen und lief auf dem kleineren in eine
    // stille Kürzung.
    expect(tuple!.contextWindow).toBe(128_000);
  });

  it('weicht auf dieselben 31B-Gewichte bei einem anderen Anbieter aus', async () => {
    const tuple = await resolveModelTuple('gemma-4', 'req-fallback');
    // Bis 19.08.2026 stand hier litellm/verdigado-think: 20s bis zum ersten
    // Token, Denken nicht abschaltbar, und EIN Inferenz-Slot, den sich der
    // Ausweg mit den GPT-OSS-Lanes teilte — also genau dann belegt, wenn er
    // gebraucht wird. Der Ausweg darf nicht an derselben Engstelle hängen wie
    // die Lane, die ihn braucht; siehe GEMMA_4_REGOLO.
    //
    // Am 21.08.2026 stand hier für einen halben Tag greenpt/gemma4 und ist es
    // nicht mehr: es denkt unabschaltbar (4615 ms bis zum ersten Token) und
    // seine Parameterzahl ist unbelegt. Der Ausweg einer Lane, die dem Nutzer
    // Prosa schreibt, muss dieselben Gewichte fahren wie ihr Primär — sonst
    // sitzt das Qualitätsgefälle genau dort, wo niemand es misst. Das MODELL
    // ist deshalb identisch mit `gemma-4`, nur der ANBIETER ist ein anderer;
    // wäre auch der gleich, wäre es kein Ausweg.
    //
    // Am 25.08.2026 haben Primär und Ausweich die Plätze getauscht — Cortecs
    // schreibt, Regolo weicht aus (Messreihe in services/ai/gemmaHosts.ts).
    // Die Aussage dieses Tests ist davon unberührt und wird deshalb aus den
    // Konstanten gebaut: gleiches MODELL, anderer ANBIETER.
    expect(tuple!.provider).toBe(GEMMA_31B_PRIMARY.provider);
    expect(tuple!.sibling).toEqual({
      provider: GEMMA_31B_ALTERNATE.provider,
      model: GEMMA_31B_ALTERNATE.model,
    });
    expect(tuple!.sibling!.provider).not.toBe(tuple!.provider);
  });

  it('resolves a plain single lane', async () => {
    const tuple = await resolveModelTuple('mistral-medium-3.5', 'req-single');
    expect(tuple!.provider).toBe('mistral');
    expect(tuple!.contextWindow).toBe(262_144);
  });
});

/**
 * Beide `getModel`-Türen müssen das Ausweich-Veto durchreichen.
 *
 * Es gibt ZWEI: die in `services/ai/providers.ts` und diese hier in
 * `routes/chat/agents/providers.ts` — und die zweite ist die, die der ganze
 * Chat-Pfad benutzt (`responseStreamingService`, Synth-Slot,
 * `getLoopSynthFallbackModel`). Beim ersten Anlauf am 19.08.2026 war nur die
 * erste gepatcht; das Veto reiste im Options-Objekt mit und wurde hier still
 * verworfen. Der Fix bewirkte nichts.
 *
 * Warum der bestehende Test das nicht sah: er prüfte das an `getModel`
 * ÜBERGEBENE Options-Objekt gegen eine Attrappe — also den Aufruf, nicht die
 * Wirkung. Dieser Test greift deshalb an `pickHealthyTarget`, der Stelle, an
 * der das Veto ankommen muss.
 */
describe('das Ausweich-Veto überlebt die zweite getModel-Tür', () => {
  it('reicht acceptTarget an pickHealthyTarget durch', async () => {
    const seen: unknown[] = [];
    vi.doMock('../../../services/ai/modelSiblings.js', () => ({
      pickHealthyTarget: (_p: string, _m: string, isAcceptable?: unknown) => {
        seen.push(isAcceptable);
        return null;
      },
    }));
    vi.resetModules();
    const fresh = await import('./providers.js');
    const veto = (t: { model: string }) => t.model !== 'verdigado-pro';

    fresh.getModel('regolo', 'gemma4-31b', { acceptTarget: veto });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(veto);
    vi.doUnmock('../../../services/ai/modelSiblings.js');
    vi.resetModules();
  });
});
