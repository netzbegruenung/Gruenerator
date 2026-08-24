import { describe, it, expect } from 'vitest';

import { INTERMEDIATE_LANES } from '../../ai/intermediateLanes.js';
import {
  emissionsFromEnergy,
  estimateFootprint,
  estimateImageFootprint,
  gridIntensityFor,
  hasEnergyCoefficients,
  pueFor,
  referenceFootprint,
} from '../energyFootprint.js';

/**
 * Anchors taken from the live probe of api.greenpt.ai on 2026-07-31
 * (apps/api/scripts/probeGreenptImpact.ts). They guard the coefficient table
 * against silent drift: if someone re-fits the numbers, these assertions say
 * whether the fit still reproduces reality.
 */
describe('emissionsFromEnergy', () => {
  it('inverts a measured GreenPT pair exactly', () => {
    // Verbatim from one response (mistral-medium-3.5-128b, 36 in / 187 out).
    // Feeding back the intensity GreenPT implicitly used must return their own
    // emissions figure — that is the unit conversion (Wms -> kWh -> ug) under test.
    const energyWms = 3_112_097;
    const emissionsUg = 26_311;
    const impliedIntensity = (emissionsUg * 3600) / energyWms;
    expect(impliedIntensity).toBeCloseTo(30.4, 1);
    expect(emissionsFromEnergy(energyWms, impliedIntensity)).toBe(emissionsUg);
  });

  it('scales linearly with grid intensity', () => {
    expect(emissionsFromEnergy(3_600_000, 100)).toBe(100_000);
    expect(emissionsFromEnergy(3_600_000, 350)).toBe(350_000);
  });
});

describe('gridIntensityFor', () => {
  it('separates the French and German upstreams', () => {
    // The recorded provider is the upstream, so Scaleway-routed Mistral Medium
    // must not inherit the German mix.
    expect(gridIntensityFor('scaleway')).toBe(24);
    expect(gridIntensityFor('mistral')).toBe(22);
    expect(gridIntensityFor('litellm')).toBe(363);
  });

  it('falls back to the German mix for an unknown provider', () => {
    // Erring high is the safe direction for a footprint claim.
    expect(gridIntensityFor('some-future-provider')).toBe(350);
  });
});

describe('referenceFootprint — the GPT-4o counterfactual', () => {
  it('reproduces both anchor points it was fitted to', () => {
    // Jegham et al. report 0.42 Wh for the short config (300 output tokens) and
    // 1.215 Wh for the medium one (1000 output). If a later edit breaks the fit,
    // these two say so.
    const short = referenceFootprint({ outputTokens: 300, requests: 1 });
    const medium = referenceFootprint({ outputTokens: 1000, requests: 1 });
    expect(short.energyWms / 3_600_000).toBeCloseTo(0.42, 2);
    expect(medium.energyWms / 3_600_000).toBeCloseTo(1.215, 2);
  });

  it('applies the US-grid factor the same paper used', () => {
    // 0.42 Wh at 0.35 kgCO2e/kWh = 147 mg. Using our own European factor here
    // would silently flatter the comparison.
    const short = referenceFootprint({ outputTokens: 300, requests: 1 });
    expect(short.emissionsUg / 1000).toBeCloseTo(147, 0);
  });

  it('scales with request count, not just tokens', () => {
    // The fixed per-request term is 79 mWh — a hundred tiny requests must not
    // come out as nearly free.
    const many = referenceFootprint({ outputTokens: 100, requests: 100 });
    expect(many.energyWms / 3_600_000).toBeGreaterThan(7.9);
  });
});

