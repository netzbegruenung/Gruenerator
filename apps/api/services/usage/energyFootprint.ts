/**
 * Energy and CO2e footprint for AI requests.
 *
 * Two sources feed the numbers the "Nutzung" tab shows, and they must not be
 * confused:
 *
 *  1. MEASURED — GreenPT returns an `impact` object (energy in Wms, emissions
 *     in ugCO2e) on every chat and embeddings response. Those values are stored
 *     verbatim in `user_usage_daily`. See `greenptImpact.ts` for the capture.
 *  2. ESTIMATED — every other provider reports nothing. For those we multiply
 *     the token counts we already record by the coefficients below.
 *
 * WHY THE COEFFICIENTS ARE TRUSTWORTHY AT ALL: GreenPT serves several of the
 * exact models we run elsewhere. Measuring `gemma4` there tells us what
 * `gemma4-31b` costs at Regolo, because it is the same model doing the same
 * work. What differs is the hardware, the batching and the grid — hardware and
 * batching we cannot correct for (hence "≈"), the grid we can and do.
 *
 * One lane is stronger than that: GreenPT states "every GreenPT request runs on
 * Scaleway's 100% renewable-powered compute in Paris" (greenpt.com/partners),
 * and Scaleway puts every AI server in DC5 (Impact Report 2025, p. 25). Our
 * `mistral-medium-2604` lane routes to Scaleway too — so for the default chat
 * model the measurement and the production workload share a datacenter, a PUE
 * and a GPU generation. There the transfer is near-exact; for the Regolo and
 * verdigado lanes it stays a transfer.
 *
 * WHY ENERGY AND EMISSIONS ARE SEPARATE: emissions = energy x grid intensity.
 * The measurement series found `emissions/energy` pinned at 30.4 g/kWh across
 * all 35 chat runs but 56 g/kWh on an embeddings call minutes later — that is
 * the datacenter's grid at that hour, not a model property. Taking GreenPT's
 * CO2 number and applying it to a request served in Germany would import the
 * wrong grid. We take their Wh and supply our own intensity.
 *
 * ACCOUNTING METHOD — location-based, matching GreenPT's own choice:
 *   "1-hour datacenter-level CO2 data: in cooperation with Nodera, we use
 *    hourly carbon intensity data specific to each datacenter location, not
 *    regional or annual averages."  (docs.greenpt.ai/sustainability)
 * GreenPT advertises "100% renewable energy" and still does NOT zero out its
 * emissions. Rebating our own green-power contracts (market-based accounting)
 * while calibrating against their location-based numbers would be
 * methodologically incoherent, so we don't. The green electricity is a fact
 * worth stating in prose, not a discount to apply to the figure.
 */

/** Wms per mWh — GreenPT reports energy in watt-milliseconds. */
const WMS_PER_MWH = 3600;

export interface EnergyCoefficients {
  /** Dominant term: output tokens cost 100-760x more than input tokens. */
  mWhPerOutputToken: number;
  mWhPerInputToken: number;
  /** Per-request overhead (prefill, scheduling) — small but real on big models. */
  mWhFixed: number;
}

/**
 * Measured 2026-07-31 against api.greenpt.ai with `apps/api/scripts/probeGreenptImpact.ts`
 * (35 runs: output lengths 8/60/200/400/800/1200 plus a 3900-token prompt to
 * separate the input term). Fitted as `energy = fix + a*out + b*in` by least
 * squares; the stated error is the mean deviation over runs with >= 60 output
 * tokens, i.e. over realistic answer lengths.
 *
 * Keys are OUR model ids as recorded in `user_usage_daily`, values come from the
 * GreenPT model named in the comment. Only genuine equivalents are listed. A
 * model absent from this table is NOT estimated — it is reported as uncovered
 * rather than given an invented number, and the response carries the share of
 * tokens that were covered. Extrapolating by parameter count was considered and
 * rejected: the series shows gpt-oss-120b (MoE) at 0.81 mWh/token against
 * mistral-medium-3.5-128b (dense) at 4.52, so size alone predicts nothing.
 *
 * Deliberately missing, because GreenPT serves no equivalent:
 *   mistral-small-4-119b (Regolo classifier)  — GreenPT has only the 24b line
 *   qwen3.5-122b (Regolo)                     — GreenPT has only the 397b MoE
 *   pixtral-large-latest (Mistral vision)     — GreenPT has only pixtral-12b
 * All three sit on low-output lanes, so the uncovered share of ENERGY is far
 * smaller than the uncovered share of requests.
 */
