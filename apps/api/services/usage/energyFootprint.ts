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
  mistral: 56, // France (nuclear-heavy)
  scaleway: 56, // France, Paris region
  litellm: 350, // Germany — verdigado/netzbegruenung on Hetzner
  regolo: 330, // Italy (gas-heavy grid, despite Seeweb's renewable contracts)
  greenpt: 30, // only a fallback; GreenPT rows carry measured emissions
};

/**
 * Power Usage Effectiveness. GreenPT states 1.25 and its `impact` figures
 * already include that overhead, so a coefficient carries it too. Hosts with a
 * better PUE get the difference credited back.
 */
const GREENPT_PUE = 1.25;
const PUE_BY_PROVIDER: Readonly<Record<string, number>> = {
  litellm: 1.13, // Hetzner, per its own sustainability disclosure
};

export interface Footprint {
  /** Watt-milliseconds, the unit GreenPT reports. */
  energyWms: number;
  /** Micrograms CO2e. */
  emissionsUg: number;
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