describe('estimateFootprint', () => {
  it('lands within 10% of the measured energy for a typical answer', () => {
    // Measured: mistral-medium-3.5-128b at 400 output tokens drew 1.8278 Wh.
    const result = estimateFootprint({
      provider: 'mistral',
      model: 'mistral-medium-2604',
      inputTokens: 38,
      outputTokens: 400,
      requests: 1,
    });
    expect(result).not.toBeNull();
    const wh = (result?.energyWms ?? 0) / 3_600_000;
    expect(wh).toBeGreaterThan(1.83 * 0.9);
    expect(wh).toBeLessThan(1.83 * 1.1);
  });

  it('reproduces the measured six-fold gap between Gemma 4 and Mistral Medium', () => {
    const shape = { provider: 'regolo', inputTokens: 600, outputTokens: 400, requests: 1 };
    const gemma = estimateFootprint({ ...shape, model: 'gemma4-31b' });
    const medium = estimateFootprint({ ...shape, model: 'mistral-medium-2604' });
    const ratio = (medium?.energyWms ?? 0) / (gemma?.energyWms ?? 1);
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(7);
  });

  it('bounds the unmetered lanes from ABOVE and flags them as such', () => {
    // GreenPT serves no equivalent of the 119b Small, the 119b Small or Pixtral
    // Large. A throughput proxy was tried and failed its own control (it put
    // gpt-oss at 0.43x gemma4 where the meter says 1.12x), so instead of a
    // guess these carry the TOP of the measured span for their size class.
    // Never silently zero, never flatteringly low.
    const shape = { provider: 'regolo', inputTokens: 500, outputTokens: 500, requests: 1 };
    const gemma = estimateFootprint({ ...shape, model: 'gemma4-31b' });

    for (const model of ['mistral-small-4-119b', 'pixtral-large-latest']) {
      const bounded = estimateFootprint({ ...shape, model });
      expect(bounded?.basis).toBe('bound');
      // An upper bound must sit above the cheapest measured model of the fleet.
      expect(bounded?.energyWms ?? 0).toBeGreaterThan(gemma?.energyWms ?? 0);
    }

    expect(
      estimateFootprint({ ...shape, provider: 'mistral', model: 'pixtral-large-latest' })?.basis
    ).toBe('bound');
  });

  it('marks metered lanes as measured', () => {
    const shape = { inputTokens: 500, outputTokens: 500, requests: 1 };
    expect(estimateFootprint({ ...shape, provider: 'regolo', model: 'gemma4-31b' })?.basis).toBe(
      'measured'
    );
    expect(
      estimateFootprint({ ...shape, provider: 'scaleway', model: 'mistral-medium-3.5-128b' })?.basis
    ).toBe('measured');
  });

  it('still returns null for a lane nobody registered', () => {
    // A brand-new model id must surface as a coverage gap, not as zero energy.
    expect(
      estimateFootprint({
        provider: 'regolo',
        model: 'some-model-added-next-year',
        inputTokens: 500,
        outputTokens: 500,
        requests: 1,
      })
    ).toBeNull();
  });

  it('credits back a better PUE than GreenPT reference', () => {
    // Same Gemma 4 weights on three hosts. Both of ours beat GreenPT's 1.25:
    // Hetzner 1.12 (its own EMAS-registered declaration, was 1.13 from a weaker
    // source), Seeweb 1.20 (DHH sustainability report 2024, p. 8). The numbers
    // below are read from PUE_BY_PROVIDER — an update there belongs here too.
    const shape = { inputTokens: 600, outputTokens: 400, requests: 1 };
    const greenpt = estimateFootprint({ ...shape, provider: 'greenpt', model: 'gemma4-31b' });
    const regolo = estimateFootprint({ ...shape, provider: 'regolo', model: 'gemma4-31b' });
    const verdigado = estimateFootprint({
      ...shape,
      provider: 'litellm',
      model: 'verdigado-think',
    });
    // Derived from the table, not re-typed: the claim under test is that the
    // energy scales with the host's PUE, and a hard-coded 1.13 kept asserting a
    // constant the code no longer held.
    const ref = pueFor('greenpt');
    expect(pueFor('regolo')).toBeLessThan(ref);
    expect(pueFor('litellm')).toBeLessThan(ref);
    expect((regolo?.energyWms ?? 0) / (greenpt?.energyWms ?? 1)).toBeCloseTo(
      pueFor('regolo') / ref,
      2
    );
    expect((verdigado?.energyWms ?? 0) / (greenpt?.energyWms ?? 1)).toBeCloseTo(
      pueFor('litellm') / ref,
      2
    );
  });

  it('applies the upstream grid, not the lane name', () => {
    // Identical energy, different country: the emissions must differ ~6x.
    const shape = {
      model: 'mistral-medium-2604',
      inputTokens: 600,
      outputTokens: 400,
      requests: 1,
    };
    const fr = estimateFootprint({ ...shape, provider: 'scaleway' });
    const de = estimateFootprint({ ...shape, provider: 'litellm' });
    expect(fr?.energyWms).toBeGreaterThan(0);
    expect((de?.emissionsUg ?? 0) / (fr?.emissionsUg ?? 1)).toBeGreaterThan(5);
  });

  it('covers the Scaleway-routed spelling of Mistral Medium', () => {
    // Regression: SCALEWAY_MISTRAL_MODELS rewrites 'mistral-medium-2604' to
    // 'mistral-medium-3.5-128b' and usage records the ROUTED id. Real usage
    // data showed that row sitting uncovered while the table held only the
    // pre-routing spelling — the best-measured coefficient missing its own lane.
    const shape = { inputTokens: 600, outputTokens: 400, requests: 1 };
    const routed = estimateFootprint({
      ...shape,
      provider: 'scaleway',
      model: 'mistral-medium-3.5-128b',
    });
    const direct = estimateFootprint({
      ...shape,
      provider: 'mistral',
      model: 'mistral-medium-2604',
    });
    expect(routed).not.toBeNull();
    expect(routed?.energyWms).toBe(direct?.energyWms);
  });

  it('makes one image cost far more than a whole conversation', () => {
    // The point of counting images at all. A Flux Pro sharepic is ~25 press
    // releases' worth of CO2; if this ratio ever collapses to something modest,
    // a coefficient has been broken and the tab is quietly misleading people
    // about where their footprint actually sits.
    const image = estimateImageFootprint({ provider: 'bfl', model: 'flux-2-pro', images: 1 });
    const chatTurn = estimateFootprint({
      provider: 'regolo',
      model: 'gemma4-31b',
      inputTokens: 1200,
      outputTokens: 600,
      requests: 1,
    });
    expect((image?.emissionsUg ?? 0) / (chatTurn?.emissionsUg ?? 1)).toBeGreaterThan(20);
  });

  it('charges embeddings on the input side only', () => {
    const result = estimateFootprint({
      provider: 'mistral',
      model: 'mistral-embed',
      inputTokens: 30,
      outputTokens: 0,
      requests: 1,
    });
    // Measured: 8150 Wms for 30 tokens.
    expect(result?.energyWms).toBeGreaterThan(7000);
    expect(result?.energyWms).toBeLessThan(9500);
  });
});

