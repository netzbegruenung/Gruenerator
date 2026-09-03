/**
 * Energy and CO2e footprint for AI requests.
 *
 * Two sources feed the numbers the "Nutzung" tab shows, and they must not be
 * confused:
 *
 *  1. MEASURED — GreenPT returns an `impact` object (energy in Wms, emissions
 *     in ugCO2e) on every chat, embeddings and rerank response. Those values are
 *     stored verbatim in `user_usage_daily`. See `greenptImpact.ts` for the
 *     capture, and `search/GreenPTRerankService.ts` for the rerank one — the
 *     rerank rows carry energy with zero tokens and zero requests, which is why
 *     the measured branch below must not gate on either.
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
 * ACCOUNTING METHOD — BOTH, reported as a pair. The headline stays
 * location-based, matching GreenPT's own choice:
 *   "1-hour datacenter-level CO2 data: in cooperation with Nodera, we use
 *    hourly carbon intensity data specific to each datacenter location, not
 *    regional or annual averages."  (docs.greenpt.ai/sustainability)
 * GreenPT advertises "100% renewable energy" and still does NOT zero out its
 * emissions, and neither do we.
 *
 * Since 14.08.2026 the market-based figure is computed too and shown as the
 * OTHER END OF A RANGE, never alone — see MARKET_INTENSITY_G_PER_KWH. The GHG
 * Protocol asks for dual reporting, and hiding the green-power contracts
 * entirely was its own kind of incomplete: our operators really do buy
 * certified renewables, and Hetzner's is EMAS-verified.
 *
 * Read the range with its one asymmetry in mind: we zero OUR side where an
 * instrument exists but leave the GPT-4o reference on Jegham's location factor,
 * because we hold no instrument of Microsoft's to cancel. Microsoft buys
 * renewables too, so the optimistic end of the range is partly an artefact of
 * applying one method to one side. Every surface that renders it has to say so.
 */

/**
 * Geometric mean — the middle of a bracket whose ends differ by a large factor.
 * Used for every central estimate in this file, because each of them sits
 * between two anchors on a log scale rather than a linear one.
 */
function geoMean(a: number, b: number): number {
  return Math.sqrt(a * b);
}

/** Wms per mWh — GreenPT reports energy in watt-milliseconds. */
const WMS_PER_MWH = 3600;

export interface EnergyCoefficients {
  /** Dominant term: output tokens cost 100-760x more than input tokens. */
  mWhPerOutputToken: number;
  mWhPerInputToken: number;
  /** Per-request overhead (prefill, scheduling) — small but real on big models. */
  mWhFixed: number;
  /**
   * How the numbers were arrived at, and therefore how much to trust them.
   *
   *  'measured' — this exact model was metered on GreenPT.
   *  'bound'    — GreenPT serves no equivalent, so the lane is valued from the
   *               bracket between the two metered models that define its size
   *               class, at the centre by default. The published scale carries
   *               both ends, and it collapses as soon as someone measures the
   *               lane for real.
   */
  basis: 'measured' | 'bound';
}

/**
 * Measured 2026-07-31 against api.greenpt.ai with `apps/api/scripts/probeGreenptImpact.ts`
 * (35 runs: output lengths 8/60/200/400/800/1200 plus a 3900-token prompt to
 * separate the input term). Fitted as `energy = fix + a*out + b*in` by least
 * squares; the stated error is the mean deviation over runs with >= 60 output
 * tokens, i.e. over realistic answer lengths.
 *
 * Keys are OUR model ids as recorded in `user_usage_daily`, values come from the
 * GreenPT model named in the comment.
 *
 * Every model we actually run is listed, so nothing goes uncounted — but the
 * `basis` field says which entries are metered and which are valued from a
 * bracket of two that are, and
 * the API reports both shares. A model still absent from this table (a new lane
 * nobody added here) is reported as uncovered rather than silently valued at
 * zero.
 */