const MODEL_ENERGY: Readonly<Record<string, EnergyCoefficients>> = {
  // GreenPT `mistral-medium-3.5-128b` — 1.1% mean error
  'mistral-medium-2604': { mWhPerOutputToken: 4.519, mWhPerInputToken: 0.0287, mWhFixed: 13.26 },
  // The SAME lane after Scaleway routing: SCALEWAY_MISTRAL_MODELS rewrites
  // 'mistral-medium-2604' to 'mistral-medium-3.5-128b', and usage records the
  // ROUTED id. Both spellings must be here or the best-measured coefficient in
  // this table silently misses its own traffic — which is exactly what happened
  // until real usage data showed a `mistral-medium-3.5-128b @ scaleway` row.
  'mistral-medium-3.5-128b': {
    mWhPerOutputToken: 4.519,
    mWhPerInputToken: 0.0287,
    mWhFixed: 13.26,
  },
  // GreenPT `gemma4` — 7.2% mean error
  'gemma4-31b': { mWhPerOutputToken: 0.722, mWhPerInputToken: 0.0085, mWhFixed: 0 },
  // Same Gemma 4 weights, served by verdigado under an alias (modelDiscovery.ts)
  'verdigado-think': { mWhPerOutputToken: 0.722, mWhPerInputToken: 0.0085, mWhFixed: 0 },
  // GreenPT `gpt-oss-120b` — 15.3% mean error
  'gpt-oss-120b': { mWhPerOutputToken: 0.811, mWhPerInputToken: 0.0003, mWhFixed: 11.05 },
  'verdigado-pro': { mWhPerOutputToken: 0.811, mWhPerInputToken: 0.0003, mWhFixed: 11.05 },
  // GreenPT `mistral-small-3.2-24b-instruct-2506` — 3.0% mean error
  'mistral-small-latest': { mWhPerOutputToken: 0.7, mWhPerInputToken: 0.0035, mWhFixed: 0.14 },
  // GreenPT `green-embeddings`, single run: 8150 Wms for 30 tokens, no output side
  'mistral-embed': { mWhPerOutputToken: 0, mWhPerInputToken: 0.0755, mWhFixed: 0 },
};

/**
 * Grid carbon intensity by the provider recorded in `user_usage_daily`.
 *
 * The recorded provider is the UPSTREAM, not the lane: `withUsageTracking` is
 * handed `routeMistralModel(...).upstream`, so Scaleway-routed Mistral Medium
 * lands under 'scaleway'. That is exactly the granularity this table needs.
 *
 * Location-based annual averages, sourced 2026-07-31. Annual rather than hourly
 * because we have no hourly feed of our own — GreenPT buys that from Nodera.
 * Erring high is the safer direction for a footprint claim.
 */
const GRID_INTENSITY_G_PER_KWH: Readonly<Record<string, number>> = {
  // All figures are 2024 annual averages, combustion emissions only (no
  // upstream/lifecycle), so the three stay comparable to each other.
  mistral: 22, // France, RTE Bilan électrique 2024 — nuclear-dominated
  // Scaleway's own disclosure beats a country average: Impact Report 2025 gives
  // Scope 2 location-based 3.155 tCO2e over 132.881 MWh = 23,7 g/kWh.
  scaleway: 24,
  litellm: 363, // Germany 2024, Umweltbundesamt (consumption-based, see caveat)
  regolo: 270, // Italy 2024, Ember Yearly Electricity Data
  // Fallback only — GreenPT rows carry measured emissions. Same value as
  // Scaleway because GreenPT runs on Scaleway Paris.
  greenpt: 24,
};

/**
 * CAVEAT on the German figure: UBA publishes a CONSUMPTION-based number (net
 * imports included) while the French and Italian figures above are
 * PRODUCTION-based. Italy imports a lot of French nuclear power, so its
 * consumption-based intensity is lower than 270 — meaning this table is, if
 * anything, unkind to Regolo rather than to anyone else. Left as is because the
 * error points in the conservative direction; revisit if a consistent
 * consumption-based set for all three becomes available.
 */

/**
 * Power Usage Effectiveness. GreenPT states 1.25 and its `impact` figures
 * already include that overhead, so a coefficient carries it too. Hosts with a
 * better PUE get the difference credited back.
 */