describe('estimateImageFootprint', () => {
  it('reproduces the published measurement it is built on', () => {
    // Qwen-Image is the one image lane whose exact model was metered: Iyengar
    // et al. Table 6, 1024x1024 / 50 steps / fp16 / CFG = 1.29e6 J per 100
    // prompts = 3.583 Wh GPU-only. Doubled for the boundary correction, times
    // Seeweb's 1.20 PUE. If someone edits a coefficient, this says whether the
    // published anchor still shows through.
    const one = estimateImageFootprint({ provider: 'regolo', model: 'Qwen-Image', images: 1 });
    expect((one?.energyWms ?? 0) / 3_600_000).toBeCloseTo(3.583 * 2 * 1.2, 1);
  });

  it('orders the Flux variants the way BFL prices them', () => {
    const of = (model: string) =>
      estimateImageFootprint({ provider: 'bfl', model, images: 1 })?.energyWms ?? 0;
    // klein 0.5x / pro 1x / max 2x — the multipliers from catalog.ts.
    expect(of('flux-2-pro') / of('flux-2-klein-9b')).toBeCloseTo(2, 1);
    expect(of('flux-2-max') / of('flux-2-pro')).toBeCloseTo(2, 1);
  });

  it('scales with the number of images', () => {
    const one = estimateImageFootprint({ provider: 'bfl', model: 'flux-2-pro', images: 1 });
    const ten = estimateImageFootprint({ provider: 'bfl', model: 'flux-2-pro', images: 10 });
    expect((ten?.energyWms ?? 0) / (one?.energyWms ?? 1)).toBeCloseTo(10, 5);
  });

  it('charges an undisclosed operator the unkind grid and the world-average PUE', () => {
    // BFL publishes neither location nor PUE. Regolo publishes both and beats
    // the defaults on each, so the same image must come out cheaper there —
    // otherwise the defaults have stopped being conservative.
    const bfl = estimateImageFootprint({ provider: 'bfl', model: 'flux-2-pro', images: 1 });
    const regolo = estimateImageFootprint({ provider: 'regolo', model: 'flux-2-pro', images: 1 });
    expect(regolo?.energyWms ?? 0).toBeLessThan(bfl?.energyWms ?? 0);
    expect(regolo?.emissionsUg ?? 0).toBeLessThan(bfl?.emissionsUg ?? 0);
  });

  it('flags every image lane as a bound, never as a measurement', () => {
    // Nothing in the image stack reports an impact object, and the boundary
    // uplift is our own choice — so 'measured' would be a lie here.
    for (const model of ['flux-2-klein-9b', 'flux-2-pro', 'flux-2-max', 'Qwen-Image']) {
      expect(estimateImageFootprint({ provider: 'bfl', model, images: 1 })?.basis).toBe('bound');
    }
  });

  it('returns null for an image backend nobody registered', () => {
    expect(
      estimateImageFootprint({ provider: 'bfl', model: 'flux-3-whatever', images: 1 })
    ).toBeNull();
  });
});

