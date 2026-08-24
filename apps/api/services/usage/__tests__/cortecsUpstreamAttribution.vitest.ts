/**
 * Die Nutzungserfassung muss für die Cortecs-Lane den UPSTREAM buchen, nicht
 * den Lane-Namen.
 *
 * Der Grund ist der CO₂-Koeffizient: `services/usage/energyFootprint.ts`
 * schlägt den Standort über den gebuchten Provider nach, und zwischen Scaleway
 * (Frankreich, 24 g/kWh) und einem deutschen Unterauftragnehmer (363) liegt
 * Faktor 15. Cortecs vermittelt dieselbe Modell-ID an mehrere Endpunkte
 * (`gemma-4-26b-a4b-it` liegt bei scaleway UND aki), die Zuordnung ist also
 * eine Laufzeitwahl — sie steht bei jeder Antwort im Header und wäre sonst
 * verloren.
 *
 * Keiner dieser Pfade ist typisiert: `response.headers` ist `unknown`, ein
 * fehlender Header ist kein Fehler, und ein still auf `cortecs` gebuchter
 * Aufruf sähe genauso aus wie ein korrekt gebuchter.
 */

import { describe, expect, it, vi } from 'vitest';

const gebucht: { provider: string; model: string }[] = [];
const gemessen: { provider: string; model: string }[] = [];

vi.mock('./../UsageTrackingService.js', () => ({
  recordTokenUsage: (row: { provider: string; model: string }) => gebucht.push(row),
}));
vi.mock('../../ai/modelHealth.js', () => ({
  recordModelSample: (row: { provider: string; model: string }) => gemessen.push(row),
}));
vi.mock('../../../utils/usageContext.js', () => ({
  getUsageUserId: () => 'nutzer-1',
  getUsageFeature: () => 'test',
}));

const { withUsageTracking } = await import('../usageModelMiddleware.js');

/** Ein Modell, das eine Antwort mit den übergebenen Headern liefert. */
function modellMitHeadern(headers: unknown) {
  return {
    specificationVersion: 'v3' as const,
    provider: 'cortecs',
    modelId: 'gemma-4-26b-a4b-it',
    supportedUrls: {},
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: 'ok' }],
        finishReason: 'stop' as const,
        usage: { inputTokens: 10, outputTokens: 20 },
        warnings: [],
        response: { headers },
      }),
    doStream: () => Promise.reject(new Error('nicht benutzt')),
  };
}

async function laufen(headers: unknown, provider = 'cortecs') {
  gebucht.length = 0;
  gemessen.length = 0;
  const model = withUsageTracking(
    modellMitHeadern(headers) as unknown as Parameters<typeof withUsageTracking>[0],
    provider
  );
  await (model as { doGenerate: () => Promise<unknown> }).doGenerate();
}

describe('Cortecs-Nutzung wird dem echten Unterauftragnehmer zugeschrieben', () => {
  it('bucht scaleway, wenn der Header das sagt — nicht cortecs', async () => {
    await laufen({ 'x-cortecs-provider': 'scaleway' });
    expect(gebucht[0]?.provider).toBe('scaleway');
  });

  it('lässt die GESUNDHEITSPROBE unter dem Lane-Namen stehen', async () => {
    // Hier stand bis 24.08.2026 `toBe('scaleway')` und hat damit einen Fehler
    // festgeschrieben: die Probe wanderte mit der Buchung auf den Upstream,
    // aber `isModelSlow` (agentPipeline.ts) und `pickHealthyTarget`
    // (modelSiblings.ts) fragen unter `cortecs/<modell>` — der Schlüssel ist
    // `provider/model`. Geschrieben unter `infercom/...`, gelesen unter
    // `cortecs/...`: die Zäh-Erkennung von `heavy` und `pruefung` wäre still
    // tot gewesen, ohne dass irgendetwas rot wird.
    //
    // Die beiden Empfänger wollen verschiedene Dinge, und das ist der Punkt:
    // die Buchhaltung den Standort (CO₂), die Gesundheit die Lane (nur die
    // lässt sich auf den Regolo-Sibling umschalten).
    await laufen({ 'x-cortecs-provider': 'scaleway' });
    expect(gemessen[0]?.provider).toBe('cortecs');
    expect(gebucht[0]?.provider).toBe('scaleway');
  });

  it('bucht den abweichenden Unterauftragnehmer, wenn Cortecs anders vermittelt', async () => {
    // Der Fall, für den das hier überhaupt existiert: dasselbe Modell, anderer
    // Standort, anderer CO₂-Koeffizient.
    await laufen({ 'x-cortecs-provider': 'aki' });
    expect(gebucht[0]?.provider).toBe('aki');
  });

  it('liest den Header auch aus einem Headers-Objekt', async () => {
    await laufen(new Headers({ 'x-cortecs-provider': 'scaleway' }));
    expect(gebucht[0]?.provider).toBe('scaleway');
  });

  it('fällt auf den Lane-Namen zurück, wenn kein Header kam', async () => {
    // `cortecs` ist dann die ehrlichere Auskunft als ein geratener Standort.
    await laufen({});
    expect(gebucht[0]?.provider).toBe('cortecs');
    await laufen(undefined);
    expect(gebucht[0]?.provider).toBe('cortecs');
  });

  it('lässt jede andere Lane unangetastet', async () => {
    // Ein Regolo-Aufruf darf sich von einem fremden Header nicht umbuchen
    // lassen — die Auflösung gilt ausschliesslich für den Router.
    await laufen({ 'x-cortecs-provider': 'scaleway' }, 'regolo');
    expect(gebucht[0]?.provider).toBe('regolo');
  });
});