const MODEL_ENERGY: Readonly<Record<string, EnergyCoefficients>> = {
  // GreenPT `mistral-medium-3.5-128b` — 1.1% mean error
  'mistral-medium-2604': {
    mWhPerOutputToken: 4.519,
    mWhPerInputToken: 0.0287,
    mWhFixed: 13.26,
    basis: 'measured',
  },
  // The SAME lane after Scaleway routing: SCALEWAY_MISTRAL_MODELS rewrites
  // 'mistral-medium-2604' to 'mistral-medium-3.5-128b', and usage records the
  // ROUTED id. Both spellings must be here or the best-measured coefficient in
  // this table silently misses its own traffic — which is exactly what happened
  // until real usage data showed a `mistral-medium-3.5-128b @ scaleway` row.
  'mistral-medium-3.5-128b': {
    mWhPerOutputToken: 4.519,
    mWhPerInputToken: 0.0287,
    mWhFixed: 13.26,
    basis: 'measured',
  },
  // GreenPT `gemma4` — 7.2% mean error
  'gemma4-31b': {
    mWhPerOutputToken: 0.722,
    mWhPerInputToken: 0.0085,
    mWhFixed: 0,
    basis: 'measured',
  },
  // Cortecs' `gemma-4-31b-it` — DIESELBEN Gewichte wie `gemma4-31b` eine Zeile
  // höher, nur unter der Kennung des Routers. Seit dem Cortecs-Umzug ist das
  // die ID, die `heavy` und `pruefung` tatsächlich senden und die die
  // Buchhaltung als `model` führt (usageModelMiddleware.ts nimmt
  // `wrapped.modelId`); ohne diesen Eintrag fielen beide Stufen still auf
  // „nicht abgedeckt". Denselben Koeffizienten unter zwei IDs zu führen ist
  // hier schon die Regel — `verdigado-think` unten tut es aus demselben Grund.
  //
  // Der Host ist ein anderer als der der Messung, und das ist bewusst
  // hingenommen: was der Koeffizient trägt, sind die Gewichte, und den
  // Rechenzentrums-Unterschied rechnet `pueFor(provider)` getrennt heraus —
  // die Middleware bucht dafür den aufgelösten Upstream (`infercom`/`berget`),
  // nicht den Router-Namen. Der GPU-Unterschied bleibt unkorrigiert, genau wie
  // bei `verdigado-think`.
  'gemma-4-31b-it': {
    mWhPerOutputToken: 0.722,
    mWhPerInputToken: 0.0085,
    mWhFixed: 0,
    basis: 'measured',
  },
  // `gemma-4-26b-a4b-it` (Scaleway, die `heavy`-Stufe seit 01.08.2026) fehlt
  // hier BEWUSST und bleibt „nicht abgedeckt". Es ist eine andere Architektur
  // als das 31B — MoE mit 4B aktiven Parametern —, der Koeffizient des 31B gilt
  // also nicht, und Scaleway meldet anders als GreenPT keinen Verbrauch zurück.
  // Aus der Geschwindigkeit ableiten wäre der Fehler, der unten schon einmal um
  // 62 % danebenlag. Zu beziffern erst, wenn GreenPT dieselben Gewichte serviert
  // oder Scaleway Verbrauchsdaten liefert.
  //
  // Same Gemma 4 weights, served by verdigado under an alias (modelDiscovery.ts)
  'verdigado-think': {
    mWhPerOutputToken: 0.722,
    mWhPerInputToken: 0.0085,
    mWhFixed: 0,
    basis: 'measured',
  },
  // GreenPT `gpt-oss-120b` — 15.3% mean error
  'gpt-oss-120b': {
    mWhPerOutputToken: 0.811,
    mWhPerInputToken: 0.0003,
    mWhFixed: 11.05,
    basis: 'measured',
  },
  'verdigado-pro': {
    mWhPerOutputToken: 0.811,
    mWhPerInputToken: 0.0003,
    mWhFixed: 11.05,
    basis: 'measured',
  },
  // GreenPT `mistral-small-3.2-24b-instruct-2506` — 3.0% mean error
  'mistral-small-latest': {
    mWhPerOutputToken: 0.7,
    mWhPerInputToken: 0.0035,
    mWhFixed: 0.14,
    basis: 'measured',
  },
  // The SAME model under GreenPT's own id, because the loop PLANNER runs there
  // since 13.08.2026 (LOOP_PLANNER_PRIMARY) and usage records the id we asked
  // for. GreenPT returns `impact` per request, so this entry is only the
  // fallback for a turn whose impact capture came back empty — without it such
  // a row would count as uncovered rather than estimated.
  //
  // Numbers are a fresh 5-run sweep of 13.08.2026 (8/60/400/1200 output plus a
  // 3911-token prompt), 2.8% mean error. They differ from `mistral-small-latest`
  // above, which still carries the 31.07.2026 fit of the same model: same
  // measurement, different split between slope and fixed term. Reconcile the
  // two the next time the table is re-measured — do not assume one is drift.
  'mistral-small-3.2-24b-instruct-2506': {
    mWhPerOutputToken: 0.5987,
    mWhPerInputToken: 0.0034,
    mWhFixed: 8.82,
    basis: 'measured',
  },
  // GreenPT `green-embeddings`, single run: 8150 Wms for 30 tokens, no output side
  'mistral-embed': {
    mWhPerOutputToken: 0,
    mWhPerInputToken: 0.0755,
    mWhFixed: 0,
    basis: 'measured',
  },

  // --- Bracketed lanes: GreenPT serves no equivalent of these. ---
  //
  // A throughput proxy was tried and REJECTED. On identical Regolo hardware the
  // decode slope said gpt-oss-120b costs 0.43x gemma4-31b, while the metered
  // energy ratio is 1.12x — 62% wrong, and wrong in the flattering direction.
  // Speed tracks how many GPUs a model is spread across, not what it draws.
  // Since the control failed, the derived numbers were thrown away.
  //
  // What is left is the measured span for this size class: 0.81 mWh/token
  // (gpt-oss-120b, MoE) to 4.52 (mistral-medium-3.5-128b, dense). The
  // coefficients below are the TOP of that span and are read only at
  // `bound: 'high'` — see BOUND_CEILING, which is these same three numbers.
  // What gets displayed is the centre of the bracket, with both ends beside it.
  //
  // Until 29.08.2026 the top WAS the displayed value, on the reasoning that an
  // upper bound beats a guess. It is not a guess either way: the bracket is two
  // of our own measurements. Quoting only its ceiling made the figure reliably
  // wrong in one direction and hid how wide the bracket is.
  //
  // `basis: 'bound'` propagates to the API and the UI, and the scale narrows
  // the day someone meters the lane.
  'mistral-small-4-119b': {
    mWhPerOutputToken: 4.519,
    mWhPerInputToken: 0.0287,
    mWhFixed: 13.26,
    basis: 'bound',
  },
  'pixtral-large-latest': {
    mWhPerOutputToken: 4.519,
    mWhPerInputToken: 0.0287,
    mWhFixed: 13.26,
    basis: 'bound',
  },
};

/**
 * Grid carbon intensity by the provider recorded in `user_usage_daily`.
 *
 * The recorded provider is the UPSTREAM, not the lane: `withUsageTracking` is
 * handed `routeMistralModel(...).upstream`, so Scaleway-routed Mistral Medium
 * lands under 'scaleway'. That is exactly the granularity this table needs.
 *
 * Location-based annual averages. Annual rather than hourly because we have no
 * hourly feed of our own — GreenPT buys that from Nodera.
 *
 * These are CENTRAL values. Where the country itself is uncertain the entry is
 * the middle of the possible grids and the ends live in GRID_SPAN_G_PER_KWH;
 * where the country is known there is one number and no span. Neither case
 * carries a safety margin any more: a margin folded into the point estimate is
 * invisible, and an invisible margin is indistinguishable from an error.
 */
/** EU average, Ember 2025. The fallback for a provider we did not record. */
const EU_AVERAGE_G_PER_KWH = 213;

/**
 * `kugelaudio` is absent from every table in this file ON PURPOSE.
 *
 * It serves the speech synthesis and reports no consumption, and no published
 * text-to-speech measurement shares the system boundary the figures here are
 * calibrated against (operational, inference only, PUE included, idle not
 * subtracted). Without a coefficient no speech row carries energy, so
 * `byProvider` never lists the provider and no grid or PUE value for it is ever
 * printed. An entry here would be a constant that nothing was computed with —
 * what the PUE_ESTIMATE_BY_PROVIDER note calls worse than an honest gap.
 *
 * What is recorded instead is the DURATION (`unit: 'speech_seconds'`), the
 * quantity the energy would scale with, published under `unvalued_ops`.
 *
 * Valuing it later needs two things, and only one of them is hard:
 *
 *  - A GRID_SPAN_G_PER_KWH row rather than a point. The provider's own
 *    sub-processor register (Trust Center, 10.08.2026) names Verda AI (FI) and
 *    Nebius (FI/FR) for inference and Hetzner (DE) for GPU servers, so the
 *    compute sits mostly in Finland, France and Germany. Poland enters only
 *    through Scaleway, which is listed as generic GPU/server infrastructure —
 *    less likely, not excluded. Roughly 20 g/kWh (FR) to 600 (PL), and the
 *    provider does not disclose which host served a given request.
 *  - A coefficient in mWh per second of generated audio. This is the one that
 *    does not exist anywhere, and no grid figure is worth anything without it,
 *    since g/kWh multiplies an energy quantity we do not have. Asking the
 *    provider for average GPU draw plus a real-time factor would be enough.
 */