describe('the low end of the band', () => {
  it('leaves a metered lane exactly where it was', () => {
    // gemma4-31b has real coefficients. A range around a measurement would be
    // inventing uncertainty that the meter already removed — and it is what
    // makes the band's WIDTH readable as remaining ignorance.
    const args = {
      provider: 'litellm',
      model: 'gemma4-31b',
      inputTokens: 4000,
      outputTokens: 500,
      requests: 3,
    };
    expect(estimateFootprint({ ...args, bound: 'low' })?.energyWms).toBe(
      estimateFootprint(args)?.energyWms
    );
  });

  it('drops an un-metered lane to the floor of the same measured span', () => {
    const args = {
      provider: 'regolo',
      model: 'pixtral-large-latest',
      inputTokens: 4000,
      outputTokens: 500,
      requests: 3,
    };
    const high = estimateFootprint(args);
    const low = estimateFootprint({ ...args, bound: 'low' });
    expect(low?.energyWms ?? 0).toBeLessThan(high?.energyWms ?? 0);
    // The floor is gpt-oss-120b's metered slope, so the low end must not
    // undercut what that model would itself cost on the same traffic.
    const floor = estimateFootprint({ ...args, model: 'gpt-oss-120b' });
    expect(low?.energyWms).toBe(floor?.energyWms);
  });

  it('keeps calling an un-metered lane a bound at BOTH ends', () => {
    // Swapping in the floor to draw a range must not relabel the lane as
    // measured — the share the API reports would then overstate our coverage.
    const args = {
      provider: 'regolo',
      model: 'pixtral-large-latest',
      inputTokens: 100,
      outputTokens: 100,
      requests: 1,
    };
    expect(estimateFootprint({ ...args, bound: 'low' })?.basis).toBe('bound');
    expect(estimateFootprint(args)?.basis).toBe('bound');
  });

  it('strips exactly the boundary uplift from an image, nothing else', () => {
    const args = { provider: 'regolo', model: 'Qwen-Image', images: 4 };
    const high = estimateImageFootprint(args)?.energyWms ?? 0;
    const low = estimateImageFootprint({ ...args, bound: 'low' })?.energyWms ?? 0;
    expect(high).toBe(low * 2);
  });
});