const GREENPT_PUE = 1.25;
const PUE_BY_PROVIDER: Readonly<Record<string, number>> = {
  litellm: 1.13, // Hetzner, per its own sustainability disclosure
  // Seeweb (Regolo's operator), DHH Group sustainability report 2024, p. 8:
  // "achieving a PUE (Power Usage Effectiveness) below 1,20".
  regolo: 1.2,
  // Scaleway Impact Report 2025, p. 25: DC5 runs at PUE 1,25 and "all the
  // servers necessary for artificial intelligence are installed in this data
  // center". Identical to the GreenPT reference, so this is a no-op — stated
  // explicitly so nobody replaces it with Scaleway's 1,375 fleet average, which
  // includes the non-AI sites.
  scaleway: 1.25,
};

export interface Footprint {
  /** Watt-milliseconds, the unit GreenPT reports. */
  energyWms: number;
  /** Micrograms CO2e. */
  emissionsUg: number;
}

/**
 * The "what if you had used ChatGPT instead" reference.
 *
 * SOURCE — Jegham et al., "How Hungry is AI? Benchmarking Energy, Water, and
 * Carbon Footprint of LLM Inference" (arXiv:2505.09598). Chosen over the other
 * published GPT-4o estimates because its system boundary is IDENTICAL to ours:
 *   "This study focuses exclusively on operational emissions ... during the
 *    inference phase ... embodied emissions ... (Scope 3) are excluded ... our
 *    analysis focuses exclusively on Scope 2 emissions."
 * No training, no hardware manufacturing, PUE included, location-based grid
 * factor. Comparing it to our numbers is therefore legitimate; comparing it to
 * Mistral's full life-cycle assessment would not be.
 *
 * DERIVATION — the paper reports per-query energy for fixed token
 * configurations, not per token. Two of them pin down the same linear form we
 * fit for our own models:
 *   short  (100 in,  300 out) = 0.42  Wh
 *   medium (1000 in, 1000 out) = 1.215 Wh
 * Solving `E = fix + a * out` (input is neglected — our own series found it
 * 100-760x cheaper, and a two-term fit on these points returns a nonsensical
 * negative input cost) gives a = 1.136 mWh per output token, fix = 79 mWh.
 *
 * CAVEAT worth repeating wherever this is displayed: their figure is inferred
 * from API latency, GPU datasheets and a statistically assumed hardware layout
 * with batch size 8 — OpenAI publishes nothing. Ours comes off a meter. The
 * uncertainty sits almost entirely on their side.
 */
const REFERENCE_MWH_PER_OUTPUT_TOKEN = 1.136;
const REFERENCE_MWH_FIXED = 79;
/** Azure carbon intensity factor used by the same paper (0.35 kgCO2e/kWh). */
const REFERENCE_GRID_G_PER_KWH = 350;

/**
 * What the same work would have cost on GPT-4o. Feed it ONLY the traffic our
 * own footprint covers, so both sides of the comparison describe the same
 * requests.
 */
export function referenceFootprint(params: { outputTokens: number; requests: number }): Footprint {
  const mWh =
    REFERENCE_MWH_PER_OUTPUT_TOKEN * params.outputTokens + REFERENCE_MWH_FIXED * params.requests;
  const energyWms = Math.round(mWh * WMS_PER_MWH);
  return {
    energyWms,
    emissionsUg: emissionsFromEnergy(energyWms, REFERENCE_GRID_G_PER_KWH),
  };
}

/** emissions[ug] = energy[Wms] / 3.6e9 [kWh] * g/kWh * 1e6 */
export function emissionsFromEnergy(energyWms: number, gramsPerKwh: number): number {
  return Math.round((energyWms * gramsPerKwh) / 3600);
}

/** Grid intensity for a recorded provider, or the German mix if unknown. */
export function gridIntensityFor(provider: string): number {
  return GRID_INTENSITY_G_PER_KWH[provider] ?? 350;
}

/** True when this model has measured coefficients behind it. */
export function hasEnergyCoefficients(model: string): boolean {
  return model in MODEL_ENERGY;
}

/**
 * Estimate the footprint of token usage that carries no measurement.
 * Returns null for models with no defensible coefficient — the caller reports
 * those as uncovered rather than counting them as zero.
 */
export function estimateFootprint(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}): Footprint | null {
  const c = MODEL_ENERGY[params.model];
  if (!c) return null;

  const pueRatio = (PUE_BY_PROVIDER[params.provider] ?? GREENPT_PUE) / GREENPT_PUE;
  const mWh =
    (c.mWhPerOutputToken * params.outputTokens +
      c.mWhPerInputToken * params.inputTokens +
      c.mWhFixed * params.requests) *
    pueRatio;

  const energyWms = Math.round(mWh * WMS_PER_MWH);
  return {
    energyWms,
    emissionsUg: emissionsFromEnergy(energyWms, gridIntensityFor(params.provider)),
  };
}
