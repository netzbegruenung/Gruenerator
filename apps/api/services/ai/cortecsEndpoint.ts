/**
 * Where Cortecs' Sky Inference lives.
 *
 * Eigenes Modul aus demselben Grund wie `scalewayEndpoint.ts`: Basis-URL und
 * `/v1`-Behandlung an einer Stelle statt an jedem Aufrufer.
 *
 * Cortecs ist ein ROUTER, kein Rechenzentrum — es vermittelt an Unteranbieter
 * und nennt den gewählten im Antwort-HEADER `x-cortecs-provider` (nicht im
 * Body, obwohl das OpenAPI-Schema ein `provider`-Feld verspricht; gemessen
 * 21.08.2026, der Body führt es nicht). Welcher Unteranbieter ein Modell
 * bedient, ist pro Modell fest: die drei für uns interessanten blieben über
 * `preference` speed/cost/balanced und `eu_native` true/false unverändert.
 */

export const CORTECS_DEFAULT_BASE_URL = 'https://api.cortecs.ai/v1';

/** Die konfigurierte Basis-URL, `/v1` nur angehängt wenn es fehlt — wie
 *  `scalewayBaseUrl()` und LITELLM_BASE_URL. Liest `process.env` statt des
 *  geparsten Moduls, damit Tests die Variable setzen können. */
export function cortecsBaseUrl(): string {
  const configured = process.env.CORTECS_BASE_URL;
  if (!configured) return CORTECS_DEFAULT_BASE_URL;
  return configured.endsWith('/v1') ? configured : `${configured}/v1`;
}