describe('pueFor', () => {
  it('reads the table the figure was actually computed from', () => {
    // Token coefficients arrive from GreenPT carrying 1.25; image figures come
    // off a bare GPU meter and fall back to the world average instead. Reading
    // the wrong one would publish a constant no number was computed with.
    expect(pueFor('bfl', 'tokens')).toBe(1.25);
    expect(pueFor('bfl', 'images')).toBe(1.56);
    expect(pueFor('regolo')).toBe(1.2);
    // Hetzner's own EMAS-registered declaration. Pinned HERE and nowhere else,
    // so moving the constant fails one obvious test instead of an arithmetic
    // assertion three describes away.
    expect(pueFor('litellm')).toBe(1.12);
  });
});

/**
 * Der Befund, der diesen Block ausgelöst hat: die Cortecs-Stufen senden
 * `gemma-4-31b-it`, die Buchhaltung führt genau diese ID als `model`
 * (`wrapped.modelId` in usageModelMiddleware.ts) — und die Koeffiziententabelle
 * kannte nur Regolos `gemma4-31b`. Beide Stufen wären still als „nicht
 * abgedeckt" gelaufen, ohne dass irgendetwas rot geworden wäre: eine fehlende
 * Zeile liefert `null`, und `null` sieht aus wie eine ehrlich unbezifferte Lane.
 *
 * Der Test hängt deshalb an INTERMEDIATE_LANES statt an einer Liste von IDs —
 * wer die Lane auf einen neuen Modellnamen umhängt, kommt hier vorbei.
 */
describe('die Modell-IDs, die die Cortecs-Stufen wirklich senden', () => {
  const cortecsLanes = Object.entries(INTERMEDIATE_LANES).filter(
    ([, cfg]) => cfg.provider === 'cortecs'
  );

  it('deckt jede Cortecs-Stufe ab, statt sie als unbeziffert durchzureichen', () => {
    expect(cortecsLanes.length).toBeGreaterThan(0);
    for (const [id, cfg] of cortecsLanes) {
      expect(hasEnergyCoefficients(cfg.model), `Stufe ${id} (${cfg.model})`).toBe(true);
    }
  });

  it('bewertet dieselben Gewichte unter beiden IDs gleich', () => {
    // `gemma-4-31b-it` (Cortecs) und `gemma4-31b` (Regolo) sind dasselbe dichte
    // 31B — modelSiblings.ts paart sie deshalb. Zwei Zahlen für ein Modell
    // wären ein Sprung in der CO₂-Anzeige, sobald eine Lane den Host wechselt.
    // Der Provider ist hier bewusst derselbe: den Standort-Unterschied trägt
    // `pueFor`, nicht der Koeffizient.
    const usage = { provider: 'regolo', inputTokens: 1000, outputTokens: 500, requests: 1 };
    const cortecs = estimateFootprint({ ...usage, model: 'gemma-4-31b-it' });
    const regolo = estimateFootprint({ ...usage, model: 'gemma4-31b' });
    expect(cortecs).not.toBeNull();
    expect(cortecs?.energyWms).toBe(regolo?.energyWms);
    expect(cortecs?.basis).toBe('measured');
  });

  it('lässt die MoE-Variante weiter bewusst unbeziffert', () => {
    // Andere Architektur (4B aktive Parameter), nie gemessen — die Lücke ist
    // dokumentierte Absicht. Stünde sie hier auf `true`, hätte jemand den
    // 31B-Koeffizienten daraufgelegt, und genau davor warnt die Tabelle.
    expect(hasEnergyCoefficients('gemma-4-26b-a4b-it')).toBe(false);
  });
});