const GRID_INTENSITY_G_PER_KWH: Readonly<Record<string, number>> = {
  // All figures are 2024 annual averages, combustion emissions only (no
  // upstream/lifecycle), so the three stay comparable to each other.
  // Mistral: 30 als MITTE einer Spanne, nicht mehr 22 als Punkt.
  //
  // 22 war Frankreich 2024 und setzte einen Standort voraus, den Mistral selbst
  // nicht zusagt: der DPA nennt Frankreich als Gerichtsstand und erlaubt
  // Verarbeitung im gesamten EWR, die oeffentliche Zusage lautet „European
  // Union". Das angekuendigte Rechenzentrumsprogramm umfasst Frankreich UND
  // Schweden. Die plausible Menge ist also genau diese zwei Laender, und die
  // Spanne steht jetzt in GRID_SPAN_G_PER_KWH: 19,6 (Frankreich, RTE 2025) bis
  // 45 (Schweden, Ember). Die Mitte ist ihr geometrisches Mittel, 29,7.
  //
  // Das ist die Zeile, an der die ganze Ueberpruefung angefangen hat („22 ist
  // doch super wenig"). Sie war nicht falsch gerechnet — sie war ein Punkt, wo
  // eine Spanne hingehoert.
  mistral: 30,
  // Scaleway's own disclosure beats a country average: Impact Report 2025 gives
  // Scope 2 location-based 3.155 tCO2e over 132.881 MWh = 23,7 g/kWh.
  scaleway: 24,
  // Deutschland 2025, Umweltbundesamt: 344 g/kWh (verbrauchsbasiert, siehe
  // Vorbehalt weiter unten). Vorher 363 — das war der 2024er Erstwert, den das
  // UBA inzwischen selbst auf 353 revidiert hat.
  litellm: 344,
  regolo: 270, // Italy 2024, Ember Yearly Electricity Data
  // Fallback only — GreenPT rows carry measured emissions. Same value as
  // Scaleway because GreenPT runs on Scaleway Paris.
  greenpt: 24,
  // FALLBACK, nicht der Normalfall. Cortecs ist ein Router ohne eigenen
  // Standort, und `usageModelMiddleware` bucht deshalb den Unterauftragnehmer
  // aus dem Antwort-Header (`x-cortecs-provider`) statt der Lane — eine Zeile
  // mit diesem Schlüssel entsteht also nur, wenn der Header fehlte.
  //
  // Der Wert ist dann die beste verfügbare Auskunft und keine Erfindung: für
  // `gemma-4-26b-a4b-it`, das einzige Modell dieser Lane, nannte der Header am
  // 21.08.2026 in 8 von 8 Anfragen `scaleway`. Garantiert ist das nicht —
  // dasselbe Modell hat auch einen Endpunkt bei `aki` (Deutschland, 363
  // g/kWh), weshalb der Header überhaupt ausgelesen wird.
  cortecs: 24,
  // Die Unterauftragnehmer, an die Cortecs für unsere Modelle tatsächlich
  // vermittelt — sie und nicht `cortecs` landen in der Buchhaltung, seit
  // `usageModelMiddleware` den Antwort-Header ausliest.
  //
  // infercom bedient `gemma-4-31b-it`, den Primär der `pruefung`-Stufe
  // (10/10 Anfragen am 21.08.2026). Infercom SCS sitzt in Luxemburg und
  // verarbeitet nach der Cortecs-DPA vom 11.08.2026 in DEUTSCHLAND — daher
  // derselbe Wert wie litellm/Hetzner und nicht Scaleways 24.
  infercom: 344, // Deutschland 2025, Umweltbundesamt
  // berget ist der zweite Endpunkt desselben Modells. Der Header NENNT es
  // inzwischen: am 29.08.2026 mit `allowed_providers: ['berget']` erzwungen,
  // HTTP 200, `x-cortecs-provider: berget` (Messung in services/ai/gemmaHosts.ts).
  // Ungefragt wählt der Router weiterhin infercom, im Normalbetrieb bucht diese
  // Zeile also nach wie vor nichts. Der Vorbehalt an der ZAHL bleibt davon
  // unberührt: Berget AI AB (Schweden) gibt als Verarbeitungsort EWR an, ohne
  // ein Land zu nennen; 45 ist Schwedens Wert (Ember 2024) und damit die
  // günstigste Lesart einer unbestimmten Angabe. Erring high wäre die
  // vorsichtigere Wahl — die Zahl steht unter Vorbehalt, bis das Land benannt
  // ist, nicht mehr bis der Header sie nennt.
  berget: 45,
  // Black Forest Labs (image generation) — German mix, and here is the whole
  // chain of what is known and what is not.
  //
  // `api.eu.bfl.ai` is a CNAME onto `azurefd.net`: BFL's own API runs behind
  // Azure Front Door, so the operator is Microsoft and the scope is the EU. But
  // Front Door is the EDGE, not the GPU — the name resolves to a PoP, and the
  // region where inference actually happens stays invisible. Knowing the
  // operator does not get us a region, so no Azure region factor can be applied
  // however tempting the extra precision looks.
  //
  // 250 als MITTE, gewichtet danach, wo Azure in Europa GPU-Kapazitaet
  // tatsaechlich betreibt: West Europe (Niederlande, ~269) traegt die reifste
  // H100-Flotte, Irland (~234) die zweitgroesste; Sweden Central, France
  // Central, Italy North und Poland Central kommen teilweise dazu. Der
  // Schwerpunkt liegt damit bei den Niederlanden und Irland, nicht bei
  // Deutschland — 250 ist deren Umgebung.
  //
  // Vorher stand hier 363 (deutscher Mix) als bewusst unguenstiger Vertreter.
  // Das war innerhalb der plausiblen Menge und insofern verteidigbar, aber es
  // war ein Punkt an einem Ende, und die Spanne — 19,6 (France Central) bis 600
  // (Poland Central), Faktor 30 — blieb dabei unsichtbar. Genau hier ist die
  // Standort-Unsicherheit groesser als jede Mess-Unsicherheit, und sie gehoert
  // deshalb in die Spanne statt in einen Sicherheitszuschlag.
  bfl: 250,
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
 * MARKET-BASED intensities — the SECOND accounting method, reported alongside
 * the location-based one above and never instead of it.
 *
 * The table above answers "what did the grid at that place emit". This one
 * answers "what does the electricity this operator CONTRACTED emit". The GHG
 * Protocol Scope 2 Guidance defines both and requires dual reporting precisely
 * because neither alone is complete: location-based ignores that buying
 * certified renewables is a real act, market-based ignores that the electrons
 * came off a mixed grid.
 *
 * There is nothing to estimate here. Under the market-based method, consumption
 * covered by cancelled certificates carries the emission factor of the
 * contracted generation — zero for certified renewables. So the only question
 * per lane is EVIDENCE, and the bar is a named instrument, not a green
 * self-image:
 *
 *  scaleway/greenpt/cortecs — Guarantee of Origin, stated in Scaleway's Impact Report
 *    2025 alongside its own location-based Scope 2 figure. The strongest case,
 *    and note what Scaleway itself does with it: it holds the GoO AND still
 *    reports location-based. That is the model this table copies.
 *  litellm (Hetzner) — "Wir beziehen 100% des Stroms in Deutschland und
 *    Finnland aus erneuerbaren Energien", and since 2025 an EMAS registration
 *    for Gunzenhausen, Nürnberg and Falkenstein. EMAS is the strongest evidence
 *    of the three because a state-approved verifier checks the declaration;
 *    ISO 14001 and a company blog do not carry that.
 *
 *    BUT THAT STRENGTH IS GERMAN-ONLY. The EMAS scope covers the German sites;
 *    the Finnish park (Tuusula) holds ISO/IEC 27001 — information security, not
 *    environment — and the validated statement names Helsinki only in the
 *    company portrait. Hetzner does state Finland has run on hydropower since
 *    2018, so a Finnish lane would still HAVE an instrument; it would just be a
 *    self-declaration on Seeweb's tier rather than an audited one. Whoever
 *    moves this lane to Finland has to downgrade the strength with it.
 *  regolo (Seeweb) — "Attingiamo energia elettrica solo da fonti rinnovabili
 *    certificate", ISO 14001, named supplier (Enel green), Green Web Foundation
 *    and the Neutral Datacenter Pact. A self-declaration backed by a certified
 *    management system — weaker than EMAS, strong enough to name.
 *
 * DELIBERATELY ABSENT: `bfl`. Its image generation runs behind Azure Front Door
 * and the inference region is invisible to us (see the note in the table
 * above). Microsoft's own renewable purchasing is not ours to claim for a
 * datacenter we cannot even locate, so BFL falls through to the location factor
 * and the two methods converge for it. That asymmetry is the honest outcome,
 * not a gap.
 *
 * Note the scope of that exception: it is per PROVIDER, not "images". Regolo
 * also generates images (Qwen-Image) and serves them from the same Seeweb
 * datacenter as its text lanes, so those DO carry the instrument. Anything
 * treating "the image half" as uniformly instrument-free is wrong — which is
 * exactly the bug that shipped in the frontend's first cut of this feature.
 */
const MARKET_INTENSITY_G_PER_KWH: Readonly<Record<string, number>> = {
  scaleway: 0,
  // KEIN Instrument für mistral: In der Belegliste im Kopf dieses Blocks kommt
  // Mistral nicht vor, und das war kein Versehen der Doku — es gibt keinen. Die
  // Zeile stand hier trotzdem und setzte die Emissionen des Standardmodells am
  // günstigen Ende der Spanne auf null, also genau das „silently inheriting
  // someone else's green power", gegen das `marketIntensityFor` unten
  // argumentiert. Frankreichs Netz ist von sich aus kohlenstoffarm; das ist
  // eine Aussage über das NETZ und gehört nach GRID_INTENSITY_G_PER_KWH, nicht
  // in die Beschaffungsspalte.
  //
  // KEIN Instrument für cortecs: Der Schlüssel entsteht ausschliesslich dann,
  // wenn `x-cortecs-provider` fehlte — also genau dann, wenn wir NICHT wissen,
  // wer gerechnet hat. Er erbte Scaleways Herkunftsnachweis aus einer Messung,
  // die inzwischen überholt ist: die Cortecs-Stufe geht heute an infercom
  // (10/10 am 21.08.2026), und infercom steht aus gutem Grund nicht in dieser
  // Tabelle. Ein Zertifikat an einen unbekannten Unterauftragnehmer zu vererben
  // ist derselbe Fehler wie bei mistral, nur eine Ebene tiefer.
  //
  // KEIN Instrument für infercom und berget: für beide ist uns keine
  // Herkunftsnachweis- oder EMAS-Erklärung bekannt. Sie fehlen hier bewusst
  // und fallen damit auf den Standortfaktor zurück — dieselbe Behandlung wie
  // `bfl`, und aus demselben Grund: ein fremdes Zertifikat ist nicht unseres
  // zu behaupten.
  greenpt: 0,
  litellm: 0,
  regolo: 0,
};

/**
 * Whether this provider has a named instrument behind its market-based factor.
 * Drives the share the API reports, so the UI can say how much of a range rests
 * on evidence rather than on a fallback to the location number.
 */
export function hasMarketInstrument(provider: string): boolean {
  return provider in MARKET_INTENSITY_G_PER_KWH;
}

/** Market-based intensity, falling back to the location factor where no
 *  instrument is documented — so an undocumented lane collapses the range
 *  instead of silently inheriting someone else's green power. */
export function marketIntensityFor(provider: string): number {
  return MARKET_INTENSITY_G_PER_KWH[provider] ?? gridIntensityFor(provider);
}

/**
 * Power Usage Effectiveness. GreenPT states 1.25 and its `impact` figures
 * already include that overhead, so a coefficient carries it too. Hosts with a
 * better PUE get the difference credited back.
 */
const GREENPT_PUE = 1.25;

/**
 * Uptime Institute Global Data Center Survey 2025, European region: 1.50 across
 * 134 datacenters. Used where no operator figure exists.
 *
 * EUROPE, not the global average of the same survey (1.54, n=681) — and the
 * difference is not rounding noise, it is the difference between a guess and an
 * inference. Every provider that lands here is contractually bound to the EEA
 * (Mistral's and Infercom's DPAs, Berget's own statement, BFL's
 * `api.eu.bfl.ai`), so the continent is the one thing we actually know. A
 * global average folds in regions we have ruled out — Middle East and Africa
 * report 1.68 — and pads our own footprint with datacenters nobody could be
 * running on.
 *
 * Both numbers come from the SAME survey year on purpose. The value here used
 * to be 1.56, which is the 2024 global average; pairing that with a 2025
 * regional figure compares two vintages and overstates the gap.
 *
 * Erring high stops where it stops being true.
 */
const EUROPE_PUE = 1.5;
const PUE_BY_PROVIDER: Readonly<Record<string, number>> = {
  // Hetzner, aus der EMAS-Umwelterklärung 2025 (Berichtszeitraum 2022-2024):
  // die Kennzahlentabelle führt „Durchschnittlicher PUE" mit 1,15 / 1,13 / 1,13.
  // 1,13 ist also der geprüfte Wert für 2024.
  //
  // Vorher stand hier 1,12 mit Verweis auf ebendiese Erklärung — die Zahl kommt
  // darin nicht vor (der Fliesstext nennt 1,14, die Tabelle 1,13), und die
  // Produktdoku sagt seit jeher 1,13. Der Code war der Ausreisser.
  //
  // GELTUNGSBEREICH, der beim Nachlesen auffiel: „Der EMAS-Scope der Hetzner
  // Online GmbH umfasst sämtliche DEUTSCHEN Standorte"; internationale
  // Cloud-Standorte sind ausgenommen. Der finnische Park (Tuusula bei
  // Helsinki) ist ISO/IEC 27001 zertifiziert — das ist Informationssicherheit,
  // kein Umweltmanagement — und kommt in der Umwelterklärung nur im
  // Firmenporträt vor, nicht im Geltungsbereich und ohne eigene Stromzahlen.
  //
  // Deshalb gilt auch DIESE 1,13 nur für die deutschen Standorte. Zöge eine
  // Lane nachweislich nach Tuusula, wäre sie ohne geprüften PUE und fiele auf
  // EUROPE_PUE — die Korrektur nach unten beim Netzfaktor käme also mit einer
  // nach oben beim PUE. Eine Ausweitung von EMAS auf Finnland ist öffentlich
  // nicht angekündigt (erster Zyklus läuft bis 2028).
  litellm: 1.13,
  // Seeweb (Regolo's operator). Two sources agree on 1,2: the DHH Group
  // sustainability report 2024, p. 8 ("achieving a PUE below 1,20") and
  // Seeweb's own page. Read the second one carefully though — it says 1,2 is
  // reached "nelle nostre server farm più recenti", so 1,2 is the BEST case of
  // the fleet, not its average. Kept because it is what both sources state,
  // but it is the one PUE here that likely flatters rather than errs high.
  regolo: 1.2,
  // Scaleway Impact Report 2025, p. 25: DC5 runs at PUE 1,25 and "all the
  // servers necessary for artificial intelligence are installed in this data
  // center". Identical to the GreenPT reference, so this is a no-op — stated
  // explicitly so nobody replaces it with Scaleway's 1,375 fleet average, which
  // includes the non-AI sites.
  scaleway: 1.25,
  // Derselbe Standort über den Vermittler — siehe oben.
  cortecs: 1.25,
  // GreenPT selbst. Steht hier als VERÖFFENTLICHTER Wert und nicht als
  // Rückfall, obwohl beide 1,25 ergäben: die GreenPT-Zeilen sind gemessen, ihre
  // Energie trägt genau diesen PUE bereits in sich. Ein Schätzwert an dieser
  // Stelle würde eine Messung nachträglich hochrechnen.
  greenpt: GREENPT_PUE,
  // Kein Eintrag für mistral, infercom und berget — keiner der drei
  // veröffentlicht einen PUE. Sie werden über PUE_ESTIMATE_BY_PROVIDER
  // geschätzt und als geschätzt ausgewiesen, siehe dort.
};

/**
 * PUE-SCHÄTZUNGEN für Anbieter, die keinen veröffentlichen — aus dem STANDORT
 * abgeleitet und über `isPueEstimated` als Schätzung gekennzeichnet.
 *
 * Warum es diese Tabelle überhaupt gibt: `pueFor` fiel vorher auf GREENPT_PUE
 * zurück, also auf Scaleway DC5. Das ist genau der geliehene Fremdwert, den der
 * Kommentar oben auszuschliessen behauptete — und weil `pueFor` den
 * Transparenz-Endpunkt bedient, stand er als „PUE 1,3" neben einem Anbieter, der
 * nie einen genannt hat. Ein erfundener Kennwert ist schlimmer als ein
 * geschätzter, denn nur der geschätzte kann sich als Schätzung zu erkennen
 * geben.
 *
 * Die Richtung ist wie überall sonst: lieber zu hoch. Ein zu niedriger PUE
 * schönt den Fussabdruck, ein zu hoher macht ihn nur unattraktiver.
 */
const PUE_ESTIMATE_BY_PROVIDER: Readonly<Record<string, number>> = {
  // München. Der Standort ist belegt (SambaNova/Infercom-Partnerseite: Munich
  // Datacenter, SambaNova SN40 RDUs, SambaRack bei ~10 kW) — das GEBÄUDE aber
  // nicht, und ein PUE ist eine Eigenschaft des Gebäudes, nicht der Stadt.
  //
  // 1,5 ist deshalb keine Messung, sondern die gesetzliche Obergrenze: das
  // Energieeffizienzgesetz (EnEfG) verlangt von Rechenzentren ab 300 kW, die vor
  // dem 01.07.2026 in Betrieb gingen, ab dem 01.07.2027 einen PUE <= 1,5 und ab
  // dem 01.07.2030 <= 1,3; Neubauten ab dem 01.07.2026 <= 1,2. Wir setzen die
  // Bestandsschwelle an, weil wir das Baujahr nicht kennen. Dass sie zahlgleich
  // mit EUROPE_PUE ist, ist Zufall — die beiden Quellen bewegen sich getrennt,
  // deshalb steht die Zeile trotzdem hier. Ein moderner
  // Münchner Colo liegt real eher bei 1,2-1,4 — die Schätzung ist also bewusst
  // pessimistisch, und das ist bei einer Umweltangabe die richtige Richtung.
  infercom: 1.5,
  // Frankreich ist eine ANNAHME, kein Beleg. Mistrals DPA nennt Frankreich nur
  // als Gerichtsstand und erlaubt Verarbeitung im gesamten EWR; die eigene
  // Zusage lautet „European Union", nicht „Frankreich". Was der DPA hergibt,
  // ist der Kontinent — und genau der ist der Anker.
  //
  // ACHTUNG, hier hängt mehr dran als dieser Wert: dieselbe unbelegte Annahme
  // trägt die 22 g/kWh in GRID_INTENSITY_G_PER_KWH. Wer den Standort klärt,
  // klärt beide Zeilen.
  mistral: EUROPE_PUE,
  // Berget nennt als Verarbeitungsort „EWR" ohne Land. Schwedische
  // Rechenzentren liegen typischerweise deutlich darunter, aber eine ungenannte
  // Angabe wird nicht zugunsten des Anbieters gelesen.
  berget: EUROPE_PUE,
};

export interface Footprint {
  /** Watt-milliseconds, the unit GreenPT reports. */
  energyWms: number;
  /** Micrograms CO2e, LOCATION-based — the headline method. */
  emissionsUg: number;
  /**
   * Micrograms CO2e, MARKET-based. Zero wherever the operator holds a named
   * renewable instrument, equal to `emissionsUg` where it does not. Reported
   * as the other end of a range, never on its own: see
   * MARKET_INTENSITY_G_PER_KWH for why both methods have to appear together.
   */
  marketEmissionsUg: number;
}

/* ------------------------------------------------------------------ images */

/**
 * IMAGE GENERATION — a different measurement lineage from the text lanes above.
 *
 * Nothing in our image stack reports an `impact` object: BFL and Regolo both
 * return an image and nothing else. And GreenPT serves no diffusion model, so
 * the trick that grounds the text table — measure the same model somewhere that
 * meters it — has no counterpart here. The numbers below come from published
 * measurements instead, and every one of them is therefore `basis: 'bound'`.
 *
 * SOURCE — Iyengar, Han, Ruf, Grari, Detyniecki & Ermon, "Energy Scaling Laws
 * for Diffusion Models: Quantifying Compute and Carbon Emissions in Image
 * Generation" (arXiv:2511.17031). They sweep resolution x steps x precision x
 * CFG on an A100 and publish the full grid, which is what makes it usable: we
 * can pick the cell that matches how we actually generate rather than quoting
 * one headline number. At 1024x1024, fp16, CFG on, 50 steps (100 prompts):
 *   Table 3, FLUX.1 [dev] : 1.54e6 J  ->  15 400 J/image = 4.278 Wh
 *   Table 6, Qwen-Image   : 1.29e6 J  ->  12 900 J/image = 3.583 Wh
 * Qwen-Image is the exact model Regolo serves. FLUX.1 [dev] is NOT what BFL
 * serves — see the per-entry notes.
 *
 * BOUNDARY CORRECTION, and why the paper's number cannot be used raw: they
 * measured "GPU power consumption ... via NVIDIA Management Library, with
 * baseline idle power subtracted to isolate inference-specific consumption."
 * That is a strictly narrower boundary than GreenPT's, which the whole text
 * table is calibrated against. Two things are missing and both are real costs:
 *   1. the idle draw they subtracted (an A100 idles at 50-70 W against roughly
 *      250-400 W under diffusion load) — production pays for it either way;
 *   2. everything in the node that is not the GPU die: CPU, RAM, NIC, fans, PSU
 *      conversion loss. Accelerators typically account for ~50-60% of an
 *      inference server's draw.
 * We uplift by x2 to cross that gap. It is a round number and openly a choice,
 * so it is stated rather than buried — and it is the reason the FLUX.1-derived
 * anchor stays plausible for BFL's larger FLUX.2 models.
 *
 * CROSS-CHECK — Scope3 puts a high-quality GPT-4o image at ~5.6 gCO2e. On the
 * US grid (~380 g/kWh) that implies ~14.7 Wh full-stack. Our Flux Pro figure
 * lands at 8.6 Wh IT load, ~10.7 Wh after PUE. Same order of magnitude from a
 * completely independent method, which is all a cross-check can give.
 *
 * NOT INCLUDED: a "what if you had used ChatGPT" counterfactual for images.
 * The text comparison rests on Jegham et al. precisely because its system
 * boundary is spelled out and matches ours; no equivalent exists for DALL-E or
 * GPT-4o image, and pairing a vendor estimate of unstated boundary against a
 * boundary-corrected measurement would undo the care taken everywhere else.
 */
interface ImageEnergy {
  /** Milliwatt-hours per image as METERED at the GPU — before the boundary
   *  uplift and before PUE, both of which the estimator applies. */
  mWhPerImageGpu: number;
  basis: EnergyCoefficients['basis'];
}

/**
 * FLUX.1 [dev] @ 1024x1024 / 50 steps / fp16 / CFG.
 *
 * RESOLUTION CAVEAT, and it only applies to the BFL entries: Regolo snaps
 * everything to 1024x1024, but BFL receives the real dimensions, and our
 * formats run up to 1088x1360 (Instagram) — 1.41x the pixels of the anchor
 * cell. Energy scales roughly with pixel count, so a portrait Flux image costs
 * more than this number says.
 *
 * Not corrected for, because `user_usage_daily` records only a count per model
 * and no resolution: sizing per format would need a schema change first. The
 * gap is smaller than the headroom already in the x2 uplift, and it is named
 * here rather than left to be discovered.
 *
 * Stated GPU-only, i.e. exactly as the paper measured it. The boundary uplift
 * is applied in `estimateImageFootprint` rather than folded in here, so the
 * published measurement stays readable in the table and the same numbers can
 * also produce the LOWER end of a range.
 */
const FLUX_ANCHOR_GPU_MWH = 4278;

/**
 * The correction from the header, as a factor — now a bracket instead of one
 * round number, and DERIVED instead of chosen.
 *
 * The old pair was 1 (low) and 2 (high). Both were wrong in an instructive way.
 * 1 means "the GPU die is the whole cost", which is not a plausible end of
 * anything: the paper subtracted the idle draw a datacenter pays regardless and
 * measured nothing outside the die. And 2 was a round number picked to "cross
 * the gap" rather than derived, so nobody could say whether it crossed it.
 *
 * Two multipliers stack, and each has a published range:
 *
 *   idle that was subtracted — an A100 idles at 50-70 W and draws 250-400 W
 *   under diffusion load, so dynamic power is 200-330 W and the idle the paper
 *   removed is 15-35% on top of what it kept.
 *
 *   the rest of the node — CPU, RAM, NIC, fans, PSU conversion. Accelerators
 *   are typically 50-60% of an inference server's draw, so the node costs
 *   1.67-2.0x the die.
 *
 * Multiplied out: 1.15 x 1.67 = 1.92 at the favourable end, 1.35 x 2.0 = 2.70
 * at the unfavourable one. The middle is again the geometric mean, 2.28.
 *
 * Note where that leaves the old default: 2.0 sits near the BOTTOM of the
 * plausible bracket, not above it. The figure that was described as
 * deliberately conservative was in fact slightly optimistic, and the central
 * estimate moves images UP.
 */
const IMAGE_UPLIFT_LOW = 1.92;
const IMAGE_UPLIFT_HIGH = 2.7;
const IMAGE_UPLIFT_MID = geoMean(IMAGE_UPLIFT_LOW, IMAGE_UPLIFT_HIGH);

function imageUplift(bound: EnergyBound): number {
  if (bound === 'low') return IMAGE_UPLIFT_LOW;
  if (bound === 'high') return IMAGE_UPLIFT_HIGH;
  return IMAGE_UPLIFT_MID;
}

const IMAGE_ENERGY: Readonly<Record<string, ImageEnergy>> = {
  // BFL's three variants scale by their PUBLISHED cost multiplier (catalog.ts:
  // klein 0.5x, pro 1x, max 2x). That is BFL pricing their own compute on their
  // own hardware — a far tighter link to energy than the decode-latency proxy
  // that failed its control for the text lanes, but still a proxy, hence
  // 'bound' throughout. `flux-2-klein-9b` naming its 9B size is a small
  // corroboration: FLUX.1 [dev] carries a 12B DiT, so half the anchor is a
  // sane place for it to sit.
  'flux-2-klein-9b': { mWhPerImageGpu: Math.round(FLUX_ANCHOR_GPU_MWH * 0.5), basis: 'bound' },
  'flux-2-pro': { mWhPerImageGpu: FLUX_ANCHOR_GPU_MWH, basis: 'bound' },
  'flux-2-max': { mWhPerImageGpu: FLUX_ANCHOR_GPU_MWH * 2, basis: 'bound' },
  // Outpainting runs the same generator over a larger canvas; billed like pro.
  'flux-tools/outpainting-v1': { mWhPerImageGpu: FLUX_ANCHOR_GPU_MWH, basis: 'bound' },
  // The one image lane where the paper measured OUR model AT OUR RESOLUTION.
  // `snapToSupportedSize` offers 256/512/1024, but every aspect ratio in
  // FluxPromptBuilder has an edge >= 1024 (square 1024, classic 1152, the rest
  // 1360-1680), so all of them fall through to the 1024 fallback — and the
  // paths that pass no dimensions at all default to 1024 too. In practice the
  // smaller branches are unreachable and EVERY Qwen request is 1024x1024, the
  // exact cell measured. Steps we never override, and Qwen-Image defaults to
  // 50 with CFG, which is the cell as well.
  //
  // So the only soft parts left here are the x2 boundary uplift and Regolo's
  // hardware differing from an A100. That is a far better footing than the
  // Flux entries above — but the uplift alone is our own choice, so this stays
  // 'bound' rather than getting promoted to 'measured'.
  // 3.583 Wh GPU-only.
  'Qwen-Image': { mWhPerImageGpu: 3583, basis: 'bound' },
};

/**
 * PUE for the absolute image figures.
 *
 * The token path applies PUE as a RATIO against GreenPT's 1.25, because the
 * GreenPT coefficients already carry it. The image numbers come from a bare GPU
 * meter and carry no datacenter overhead at all, so here PUE is absolute.
 */
const IMAGE_PUE_BY_PROVIDER: Readonly<Record<string, number>> = {
  regolo: 1.2, // Seeweb, DHH sustainability report 2024, p. 8
};

/**
 * Footprint of generated images. Returns null for a model absent from the
 * table, so a new image backend surfaces as a gap instead of as zero.
 */
export function estimateImageFootprint(params: {
  provider: string;
  model: string;
  images: number;
  /** See `EnergyBound`. Defaults to the central estimate. */
  bound?: EnergyBound;
}): (Footprint & { basis: ImageEnergy['basis'] }) | null {
  const c = IMAGE_ENERGY[params.model];
  if (!c) return null;

  const uplift = imageUplift(params.bound ?? 'mid');
  // Über `pueFor`, damit die Zahl, mit der hier gerechnet wird, dieselbe ist,
  // die der Transparenz-Endpunkt daneben veröffentlicht.
  const pue = pueFor(params.provider, 'images');
  const energyWms = Math.round(c.mWhPerImageGpu * uplift * params.images * pue * WMS_PER_MWH);
  return {
    energyWms,
    emissionsUg: emissionsFromEnergy(
      energyWms,
      gridIntensityFor(params.provider, params.bound ?? 'mid')
    ),
    // Per provider, NOT per unit: collapses onto the location figure for `bfl`
    // (no locatable region) but is zero for Regolo's Qwen-Image, which runs in
    // the same certified datacenter as its text lanes. See the table.
    marketEmissionsUg: emissionsFromEnergy(energyWms, marketIntensityFor(params.provider)),
    basis: c.basis,
  };
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
  const emissionsUg = emissionsFromEnergy(energyWms, REFERENCE_GRID_G_PER_KWH);
  return {
    energyWms,
    emissionsUg,
    // IDENTICAL on purpose. Microsoft buys renewables at scale, but a
    // market-based figure is only legitimate for whoever holds the cancelled
    // certificates, and those are not ours to spend on OpenAI's behalf. So the
    // reference stays location-based in both columns — which is exactly what
    // makes the optimistic end of our range one-sided, and why the UI must
    // label it rather than present it as a like-for-like saving.
    marketEmissionsUg: emissionsUg,
  };
}

/** emissions[ug] = energy[Wms] / 3.6e9 [kWh] * g/kWh * 1e6 */
export function emissionsFromEnergy(energyWms: number, gramsPerKwh: number): number {
  return Math.round((energyWms * gramsPerKwh) / 3600);
}

/**
 * Providers whose LOCATION is uncertain, and by how much.
 *
 * Only two entries, and that is the point: for everybody else we know the
 * country, so low = mid = high and the range carries no width it has not
 * earned. A span here means we genuinely do not know which grid served the
 * request — not that the grid figure itself is fuzzy.
 */
const GRID_SPAN_G_PER_KWH: Readonly<Record<string, { low: number; high: number }>> = {
  // Frankreich (RTE 2025) bis Schweden (Ember) — die beiden Laender, in denen
  // Mistrals angekuendigte Rechenzentren stehen.
  mistral: { low: 19.6, high: 45 },
  // France Central bis Poland Central: die sauberste und die schmutzigste
  // Azure-EU-Region mit KI-Kapazitaet. Faktor 30, und deshalb steht sie da.
  bfl: { low: 19.6, high: 600 },
};

/**
 * Grid intensity for a recorded provider at one end of its span.
 *
 * The fallback for an unrecorded provider is the EU average (213 g/kWh, Ember
 * 2025), not the 350 that stood here before. 350 was chosen as a pessimistic
 * default, but every provider that can reach this line is EEA-bound by
 * contract, so the EU average is the central estimate for exactly the set of
 * grids that remain possible.
 */
export function gridIntensityFor(provider: string, bound: EnergyBound = 'mid'): number {
  const span = GRID_SPAN_G_PER_KWH[provider];
  if (span && bound === 'low') return span.low;
  if (span && bound === 'high') return span.high;
  return GRID_INTENSITY_G_PER_KWH[provider] ?? EU_AVERAGE_G_PER_KWH;
}

/** Whether this provider's grid figure is a span rather than a known country. */
export function hasGridSpan(provider: string): boolean {
  return provider in GRID_SPAN_G_PER_KWH;
}

/**
 * PUE for a recorded provider, absolute. Exposed for the transparency endpoint,
 * which publishes the constants a figure was computed with — a footprint nobody
 * can recompute is a claim, not a disclosure.
 *
 * `kind` matters because the two paths carry datacenter overhead differently:
 * the token coefficients arrive from GreenPT with 1.25 already inside them and
 * are corrected by a RATIO, while the image figures come off a bare GPU meter
 * and get PUE applied absolutely. Both return the real PUE of that datacenter,
 * which is what a reader needs to check the arithmetic — but they come from
 * different tables, and reading the wrong one would publish a constant the
 * number was never computed with.
 */
export function pueFor(provider: string, kind: 'tokens' | 'images' = 'tokens'): number {
  const published = kind === 'images' ? IMAGE_PUE_BY_PROVIDER[provider] : PUE_BY_PROVIDER[provider];
  return published ?? PUE_ESTIMATE_BY_PROVIDER[provider] ?? EUROPE_PUE;
}

/**
 * Whether `pueFor` returned an operator's own published figure or our estimate.
 *
 * Exists so the transparency surface can say which of the two it is printing.
 * A published PUE and a guessed one look identical as a number, and the page
 * that prints them side by side is the one place where that difference has to
 * survive.
 */
export function isPueEstimated(provider: string, kind: 'tokens' | 'images' = 'tokens'): boolean {
  const table = kind === 'images' ? IMAGE_PUE_BY_PROVIDER : PUE_BY_PROVIDER;
  return !(provider in table);
}

/**
 * Which end of the uncertainty to report.
 *
 * THREE ends since 29.08.2026, and `mid` is the default. Before that the
 * default was `high`: an unmetered lane was quoted at the TOP of its plausible
 * span, and the personal usage tab — which computes no range at all — showed
 * that ceiling as if it were a value. A ceiling is a fine thing to publish
 * NEXT TO a figure; it is a bad figure.
 *
 * The change is not a softening. Erring high on every unknown reads as caution
 * but behaves as a second kind of error: it makes the number wrong in a
 * predictable direction, and it hides how wide the real uncertainty is behind a
 * single pessimistic point. What replaces it is the honest shape — a central
 * estimate with both ends published beside it.
 *
 * For lanes with metered coefficients (`basis: 'measured'`) all three ends are
 * equal, which is exactly the property that makes the width of the range
 * meaningful: it narrows as measurement coverage grows.
 */
export type EnergyBound = 'high' | 'mid' | 'low';

/**
 * The span an unmetered text lane sits in, bracketed by GreenPT measurements of
 * the two models that define its size class:
 *
 *   floor   gpt-oss-120b            0.811 mWh/token  (120B, mixture-of-experts)
 *   ceiling mistral-medium-3.5-128b 4.519 mWh/token  (128B, dense)
 *
 * Both are metered, both are ours, and the factor of 5.6 between them is the
 * honest width of "a large model we have not measured". Nothing here is
 * invented: the unknown lanes borrow the bracket, not a guess.
 *
 * The MIDDLE is the geometric mean of the two, not the arithmetic one. The
 * quantity ranges over a factor of 5.6, so it is distributed on a log scale;
 * an arithmetic mean would sit at 2.67, nearer the ceiling than the floor by
 * construction and dragged there by the single dense outlier. The geometric
 * mean sits where "equally far from both anchors" actually is.
 *
 * Derived rather than typed out so the relationship survives a re-measurement:
 * move either anchor and the middle follows.
 */
const BOUND_FLOOR: EnergyCoefficients = {
  mWhPerOutputToken: 0.811,
  mWhPerInputToken: 0.0003,
  mWhFixed: 11.05,
  basis: 'bound',
};

const BOUND_CEILING: EnergyCoefficients = {
  mWhPerOutputToken: 4.519,
  mWhPerInputToken: 0.0287,
  mWhFixed: 13.26,
  basis: 'bound',
};

const BOUND_MID: EnergyCoefficients = {
  mWhPerOutputToken: geoMean(BOUND_FLOOR.mWhPerOutputToken, BOUND_CEILING.mWhPerOutputToken),
  mWhPerInputToken: geoMean(BOUND_FLOOR.mWhPerInputToken, BOUND_CEILING.mWhPerInputToken),
  mWhFixed: geoMean(BOUND_FLOOR.mWhFixed, BOUND_CEILING.mWhFixed),
  basis: 'bound',
};

/** Which of the three bracket points a `bound` text entry is costed at. */
function boundedCoefficients(bound: EnergyBound): EnergyCoefficients {
  if (bound === 'low') return BOUND_FLOOR;
  if (bound === 'high') return BOUND_CEILING;
  return BOUND_MID;
}

/** True when this model has measured coefficients behind it. */
export function hasEnergyCoefficients(model: string): boolean {
  return model in MODEL_ENERGY;
}

/**
 * Estimate the footprint of token usage that carries no measurement.
 *
 * Returns null only for a model missing from the table entirely — a new lane
 * nobody registered. The caller reports those as uncovered rather than valuing
 * them at zero. The returned `basis` distinguishes a metered coefficient from a
 * bracketed one so the API can report both shares.
 */
export function estimateFootprint(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  /** See `EnergyBound`. Defaults to the central estimate. */
  bound?: EnergyBound;
}): (Footprint & { basis: EnergyCoefficients['basis'] }) | null {
  const table = MODEL_ENERGY[params.model];
  if (!table) return null;

  // A metered coefficient has no ends to pick from: only the `bound` rows move
  // across the bracket, so `basis: 'measured'` resolves to itself at all three.
  const c = table.basis === 'bound' ? boundedCoefficients(params.bound ?? 'mid') : table;

  const pueRatio = pueFor(params.provider) / GREENPT_PUE;
  const mWh =
    (c.mWhPerOutputToken * params.outputTokens +
      c.mWhPerInputToken * params.inputTokens +
      c.mWhFixed * params.requests) *
    pueRatio;

  const energyWms = Math.round(mWh * WMS_PER_MWH);
  return {
    energyWms,
    emissionsUg: emissionsFromEnergy(
      energyWms,
      gridIntensityFor(params.provider, params.bound ?? 'mid')
    ),
    marketEmissionsUg: emissionsFromEnergy(energyWms, marketIntensityFor(params.provider)),
    // The LANE's basis, not the variant's: swapping in the floor to draw a range
    // does not turn an unmetered lane into a metered one.
    basis: table.basis,
  };
}
